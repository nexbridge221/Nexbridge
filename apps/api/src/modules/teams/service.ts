import type { Challenge, Prisma } from "@prisma/client";
import { TEAM_REMINDER_EVERY_HOURS, TEAM_RESPONSE_DEADLINE_HOURS } from "@nexbridge/shared";
import { badRequest, conflict, logger, prisma } from "../../platform/core";
import { notify, notifyMany } from "../notifications/routes";
import { companyUserIds, recordStatus } from "../challenges/helpers";
import { ensureGeneralChannel } from "../nexspace/messaging";
import { DEFAULT_WEIGHTS, type ChallengeInput, type Level, type MatchWeights, type StudentInput } from "../matching/engine";

const HOUR = 3600_000;

/* ======================= Chargement des profils pour le moteur ======================= */
export async function loadMatchWeights(): Promise<MatchWeights> {
  const row = await prisma.systemSetting.findUnique({ where: { key: "nexmatch.weights" } });
  return { ...DEFAULT_WEIGHTS, ...((row?.value as Partial<MatchWeights> | undefined) ?? {}) };
}

export async function loadChallengeInput(challengeId: string): Promise<{ challenge: Challenge; input: ChallengeInput; skillNames: Record<string, string> }> {
  const challenge = await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId }, include: { sector: true, skills: { include: { skill: true } } } });
  return {
    challenge,
    input: { sectorName: challenge.sector?.name ?? null, teamSize: challenge.teamSize, minStudyLevel: challenge.minStudyLevel, durationWeeks: challenge.durationWeeks, skills: challenge.skills.map((s) => ({ skillId: s.skillId, minLevel: s.minLevel as Level, weight: s.weight })) },
    skillNames: Object.fromEntries(challenge.skills.map((s) => [s.skillId, s.skill.name])),
  };
}

/** Étudiants à ne pas (re)proposer pour ce défi : déjà dans une équipe active, ou ayant décliné / laissé expirer. */
export async function excludedStudentIds(challengeId: string): Promise<string[]> {
  const rows = await prisma.teamMember.findMany({
    where: { team: { challengeId }, OR: [{ team: { status: { in: ["EN_VALIDATION", "VALIDEE"] } }, status: { in: ["INVITE", "ACCEPTE"] } }, { status: { in: ["DECLINE", "EXPIRE"] } }] },
    select: { studentId: true },
  });
  return [...new Set(rows.map((r) => r.studentId))];
}

export async function loadStudentInputs(opts: { excludeIds?: string[]; onlyIds?: string[] } = {}): Promise<StudentInput[]> {
  const profiles = await prisma.studentProfile.findMany({
    where: { onboardingDone: true, user: { status: "ACTIF", emailVerifiedAt: { not: null } }, ...(opts.excludeIds?.length ? { id: { notIn: opts.excludeIds } } : {}), ...(opts.onlyIds ? { id: { in: opts.onlyIds } } : {}) },
    include: { program: { select: { name: true } }, skills: true },
    take: 2000,
  });
  const userIds = profiles.map((p) => p.userId);
  const [active, done] = await Promise.all([
    prisma.projectMember.groupBy({ by: ["userId"], where: { userId: { in: userIds }, projectRole: { in: ["ETUDIANT", "CHEF_PROJET"] }, leftAt: null, project: { status: { in: ["PLANIFIE", "EN_COURS"] } } }, _count: true }),
    prisma.projectMember.groupBy({ by: ["userId"], where: { userId: { in: userIds }, projectRole: { in: ["ETUDIANT", "CHEF_PROJET"] }, project: { status: "TERMINE" } }, _count: true }),
  ]);
  const a = new Map(active.map((x) => [x.userId, x._count])), d = new Map(done.map((x) => [x.userId, x._count]));
  return profiles.map((p) => ({
    id: p.id, studyLevel: p.studyLevel, institutionId: p.institutionId, field: p.program?.name.toLowerCase().trim() ?? null, availability: p.availability, sectorPreferences: p.sectorPreferences,
    skills: Object.fromEntries(p.skills.map((s) => [s.skillId, { level: s.level as Level, validated: s.source !== "DECLARE" }])),
    activeProjects: a.get(p.userId) ?? 0, completedProjects: d.get(p.userId) ?? 0, avgRating: p.reliabilityIndex != null ? Number(p.reliabilityIndex) : null, // indice de fiabilité = moyenne des évaluations reçues (aucune note inventée)
  }));
}

/** Données d'affichage (nom, établissement, compétences) pour des profils étudiants. */
export async function describeStudents(ids: string[]) {
  const rows = await prisma.studentProfile.findMany({ where: { id: { in: ids } }, include: { user: { select: { firstName: true, lastName: true } }, institution: { select: { name: true } }, program: { select: { name: true } }, skills: { include: { skill: { select: { name: true } } } } } });
  return new Map(rows.map((r) => [r.id, { studentId: r.id, userId: r.userId, name: `${r.user.firstName} ${r.user.lastName}`, institution: r.institution?.name ?? null, program: r.program?.name ?? null, studyLevel: r.studyLevel, availability: r.availability, city: r.city, skills: r.skills.map((s) => ({ name: s.skill.name, level: s.level, validated: s.source !== "DECLARE" })) }]));
}

/* ======================= Création d'équipe ======================= */
async function academicRequired(studentIds: string[]): Promise<boolean> {
  const insts = await prisma.studentProfile.findMany({ where: { id: { in: studentIds }, institution: { status: "VALIDE", referents: { some: { user: { status: "ACTIF" } } } } }, select: { id: true } });
  return insts.length > 0;
}

export async function createTeam(opts: { challenge: Challenge; origin: "NEXMATCH" | "MANUELLE"; studentIds: string[]; leadId?: string; proposalId?: string; matchRunId?: string; actorId: string }) {
  const { challenge } = opts;
  if (challenge.status !== "PUBLIE") throw conflict("Le défi doit être publié pour constituer une équipe.", "NOT_PUBLISHED");
  if (await prisma.team.count({ where: { challengeId: challenge.id, status: { in: ["EN_VALIDATION", "VALIDEE"] } } })) throw conflict("Une équipe est déjà en cours de validation pour ce défi.", "TEAM_EXISTS");
  const ids = [...new Set(opts.studentIds)];
  if (ids.length < 2 || ids.length > Math.min(8, challenge.teamSize)) throw badRequest(`Une équipe compte entre 2 et ${challenge.teamSize} étudiants.`, "TEAM_SIZE");
  const excluded = new Set(await excludedStudentIds(challenge.id));
  const eligible = await loadStudentInputs({ onlyIds: ids });
  if (eligible.length !== ids.length || ids.some((i) => excluded.has(i))) throw badRequest("Un ou plusieurs étudiants ne sont pas disponibles pour ce défi.", "STUDENT_UNAVAILABLE");
  const lead = opts.leadId && ids.includes(opts.leadId) ? opts.leadId : ids[0]!;
  const needAcademic = await academicRequired(ids);
  const now = new Date();
  const deadline = new Date(now.getTime() + TEAM_RESPONSE_DEADLINE_HOURS * HOUR);

  const team = await prisma.$transaction(async (tx) => {
    const t = await tx.team.create({
      data: {
        challengeId: challenge.id, origin: opts.origin, proposalId: opts.proposalId, matchRunId: opts.matchRunId, createdById: opts.actorId,
        members: { create: ids.map((studentId) => ({ studentId, isLead: studentId === lead, deadlineAt: deadline })) },
        steps: { create: [{ step: "ENTREPRISE", status: "VALIDE", actorId: opts.actorId, decidedAt: now }, { step: "ETUDIANTS", status: "EN_ATTENTE" }, { step: "ACADEMIQUE", status: needAcademic ? "EN_ATTENTE" : "NON_REQUIS" }] },
      },
    });
    if (opts.proposalId) await tx.matchProposal.update({ where: { id: opts.proposalId }, data: { status: "APPROUVEE" } });
    await tx.application.updateMany({ where: { challengeId: challenge.id, studentId: { in: ids } }, data: { status: "PRE_SELECTIONNEE" } });
    return t;
  });
  const members = await prisma.teamMember.findMany({ where: { teamId: team.id }, include: { student: { select: { userId: true } } } });
  await notifyMany(members.map((m) => m.student.userId), { type: "match.invitation", title: "Vous êtes proposé(e) pour un projet", body: `« ${challenge.title} » — confirmez votre participation avant le ${deadline.toLocaleDateString("fr-FR")}.`, link: "/app/candidatures", email: true });
  return team;
}

/* ======================= Réponses des étudiants, remplacement, avancement ======================= */
export async function respondToInvitation(memberId: string, userId: string, accept: boolean) {
  const member = await prisma.teamMember.findUnique({ where: { id: memberId }, include: { student: true, team: { include: { challenge: true } } } });
  if (!member || member.student.userId !== userId) throw badRequest("Invitation introuvable", "NOT_FOUND");
  if (member.team.status !== "EN_VALIDATION" || member.status !== "INVITE") throw conflict("Cette invitation n'est plus valable.", "INVITATION_CLOSED");
  if (member.deadlineAt < new Date()) throw conflict("Le délai de réponse est dépassé.", "INVITATION_EXPIRED");
  await prisma.teamMember.update({ where: { id: member.id }, data: { status: accept ? "ACCEPTE" : "DECLINE", respondedAt: new Date() } });
  const name = (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true } }));
  const companyUsers = await companyUserIds(member.team.challenge.companyId);
  if (accept) {
    await notifyMany(companyUsers, { type: "match.response", title: "Un étudiant a accepté", body: `${name.firstName} ${name.lastName} participera à « ${member.team.challenge.title} ».`, link: `/app/defis/${member.team.challengeId}/nexmatch` });
    await maybeAdvance(member.teamId);
  } else {
    await notifyMany(companyUsers, { type: "match.response", title: "Un étudiant a décliné", body: `${name.firstName} ${name.lastName} ne participera pas à « ${member.team.challenge.title} ».`, link: `/app/defis/${member.team.challengeId}/nexmatch`, email: true });
    await replaceMember(member.teamId, member.id);
    await maybeAdvance(member.teamId);
  }
}

/** Propose automatiquement le suivant du classement NexMatch (CDC §3.3.2). */
export async function replaceMember(teamId: string, leavingMemberId: string): Promise<boolean> {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, include: { challenge: true, members: true } });
  if (team.status !== "EN_VALIDATION") return false;
  const companyUsers = await companyUserIds(team.challenge.companyId);
  let next: string | null = null;
  if (team.matchRunId) {
    const run = await prisma.matchRun.findUnique({ where: { id: team.matchRunId } });
    const ranking = (run?.ranking as { studentId: string; score: number }[] | undefined) ?? [];
    const taken = new Set(team.members.map((m) => m.studentId));
    const excluded = new Set(await excludedStudentIds(team.challengeId));
    for (const r of ranking) {
      if (taken.has(r.studentId) || excluded.has(r.studentId)) continue;
      if ((await loadStudentInputs({ onlyIds: [r.studentId] })).length === 1) { next = r.studentId; break; }
    }
  }
  if (!next) {
    await notifyMany(companyUsers, { type: "match.replacement", title: "Aucun remplaçant automatique disponible", body: "Ajoutez un étudiant manuellement depuis la page NexMatch du défi.", link: `/app/defis/${team.challengeId}/nexmatch`, email: true });
    return false;
  }
  const created = await prisma.teamMember.create({ data: { teamId, studentId: next, deadlineAt: new Date(Date.now() + TEAM_RESPONSE_DEADLINE_HOURS * HOUR) }, include: { student: { select: { userId: true } } } });
  await prisma.teamMember.update({ where: { id: leavingMemberId }, data: { replacedById: created.id } });
  await notify(created.student.userId, { type: "match.invitation", title: "Vous êtes proposé(e) pour un projet", body: `« ${team.challenge.title} » — confirmez votre participation sous ${TEAM_RESPONSE_DEADLINE_HOURS} h.`, link: "/app/candidatures", email: true });
  await notifyMany(companyUsers, { type: "match.replacement", title: "Un remplaçant a été invité", body: "Le suivant du classement NexMatch a été sollicité automatiquement.", link: `/app/defis/${team.challengeId}/nexmatch` });
  return true;
}

export async function addMemberManually(teamId: string, studentId: string, actorId: string) {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, include: { challenge: true, members: true } });
  if (team.status !== "EN_VALIDATION") throw conflict("L'équipe n'est plus en cours de validation.");
  const active = team.members.filter((m) => m.status === "INVITE" || m.status === "ACCEPTE");
  if (active.length >= team.challenge.teamSize) throw conflict("L'équipe est déjà complète.", "TEAM_FULL");
  if ((await excludedStudentIds(team.challengeId)).includes(studentId) || (await loadStudentInputs({ onlyIds: [studentId] })).length !== 1) throw badRequest("Cet étudiant n'est pas disponible pour ce défi.", "STUDENT_UNAVAILABLE");
  const m = await prisma.teamMember.create({ data: { teamId, studentId, deadlineAt: new Date(Date.now() + TEAM_RESPONSE_DEADLINE_HOURS * HOUR) }, include: { student: { select: { userId: true } } } });
  await prisma.teamValidationStep.updateMany({ where: { teamId, step: "ETUDIANTS" }, data: { status: "EN_ATTENTE", decidedAt: null } });
  await notify(m.student.userId, { type: "match.invitation", title: "Vous êtes proposé(e) pour un projet", body: `« ${team.challenge.title} »`, link: "/app/candidatures", email: true });
  await prisma.auditLog.create({ data: { actorId, action: "team.member_added", entityType: "Team", entityId: teamId } });
}

export async function cancelTeam(teamId: string, reason: string) {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, include: { challenge: true, members: { include: { student: { select: { userId: true } } } } } });
  if (team.status !== "EN_VALIDATION") throw conflict("Seule une équipe en cours de validation peut être annulée.");
  await prisma.team.update({ where: { id: teamId }, data: { status: "ANNULEE" } });
  await prisma.application.updateMany({ where: { challengeId: team.challengeId, status: "PRE_SELECTIONNEE" }, data: { status: "SOUMISE" } });
  await notifyMany(team.members.filter((m) => m.status === "INVITE" || m.status === "ACCEPTE").map((m) => m.student.userId), { type: "match.cancelled", title: "La proposition d'équipe a été annulée", body: `« ${team.challenge.title} » : ${reason}`, link: "/app/candidatures" });
}

/** Fait progresser le workflow : étudiants → (référent) → lancement officiel. */
export async function maybeAdvance(teamId: string) {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, include: { members: { include: { student: { select: { userId: true, institutionId: true } } } }, steps: true, challenge: true } });
  if (team.status !== "EN_VALIDATION") return;
  if (team.members.some((m) => m.status === "INVITE")) return;
  const accepted = team.members.filter((m) => m.status === "ACCEPTE");
  if (accepted.length < 2) return; // il faut au moins 2 étudiants : l'entreprise doit en ajouter
  await prisma.teamValidationStep.updateMany({ where: { teamId, step: "ETUDIANTS", status: { not: "VALIDE" } }, data: { status: "VALIDE", decidedAt: new Date() } });
  const academic = team.steps.find((s) => s.step === "ACADEMIQUE");
  if (academic?.status === "EN_ATTENTE") {
    const instIds = [...new Set(accepted.map((m) => m.student.institutionId).filter(Boolean))] as string[];
    const referents = await prisma.referentProfile.findMany({ where: { institutionId: { in: instIds }, institution: { status: "VALIDE" }, user: { status: "ACTIF" } }, select: { userId: true } });
    await notifyMany(referents.map((r) => r.userId), { type: "match.academic", title: "Un projet attend votre validation académique", body: `« ${team.challenge.title} »`, link: "/app/academique/validations", email: true });
    return;
  }
  await launchProject(teamId);
}

export async function launchProject(teamId: string) {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, include: { challenge: true, members: { include: { student: { select: { userId: true } } } }, project: true } });
  if (team.project || team.status === "VALIDEE") return team.project;
  const accepted = team.members.filter((m) => m.status === "ACCEPTE");
  const ch = team.challenge;
  const start = ch.desiredStart && ch.desiredStart > new Date() ? ch.desiredStart : new Date();
  const end = ch.durationWeeks ? new Date(start.getTime() + ch.durationWeeks * 7 * 24 * HOUR) : null;
  const companyUsers = await companyUserIds(ch.companyId);
  const lead = accepted.find((m) => m.isLead) ?? accepted[0]!;
  const project = await prisma.$transaction(async (tx) => {
    await tx.team.update({ where: { id: teamId }, data: { status: "VALIDEE" } });
    const p = await tx.project.create({
      data: {
        challengeId: ch.id, teamId, companyId: ch.companyId, name: ch.title, description: ch.context, status: "EN_COURS", startDate: start, plannedEndDate: end, budgetAmount: ch.budgetAmount, budgetCurrency: ch.budgetCurrency, lastActivityAt: new Date(),
        members: { create: [...companyUsers.map((userId) => ({ userId, projectRole: "CONTACT_ENTREPRISE" as const })), ...accepted.map((m) => ({ userId: m.student.userId, projectRole: m.id === lead.id ? ("CHEF_PROJET" as const) : ("ETUDIANT" as const) }))] },
        escrow: { create: { currency: ch.budgetCurrency } }, // NON_DEPOSE : aucun flux d'argent (phase 5)
      },
    });
    await tx.challenge.update({ where: { id: ch.id }, data: { status: "EN_COURS" } });
    await tx.application.updateMany({ where: { challengeId: ch.id, studentId: { in: accepted.map((m) => m.studentId) } }, data: { status: "ACCEPTEE" } });
    await tx.application.updateMany({ where: { challengeId: ch.id, status: { in: ["SOUMISE", "PRE_SELECTIONNEE"] } }, data: { status: "REFUSEE" } });
    return p;
  });
  // NexSpace : jalons et livrables définis dans le brief, canal général de discussion.
  const [defMilestones, defDeliverables] = await Promise.all([prisma.challengeMilestone.findMany({ where: { challengeId: ch.id } }), prisma.challengeDeliverable.findMany({ where: { challengeId: ch.id } })]);
  const msByWeek = new Map<number, string>();
  for (const m of defMilestones) { const row = await prisma.milestone.create({ data: { projectId: project.id, title: m.title, description: m.description, targetDate: new Date(start.getTime() + m.targetWeek * 7 * 24 * HOUR) } }); msByWeek.set(m.targetWeek, row.id); }
  const finalMs = defMilestones.length ? msByWeek.get(Math.max(...defMilestones.map((m) => m.targetWeek))) : undefined;
  for (const d of defDeliverables) await prisma.deliverable.create({ data: { projectId: project.id, name: d.title, description: d.description, expectedFormat: d.format, dueDate: end, milestoneId: finalMs ?? null } });
  await ensureGeneralChannel(project.id);
  await prisma.activityEvent.create({ data: { projectId: project.id, actorId: null, type: "project.launched", label: "Projet lancé : l'espace de travail est ouvert" } });
  await recordStatus(ch.id, "PUBLIE", "EN_COURS", null, "Équipe validée : lancement officiel du projet");
  await notifyMany([...companyUsers, ...accepted.map((m) => m.student.userId)], { type: "project.launched", title: "Le projet est lancé", body: `« ${ch.title} » : l'équipe est validée. L'espace de travail NexSpace arrive avec la phase 3.`, link: "/app/bientot/projets", email: true });
  logger.info({ projectId: project.id }, "Projet lancé");
  return project;
}

export async function academicDecide(referentUserId: string, teamId: string, decision: "VALIDE" | "REFUSE", comment?: string) {
  const ref = await prisma.referentProfile.findUnique({ where: { userId: referentUserId }, include: { institution: true } });
  if (!ref || ref.institution.status !== "VALIDE") throw badRequest("Votre établissement n'est pas encore validé.", "INSTITUTION_NOT_VALIDATED");
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { challenge: true, steps: true, members: { include: { student: { select: { institutionId: true } } } } } });
  const step = team?.steps.find((s) => s.step === "ACADEMIQUE");
  if (!team || team.status !== "EN_VALIDATION" || step?.status !== "EN_ATTENTE" || !team.members.some((m) => m.status === "ACCEPTE" && m.student.institutionId === ref.institutionId)) throw badRequest("Validation introuvable", "NOT_FOUND");
  await prisma.teamValidationStep.update({ where: { id: step.id }, data: { status: decision, actorId: referentUserId, comment, decidedAt: new Date() } });
  if (decision === "VALIDE") await maybeAdvance(teamId);
  else {
    await prisma.team.update({ where: { id: teamId }, data: { status: "ANNULEE" } });
    await notifyMany(await companyUserIds(team.challenge.companyId), { type: "match.academic", title: "Validation académique refusée", body: comment, link: `/app/defis/${team.challengeId}/nexmatch`, email: true });
  }
}

/* ======================= Échéances : relances /24 h, expiration à 72 h ======================= */
export async function processTeamDeadlines(now = new Date()): Promise<{ expired: number; reminded: number }> {
  const pending = await prisma.teamMember.findMany({ where: { status: "INVITE", team: { status: "EN_VALIDATION" } }, include: { student: { select: { userId: true } }, team: { include: { challenge: { select: { title: true } } } } } });
  let expired = 0, reminded = 0;
  for (const m of pending) {
    if (m.deadlineAt <= now) {
      await prisma.teamMember.update({ where: { id: m.id }, data: { status: "EXPIRE" } });
      await notify(m.student.userId, { type: "match.expired", title: "Délai de réponse dépassé", body: `L'invitation pour « ${m.team.challenge.title} » a expiré.`, link: "/app/candidatures" });
      await replaceMember(m.teamId, m.id);
      await maybeAdvance(m.teamId);
      expired++;
    } else if (now.getTime() - (m.lastReminderAt ?? m.invitedAt).getTime() >= TEAM_REMINDER_EVERY_HOURS * HOUR) {
      const hoursLeft = Math.max(1, Math.round((m.deadlineAt.getTime() - now.getTime()) / HOUR));
      await notify(m.student.userId, { type: "match.reminder", title: "Rappel : confirmez votre participation", body: `« ${m.team.challenge.title} » — il vous reste environ ${hoursLeft} h pour répondre.`, link: "/app/candidatures", email: true });
      await prisma.teamMember.update({ where: { id: m.id }, data: { lastReminderAt: now } });
      reminded++;
    }
  }
  return { expired, reminded };
}

export type { Prisma };

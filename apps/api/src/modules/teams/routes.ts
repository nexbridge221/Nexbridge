import { Router } from "express";
import { z } from "zod";
import { academicDecisionSchema, applicationSchema, manualTeamSchema, teamRespondSchema } from "@nexbridge/shared";
import { badRequest, conflict, notFound, prisma } from "../../platform/core";
import { audit, authenticate, requirePermission, requireRoles, requireVerifiedEmail, validateBody, validateQuery } from "../../platform/http";
import { loadOwnChallenge } from "../challenges/helpers";
import { notifyMany } from "../notifications/routes";
import { companyUserIds } from "../challenges/helpers";
import { ENGINE_VERSION, RulesEngine, scoreStudent } from "../matching/engine";
import { addMemberManually, academicDecide, cancelTeam, createTeam, describeStudents, excludedStudentIds, loadChallengeInput, loadMatchWeights, loadStudentInputs, respondToInvitation } from "./service";

/* =========================================================================
   Entreprise : candidatures reçues, candidats, NexMatch, équipe
   ========================================================================= */
export const matchRouter = Router();
matchRouter.use(authenticate, requireRoles("ENTREPRISE"));

matchRouter.get("/:id/applications", async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  const { input } = await loadChallengeInput(challenge.id);
  const apps = await prisma.application.findMany({ where: { challengeId: challenge.id }, orderBy: { createdAt: "asc" } });
  const students = await loadStudentInputs({ onlyIds: apps.map((a) => a.studentId) });
  const weights = await loadMatchWeights();
  const info = await describeStudents(apps.map((a) => a.studentId));
  res.json({ applications: apps.map((a) => { const s = students.find((x) => x.id === a.studentId); return { id: a.id, status: a.status, source: a.source, motivation: a.motivation, createdAt: a.createdAt, student: info.get(a.studentId) ?? null, score: s ? scoreStudent(s, input, weights).score : null }; }) });
});

/** Parcourir les profils disponibles (mode manuel), avec score indicatif. */
matchRouter.get("/:id/candidates", async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  const q = validateQuery(z.object({ q: z.string().trim().max(60).optional(), limit: z.coerce.number().int().min(1).max(60).default(30) }), req.query);
  const { input } = await loadChallengeInput(challenge.id);
  const [students, weights, applied] = await Promise.all([loadStudentInputs({ excludeIds: await excludedStudentIds(challenge.id) }), loadMatchWeights(), prisma.application.findMany({ where: { challengeId: challenge.id }, select: { studentId: true } })]);
  const appliedSet = new Set(applied.map((a) => a.studentId));
  const info = await describeStudents(students.map((s) => s.id));
  const scored = students.map((s) => ({ s, sc: scoreStudent(s, input, weights) })).sort((a, b) => b.sc.score - a.sc.score);
  const out = scored.map(({ sc }) => ({ ...info.get(sc.studentId)!, score: sc.score, applied: appliedSet.has(sc.studentId) })).filter((c) => !q.q || `${c.name} ${c.institution ?? ""} ${c.program ?? ""} ${c.skills.map((k) => k.name).join(" ")}`.toLowerCase().includes(q.q.toLowerCase()));
  res.json({ candidates: out.slice(0, q.limit), total: out.length });
});

async function proposalsView(runId: string) {
  const run = await prisma.matchRun.findUniqueOrThrow({ where: { id: runId }, include: { proposals: { orderBy: { rank: "asc" }, include: { members: true } } } });
  const info = await describeStudents(run.proposals.flatMap((p) => p.members.map((m) => m.studentId)));
  return {
    run: { id: run.id, engine: run.engine, engineVersion: run.engineVersion, weights: run.weights, durationMs: run.durationMs, createdAt: run.createdAt, poolSize: (run.ranking as unknown[]).length },
    proposals: run.proposals.map((p) => ({ id: p.id, rank: p.rank, totalScore: p.totalScore, diversityScore: p.diversityScore, status: p.status, explanation: p.explanation, members: p.members.map((m) => ({ ...info.get(m.studentId)!, score: m.score, skillScores: m.skillScores, penalties: m.penalties })) })),
  };
}

matchRouter.post("/:id/match", requirePermission("match:run"), validateBody(z.object({ onlyApplicants: z.boolean().default(false) })), async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  if (challenge.status !== "PUBLIE") throw conflict("NexMatch s'applique aux défis publiés.", "NOT_PUBLISHED");
  if (await prisma.team.count({ where: { challengeId: challenge.id, status: { in: ["EN_VALIDATION", "VALIDEE"] } } })) throw conflict("Une équipe est déjà en cours de validation pour ce défi.", "TEAM_EXISTS");
  const t0 = Date.now();
  const { input, skillNames } = await loadChallengeInput(challenge.id);
  if (input.skills.length === 0) throw badRequest("Le défi ne comporte aucune compétence requise : le matching est impossible.", "NO_SKILLS");
  const weights = await loadMatchWeights();
  let onlyIds: string[] | undefined;
  if (req.body.onlyApplicants) onlyIds = (await prisma.application.findMany({ where: { challengeId: challenge.id, status: { in: ["SOUMISE", "PRE_SELECTIONNEE"] } }, select: { studentId: true } })).map((a) => a.studentId);
  const excluded = await excludedStudentIds(challenge.id);
  const students = await loadStudentInputs({ excludeIds: excluded, ...(onlyIds ? { onlyIds: onlyIds.filter((i) => !excluded.includes(i)) } : {}) });
  const result = RulesEngine.propose(students, input, skillNames, weights);
  const run = await prisma.matchRun.create({
    data: {
      challengeId: challenge.id, engine: RulesEngine.name, engineVersion: ENGINE_VERSION, weights: weights as object, ranking: result.ranking as object, durationMs: Date.now() - t0, createdById: req.auth!.id,
      proposals: { create: result.proposals.map((p) => ({ rank: p.rank, totalScore: p.totalScore, diversityScore: p.diversityScore, explanation: { ...p.explanation, coverage: p.coverage, avgIndividual: p.avgIndividual, fields: p.fields, incomplete: p.incomplete } as object, members: { create: p.members.map((m) => ({ studentId: m.studentId, score: m.score, skillScores: m.skillScores as object, penalties: m.penalties as object })) } })) },
    },
  });
  await audit(req, "match.run", { entityType: "Challenge", entityId: challenge.id, metadata: { pool: result.poolSize, proposals: result.proposals.length } });
  res.status(201).json({ ...(await proposalsView(run.id)), message: result.proposals.length === 0 ? "Pas assez de profils disponibles pour proposer une équipe (2 minimum)." : undefined });
});

matchRouter.get("/:id/match/latest", async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  const run = await prisma.matchRun.findFirst({ where: { challengeId: challenge.id }, orderBy: { createdAt: "desc" } });
  res.json(run ? await proposalsView(run.id) : { run: null, proposals: [] });
});

/** Équipe la plus récente du défi (avec étapes de validation et statut de chaque membre). */
matchRouter.get("/:id/team", async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  const team = await prisma.team.findFirst({ where: { challengeId: challenge.id }, orderBy: { createdAt: "desc" }, include: { members: { orderBy: { invitedAt: "asc" } }, steps: true, project: { select: { id: true, status: true } } } });
  if (!team) return void res.json({ team: null });
  const info = await describeStudents(team.members.map((m) => m.studentId));
  res.json({ team: { id: team.id, origin: team.origin, status: team.status, createdAt: team.createdAt, steps: team.steps.map((s) => ({ step: s.step, status: s.status, comment: s.comment, decidedAt: s.decidedAt })), project: team.project, members: team.members.map((m) => ({ id: m.id, isLead: m.isLead, status: m.status, deadlineAt: m.deadlineAt, respondedAt: m.respondedAt, replaced: Boolean(m.replacedById), student: info.get(m.studentId) })) } });
});

matchRouter.post("/:id/proposals/:pid/approve", requirePermission("team:validate:company"), async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  const proposal = await prisma.matchProposal.findFirst({ where: { id: String(req.params.pid), matchRun: { challengeId: challenge.id } }, include: { members: true, matchRun: true } });
  if (!proposal) throw notFound("Proposition introuvable");
  if (proposal.status !== "PROPOSEE") throw conflict("Cette proposition n'est plus disponible.");
  const lead = [...proposal.members].sort((a, b) => b.score - a.score)[0]!;
  const team = await createTeam({ challenge, origin: "NEXMATCH", studentIds: proposal.members.map((m) => m.studentId), leadId: lead.studentId, proposalId: proposal.id, matchRunId: proposal.matchRunId, actorId: req.auth!.id });
  await prisma.matchProposal.updateMany({ where: { matchRunId: proposal.matchRunId, id: { not: proposal.id }, status: "PROPOSEE" }, data: { status: "ECARTEE" } });
  await audit(req, "team.created", { entityType: "Team", entityId: team.id, metadata: { origin: "NEXMATCH" } });
  res.status(201).json({ teamId: team.id });
});

matchRouter.post("/:id/teams", requirePermission("team:validate:company"), validateBody(manualTeamSchema), async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  const team = await createTeam({ challenge, origin: "MANUELLE", studentIds: req.body.studentIds, leadId: req.body.leadId, actorId: req.auth!.id });
  await audit(req, "team.created", { entityType: "Team", entityId: team.id, metadata: { origin: "MANUELLE" } });
  res.status(201).json({ teamId: team.id });
});

/* Gestion d'une équipe en cours de validation (entreprise) */
export const teamRouter = Router();
teamRouter.use(authenticate, requireRoles("ENTREPRISE"));
async function ownTeam(userId: string, teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { challenge: true } });
  if (!team) throw notFound("Équipe introuvable");
  await loadOwnChallenge(userId, team.challengeId);
  return team;
}
teamRouter.post("/:id/cancel", validateBody(z.object({ reason: z.string().trim().min(3).max(300).default("Annulée par l'entreprise") })), async (req, res) => {
  const team = await ownTeam(req.auth!.id, String(req.params.id));
  await cancelTeam(team.id, req.body.reason);
  await audit(req, "team.cancelled", { entityType: "Team", entityId: team.id });
  res.json({ ok: true });
});
teamRouter.post("/:id/members", validateBody(z.object({ studentId: z.string().uuid() })), async (req, res) => {
  const team = await ownTeam(req.auth!.id, String(req.params.id));
  await addMemberManually(team.id, req.body.studentId, req.auth!.id);
  res.status(201).json({ ok: true });
});

/* =========================================================================
   Étudiant : candidatures et invitations d'équipe
   ========================================================================= */
export const applicationRouter = Router();
applicationRouter.use(authenticate, requireRoles("ETUDIANT"));

applicationRouter.post("/challenge/:challengeId", requireVerifiedEmail, requirePermission("application:create"), validateBody(applicationSchema), async (req, res) => {
  const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: req.auth!.id } });
  if (!profile.onboardingDone) throw badRequest("Complétez votre profil avant de candidater.", "PROFILE_INCOMPLETE");
  const challenge = await prisma.challenge.findUnique({ where: { id: String(req.params.challengeId) }, include: { company: { select: { id: true } } } });
  if (!challenge || challenge.status !== "PUBLIE") throw notFound("Ce défi n'accepte plus de candidatures.");
  if (await prisma.application.findUnique({ where: { challengeId_studentId: { challengeId: challenge.id, studentId: profile.id } } })) throw conflict("Vous avez déjà candidaté à ce défi.", "ALREADY_APPLIED");
  if ((await excludedStudentIds(challenge.id)).includes(profile.id)) throw conflict("Vous ne pouvez pas candidater à ce défi.", "NOT_ELIGIBLE");
  const app = await prisma.application.create({ data: { challengeId: challenge.id, studentId: profile.id, motivation: req.body.motivation } });
  await notifyMany(await companyUserIds(challenge.companyId), { type: "challenge.application", title: "Nouvelle candidature", body: `Un étudiant a candidaté à « ${challenge.title} ».`, link: `/app/defis/${challenge.id}` });
  res.status(201).json({ application: app });
});

applicationRouter.get("/", async (req, res) => {
  const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: req.auth!.id } });
  const rows = await prisma.application.findMany({ where: { studentId: profile.id }, orderBy: { createdAt: "desc" }, include: { challenge: { select: { id: true, title: true, slug: true, status: true, company: { select: { legalName: true } } } } } });
  res.json({ applications: rows.map((a) => ({ id: a.id, status: a.status, source: a.source, createdAt: a.createdAt, challenge: { id: a.challenge.id, title: a.challenge.title, slug: a.challenge.slug, status: a.challenge.status, company: a.challenge.company.legalName } })) });
});

applicationRouter.delete("/:id", async (req, res) => {
  const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: req.auth!.id } });
  const app = await prisma.application.findFirst({ where: { id: String(req.params.id), studentId: profile.id } });
  if (!app) throw notFound("Candidature introuvable");
  if (!["SOUMISE", "PRE_SELECTIONNEE"].includes(app.status)) throw conflict("Cette candidature ne peut plus être retirée.");
  await prisma.application.update({ where: { id: app.id }, data: { status: "RETIREE" } });
  res.status(204).end();
});

applicationRouter.get("/invitations", async (req, res) => {
  const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: req.auth!.id } });
  const rows = await prisma.teamMember.findMany({
    where: { studentId: profile.id, OR: [{ status: "INVITE", team: { status: "EN_VALIDATION" } }, { status: { in: ["ACCEPTE", "DECLINE", "EXPIRE"] } }] },
    orderBy: { invitedAt: "desc" }, take: 30,
    include: { team: { include: { challenge: { select: { id: true, title: true, durationWeeks: true, company: { select: { legalName: true } } } }, steps: true, project: { select: { id: true } }, _count: { select: { members: true } } } } },
  });
  res.json({ invitations: rows.map((m) => ({ id: m.id, status: m.status, deadlineAt: m.deadlineAt, respondedAt: m.respondedAt, isLead: m.isLead, teamStatus: m.team.status, steps: m.team.steps.map((s) => ({ step: s.step, status: s.status })), hasProject: Boolean(m.team.project), challenge: { id: m.team.challenge.id, title: m.team.challenge.title, durationWeeks: m.team.challenge.durationWeeks, company: m.team.challenge.company.legalName }, teamSize: m.team._count.members })) });
});

applicationRouter.post("/invitations/:memberId/respond", validateBody(teamRespondSchema), async (req, res) => {
  await respondToInvitation(String(req.params.memberId), req.auth!.id, req.body.accept);
  await audit(req, req.body.accept ? "team.accepted" : "team.declined", { entityType: "TeamMember", entityId: String(req.params.memberId) });
  res.json({ ok: true });
});

/* =========================================================================
   Référent académique : validation des équipes de son établissement
   ========================================================================= */
export const academicRouter = Router();
academicRouter.use(authenticate, requireRoles("REFERENT_ACADEMIQUE"));

academicRouter.get("/validations", async (req, res) => {
  const ref = await prisma.referentProfile.findUnique({ where: { userId: req.auth!.id }, include: { institution: true } });
  if (!ref) return void res.json({ institution: null, validations: [] });
  const teams = ref.institution.status !== "VALIDE" ? [] : await prisma.team.findMany({
    where: { status: "EN_VALIDATION", steps: { some: { step: "ACADEMIQUE", status: "EN_ATTENTE" } }, members: { some: { status: "ACCEPTE", student: { institutionId: ref.institutionId } } } },
    include: { challenge: { select: { id: true, title: true, durationWeeks: true, company: { select: { legalName: true } } } }, members: { where: { status: "ACCEPTE" }, include: { student: { include: { user: { select: { firstName: true, lastName: true } }, program: { select: { name: true } } } } } } },
  });
  res.json({ institution: { id: ref.institution.id, name: ref.institution.name, status: ref.institution.status }, validations: teams.map((t) => ({ teamId: t.id, challenge: { title: t.challenge.title, company: t.challenge.company.legalName, durationWeeks: t.challenge.durationWeeks }, students: t.members.filter((m) => m.student.institutionId === ref.institutionId).map((m) => ({ name: `${m.student.user.firstName} ${m.student.user.lastName}`, program: m.student.program?.name ?? null, studyLevel: m.student.studyLevel })) })) });
});

academicRouter.post("/validations/:teamId/decide", requirePermission("team:validate:academic"), validateBody(academicDecisionSchema), async (req, res) => {
  await academicDecide(req.auth!.id, String(req.params.teamId), req.body.decision, req.body.comment);
  await audit(req, `academic.${req.body.decision.toLowerCase()}`, { entityType: "Team", entityId: String(req.params.teamId) });
  res.json({ ok: true });
});

import { randomBytes } from "node:crypto";
import type { EvaluationType, Prisma, SkillLevel } from "@prisma/client";
import { CERTIFICATION_MIN_PROJECTS, LEADER_MIN_PROJECTS, SECTOR_BADGE_MIN_PROJECTS, TOP_PERFORMER_THRESHOLD } from "@nexbridge/shared";
import { config } from "../../config";
import { logger, prisma, randomToken, sha256, slugify } from "../../platform/core";
import { saveUpload } from "../../platform/storage";
import { notifyMany } from "../notifications/routes";
import { adminUserIds, recordStatus } from "../challenges/helpers";
import { buildAttestationPdf } from "./attestation";

const LEVELS: SkillLevel[] = ["SENSIBILISE", "PRATICIEN", "CONFIRME", "EXPERT"];
const maxLevel = (a: SkillLevel, b: SkillLevel) => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b);
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

export interface Requirement { type: EvaluationType; evaluatorIds: string[]; subjectUserId: string | null; subjectName: string | null; done: boolean }

/** Évaluations OBLIGATOIRES pour clore un projet (celles de type PAIR / ETUDIANT_MENTOR restent facultatives). */
export async function requirements(projectId: string): Promise<Requirement[]> {
  const members = await prisma.projectMember.findMany({ where: { projectId, leftAt: null }, include: { user: { select: { id: true, firstName: true, lastName: true } } } });
  const company = members.filter((m) => m.projectRole === "CONTACT_ENTREPRISE").map((m) => m.userId);
  const mentors = members.filter((m) => m.projectRole === "MENTOR").map((m) => m.userId);
  const students = members.filter((m) => m.projectRole === "ETUDIANT" || m.projectRole === "CHEF_PROJET");
  const evals = await prisma.evaluation.findMany({ where: { projectId } });
  const done = (type: EvaluationType, evaluators: string[], subject: string | null) => evals.some((e) => e.type === type && evaluators.includes(e.evaluatorId) && (e.subjectUserId ?? null) === subject);
  const out: Requirement[] = [{ type: "ENTREPRISE_PROJET", evaluatorIds: company, subjectUserId: null, subjectName: null, done: done("ENTREPRISE_PROJET", company, null) }];
  for (const s of students) {
    out.push({ type: "ENTREPRISE_ETUDIANT", evaluatorIds: company, subjectUserId: s.userId, subjectName: fullName(s.user), done: done("ENTREPRISE_ETUDIANT", company, s.userId) });
    if (mentors.length) out.push({ type: "MENTOR_ETUDIANT", evaluatorIds: mentors, subjectUserId: s.userId, subjectName: fullName(s.user), done: done("MENTOR_ETUDIANT", mentors, s.userId) });
    out.push({ type: "ETUDIANT_EXPERIENCE", evaluatorIds: [s.userId], subjectUserId: null, subjectName: null, done: done("ETUDIANT_EXPERIENCE", [s.userId], null) });
  }
  return out;
}

/** Ouvre la phase d'évaluation : crée les validations académiques attendues. */
export async function openEvaluation(projectId: string) {
  const students = await prisma.projectMember.findMany({ where: { projectId, leftAt: null, projectRole: { in: ["ETUDIANT", "CHEF_PROJET"] } }, include: { user: { select: { studentProfile: { select: { id: true, institution: { select: { status: true, referents: { select: { id: true, user: { select: { status: true } } } } } } } } } } } });
  for (const m of students) {
    const sp = m.user.studentProfile; if (!sp) continue;
    const inst = sp.institution;
    if (inst?.status === "VALIDE" && inst.referents.some((r) => r.user.status === "ACTIF")) await prisma.academicValidation.upsert({ where: { projectId_studentId: { projectId, studentId: sp.id } }, create: { projectId, studentId: sp.id }, update: {} });
  }
}

export async function tryFinalize(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { challenge: { include: { sector: true } } } });
  if (!project || project.status !== "EN_EVALUATION") return false;
  if ((await requirements(projectId)).some((r) => !r.done)) return false;
  if (await prisma.academicValidation.count({ where: { projectId, status: "EN_ATTENTE" } })) return false;
  // Verrou optimiste : un seul appelant finalise.
  const lock = await prisma.project.updateMany({ where: { id: projectId, status: "EN_EVALUATION" }, data: { status: "TERMINE", closedAt: new Date() } });
  if (lock.count !== 1) return false;

  const students = await prisma.projectMember.findMany({ where: { projectId, leftAt: null, projectRole: { in: ["ETUDIANT", "CHEF_PROJET"] } }, include: { user: { include: { studentProfile: { include: { institution: true } } } } } });
  const evals = await prisma.evaluation.findMany({ where: { projectId, hidden: false }, include: { skills: { include: { skill: true } } } });
  const adopted = evals.some((e) => e.type === "ENTREPRISE_PROJET" && (e.criteria as { adopted?: boolean } | null)?.adopted === true);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: project.companyId } });
  const end = new Date();

  const def = (code: string, name: string, description: string, type: "COMPETENCE" | "EXCELLENCE" | "SECTORIEL", extra: { skillId?: string; sectorName?: string } = {}) =>
    prisma.badgeDefinition.upsert({ where: { code }, create: { code, name, description, type, ...extra }, update: {} });
  const award = async (badgeId: string, studentId: string, evidence: object, email: string) => {
    const salt = randomBytes(8).toString("hex");
    const created = await prisma.badgeAward.upsert({ where: { badgeId_studentId_projectId: { badgeId, studentId, projectId } }, create: { badgeId, studentId, projectId, evidence }, update: {} });
    if (!created.assertion) {
      const badge = await prisma.badgeDefinition.findUniqueOrThrow({ where: { id: badgeId } });
      await prisma.badgeAward.update({ where: { id: created.id }, data: { assertion: {
        "@context": "https://w3id.org/openbadges/v2", type: "Assertion", id: `${config.appUrl}/api/public/badges/assertions/${created.id}`,
        recipient: { type: "email", hashed: true, salt, identity: `sha256$${sha256(email + salt)}` }, badge: `${config.appUrl}/api/public/badges/classes/${badge.code}`, issuedOn: created.awardedAt.toISOString(), verification: { type: "hosted" },
      } } });
    }
  };

  for (const m of students) {
    const sp = m.user.studentProfile; if (!sp) continue;
    const mine = evals.filter((e) => e.subjectUserId === m.userId && ["ENTREPRISE_ETUDIANT", "MENTOR_ETUDIANT", "PAIR"].includes(e.type));
    const avg = mine.length ? mine.reduce((a, e) => a + e.rating, 0) / mine.length : 0;
    const positive = avg >= 3;
    // 1) Compétences démontrées → niveau mis à jour (source PROJET) + badge de compétence
    const demonstrated = new Map<string, { level: SkillLevel; name: string; slug: string }>();
    for (const e of evals.filter((x) => x.subjectUserId === m.userId && (x.type === "ENTREPRISE_ETUDIANT" || x.type === "MENTOR_ETUDIANT"))) for (const s of e.skills) { const cur = demonstrated.get(s.skillId); demonstrated.set(s.skillId, { level: cur ? maxLevel(cur.level, s.demonstrated) : s.demonstrated, name: s.skill.name, slug: s.skill.slug }); }
    if (positive) for (const [skillId, d] of demonstrated) {
      const existing = await prisma.studentSkill.findUnique({ where: { studentId_skillId: { studentId: sp.id, skillId } } });
      await prisma.studentSkill.upsert({ where: { studentId_skillId: { studentId: sp.id, skillId } }, create: { studentId: sp.id, skillId, level: d.level, source: "PROJET" }, update: { level: existing ? maxLevel(existing.level, d.level) : d.level, source: existing?.source === "CERTIFIE" ? "CERTIFIE" : "PROJET" } });
      const b = await def(`competence:${d.slug}`, `Compétence : ${d.name}`, `Compétence « ${d.name} » démontrée sur un projet réel et validée par évaluation.`, "COMPETENCE", { skillId });
      await award(b.id, sp.id, { skill: d.name, level: d.level, rating: Math.round(avg * 10) / 10 }, m.user.email);
      // 2) Certification NEXBRIDGE après 3 projets validés sur la même compétence
      const count = await prisma.badgeAward.count({ where: { studentId: sp.id, badgeId: b.id, revokedAt: null } });
      if (count >= CERTIFICATION_MIN_PROJECTS) await prisma.certification.upsert({ where: { studentId_skillId: { studentId: sp.id, skillId } }, create: { studentId: sp.id, skillId, level: d.level, basedOnProjects: count }, update: { level: d.level, basedOnProjects: count } });
    }
    // 3) Excellence
    if (positive && avg > TOP_PERFORMER_THRESHOLD) { const b = await def("excellence:top-performer", "Top Performer", "Évaluation supérieure à 4,5/5 sur un projet.", "EXCELLENCE"); await award(b.id, sp.id, { rating: Math.round(avg * 10) / 10 }, m.user.email); }
    if (positive && adopted) { const b = await def("excellence:innovateur", "Innovateur", "Livrable adopté par l'entreprise.", "EXCELLENCE"); await award(b.id, sp.id, { adopted: true }, m.user.email); }
    if (m.projectRole === "CHEF_PROJET") {
      const led = await prisma.projectMember.count({ where: { userId: m.userId, projectRole: "CHEF_PROJET", project: { status: "TERMINE" } } });
      if (led >= LEADER_MIN_PROJECTS) { const b = await def("excellence:leader", "Leader", `${LEADER_MIN_PROJECTS} projets menés comme chef d'équipe.`, "EXCELLENCE"); await award(b.id, sp.id, { projects: led }, m.user.email); }
    }
    // 4) Sectoriel : 2 projets terminés dans le même secteur
    const sector = project.challenge.sector;
    if (positive && sector) {
      const n = await prisma.projectMember.count({ where: { userId: m.userId, projectRole: { in: ["ETUDIANT", "CHEF_PROJET"] }, project: { status: "TERMINE", challenge: { sectorId: sector.id } } } });
      if (n >= SECTOR_BADGE_MIN_PROJECTS) { const b = await def(`sectoriel:${sector.slug}`, `Spécialiste ${sector.name}`, `${SECTOR_BADGE_MIN_PROJECTS} projets terminés dans le secteur « ${sector.name} ».`, "SECTORIEL", { sectorName: sector.name }); await award(b.id, sp.id, { projects: n }, m.user.email); }
    }
    // 5) Indice de fiabilité = moyenne de toutes les évaluations reçues (non masquées)
    const all = await prisma.evaluation.aggregate({ where: { subjectUserId: m.userId, hidden: false, type: { in: ["ENTREPRISE_ETUDIANT", "MENTOR_ETUDIANT", "PAIR"] } }, _avg: { rating: true } });
    if (all._avg.rating != null) await prisma.studentProfile.update({ where: { id: sp.id }, data: { reliabilityIndex: Math.round(all._avg.rating * 100) / 100 } });
    // 6) Attestation PDF
    try {
      const code = randomToken(9).toUpperCase().replace(/[^A-Z0-9]/g, "X");
      const pdf = await buildAttestationPdf({ studentName: fullName(m.user), projectName: project.name, company: company.legalName, sector: sector?.name ?? null, startDate: project.startDate, endDate: end, role: m.projectRole === "CHEF_PROJET" ? "chef de projet" : "membre de l'équipe", skills: [...demonstrated.values()].map((d) => d.name), code, institution: sp.institution?.name ?? null });
      const file = await saveUpload({ ownerId: m.userId, originalName: `attestation-${slugify(project.name)}.pdf`, data: pdf, allowedMime: new Set(["application/pdf"]), maxBytes: 5 * 1024 * 1024 });
      await prisma.attestation.upsert({ where: { projectId_studentId: { projectId, studentId: sp.id } }, create: { projectId, studentId: sp.id, fileId: file.id, verificationCode: code }, update: {} });
    } catch (e) { logger.error({ err: (e as Error).message }, "Génération d'attestation impossible"); }
  }

  await prisma.challenge.update({ where: { id: project.challengeId }, data: { status: "CLOTURE", closedAt: new Date(), closeReason: "Projet terminé" } });
  await recordStatus(project.challengeId, "EN_COURS", "CLOTURE", null, "Projet terminé : évaluations complètes");
  await prisma.activityEvent.create({ data: { projectId, actorId: null, type: "project.closed", label: "Projet terminé : badges, attestations et indices de fiabilité mis à jour" } });
  const memberIds = (await prisma.projectMember.findMany({ where: { projectId, leftAt: null }, select: { userId: true } })).map((m) => m.userId);
  await notifyMany(memberIds, { type: "project.closed", title: "Le projet est terminé", body: `« ${project.name} » : vos badges et attestations sont disponibles.`, link: "/app/badges", email: true });
  // Paiement : AUCUN flux n'est exécuté (phase 5). On signale simplement à l'équipe NEXBRIDGE qu'une libération de fonds sera à traiter.
  await notifyMany(await adminUserIds(), { type: "system.escrow", title: "Projet terminé : libération des fonds à traiter", body: `« ${project.name} » — le séquestre n'est pas encore opérationnel (phase 5).`, link: "/app/admin/projets" });
  return true;
}

export type { Prisma };

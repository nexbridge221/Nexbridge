import { Router, type Request } from "express";
import { z } from "zod";
import { evaluationSchema, EVALUATION_TYPE_LABELS, OPTIONAL_EVALUATIONS } from "@nexbridge/shared";
import { badRequest, conflict, forbidden, notFound, prisma } from "../../platform/core";
import { audit, authenticate, validateBody } from "../../platform/http";
import { emitProject } from "../../platform/realtime";
import { notifyMany } from "../notifications/routes";
import { getAccess, logActivity, memberUserIds, personName } from "../nexspace/access";
import { openEvaluation, requirements, tryFinalize } from "./closure";

export const evaluationsRouter = Router({ mergeParams: true });
evaluationsRouter.use(authenticate);
const pid = (req: Request) => String(req.params.projectId);

/** Clôture : réservée à l'entreprise et au mentor, une fois tous les livrables officiels validés. */
export const closeProject = [authenticate, async (req: Request, res: import("express").Response) => {
  const a = await getAccess(req, pid(req));
  if (a.readOnly || !(a.role === "CONTACT_ENTREPRISE" || a.role === "MENTOR")) throw forbidden("Seuls l'entreprise et le mentor peuvent clôturer le projet.");
  if (a.project.status !== "EN_COURS") throw conflict("Ce projet n'est pas en cours.", "BAD_STATE");
  const [pending, total] = await Promise.all([
    prisma.deliverable.count({ where: { projectId: a.project.id, status: { not: "VALIDE" } } }),
    prisma.deliverable.count({ where: { projectId: a.project.id } }),
  ]);
  if (total === 0) throw badRequest("Aucun livrable officiel n'a été défini : créez et validez au moins un livrable avant de clôturer le projet.", "NO_DELIVERABLES");
  if (pending > 0) throw badRequest(`${pending} livrable(s) officiel(s) ne sont pas encore validés.`, "DELIVERABLES_PENDING");
  await prisma.project.update({ where: { id: a.project.id }, data: { status: "EN_EVALUATION" } });
  await openEvaluation(a.project.id);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } });
  await logActivity(a.project.id, a.userId, "project.evaluation", `${personName(me)} a clôturé le projet : la phase d'évaluation est ouverte`, { entityType: "Project", entityId: a.project.id });
  await notifyMany(await memberUserIds(a.project.id, { except: a.userId }), { type: "project.evaluation", title: "Évaluations à remplir", body: `« ${a.project.name} » est clôturé : complétez vos évaluations.`, link: `/app/projets/${a.project.id}/evaluation`, email: true });
  await audit(req, "project.closed", { entityType: "Project", entityId: a.project.id });
  emitProject(a.project.id, "activity", {});
  res.json({ ok: true, status: "EN_EVALUATION" });
}];

evaluationsRouter.get("/todo", async (req, res) => {
  const a = await getAccess(req, pid(req));
  const reqs = await requirements(a.project.id);
  const members = await prisma.projectMember.findMany({ where: { projectId: a.project.id, leftAt: null }, include: { user: { select: { id: true, firstName: true, lastName: true } } } });
  const mine = await prisma.evaluation.findMany({ where: { projectId: a.project.id, evaluatorId: a.userId } });
  const forMe: { type: string; label: string; subjectUserId: string | null; subjectName: string | null; done: boolean; optional: boolean; rating?: number }[] = [];
  const add = (type: keyof typeof EVALUATION_TYPE_LABELS, subject: { id: string; name: string } | null) => { const e = mine.find((x) => x.type === type && (x.subjectUserId ?? null) === (subject?.id ?? null)); forMe.push({ type, label: EVALUATION_TYPE_LABELS[type], subjectUserId: subject?.id ?? null, subjectName: subject?.name ?? null, done: Boolean(e), optional: OPTIONAL_EVALUATIONS.includes(type), rating: e?.rating }); };
  const students = members.filter((m) => m.projectRole === "ETUDIANT" || m.projectRole === "CHEF_PROJET").map((m) => ({ id: m.userId, name: personName(m.user) }));
  const mentor = members.find((m) => m.projectRole === "MENTOR");
  if (!a.readOnly) {
    if (a.role === "CONTACT_ENTREPRISE") { add("ENTREPRISE_PROJET", null); students.forEach((s) => add("ENTREPRISE_ETUDIANT", s)); }
    if (a.role === "MENTOR") students.forEach((s) => add("MENTOR_ETUDIANT", s));
    if (a.role === "ETUDIANT" || a.role === "CHEF_PROJET") { add("ETUDIANT_EXPERIENCE", null); students.filter((s) => s.id !== a.userId).forEach((s) => add("PAIR", s)); if (mentor) add("ETUDIANT_MENTOR", { id: mentor.userId, name: personName(mentor.user) }); }
  }
  const academic = await prisma.academicValidation.findMany({ where: { projectId: a.project.id }, include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } });
  const att = await prisma.attestation.findFirst({ where: { projectId: a.project.id, student: { userId: a.userId } } });
  const deliverablesPending = await prisma.deliverable.count({ where: { projectId: a.project.id, status: { not: "VALIDE" } } });
  res.json({
    status: a.project.status, role: a.role, deliverablesPending, canClose: !a.readOnly && (a.role === "CONTACT_ENTREPRISE" || a.role === "MENTOR") && a.project.status === "EN_COURS" && deliverablesPending === 0,
    progress: { required: reqs.length, done: reqs.filter((r) => r.done).length, missing: reqs.filter((r) => !r.done).map((r) => ({ type: r.type, subjectName: r.subjectName })) },
    todo: forMe, academic: academic.map((v) => ({ student: personName(v.student.user), status: v.status, credits: v.credits ? Number(v.credits) : null })),
    attestationId: att?.id ?? null,
  });
});

evaluationsRouter.post("/", validateBody(evaluationSchema), async (req, res) => {
  const a = await getAccess(req, pid(req));
  if (a.readOnly) throw forbidden("Accès en lecture seule.");
  if (a.project.status !== "EN_EVALUATION") throw conflict("Les évaluations sont ouvertes uniquement après la clôture du projet.", "NOT_IN_EVALUATION");
  const b = req.body as z.infer<typeof evaluationSchema>;
  const members = await prisma.projectMember.findMany({ where: { projectId: a.project.id, leftAt: null } });
  const subj = b.subjectUserId ?? null;
  const subjectRole = members.find((m) => m.userId === subj)?.projectRole;
  const isStudent = (r?: string) => r === "ETUDIANT" || r === "CHEF_PROJET";
  const rules: Record<string, () => boolean> = {
    ENTREPRISE_PROJET: () => a.role === "CONTACT_ENTREPRISE" && subj === null,
    ENTREPRISE_ETUDIANT: () => a.role === "CONTACT_ENTREPRISE" && isStudent(subjectRole),
    MENTOR_ETUDIANT: () => a.role === "MENTOR" && isStudent(subjectRole),
    ETUDIANT_EXPERIENCE: () => isStudent(a.role) && subj === null,
    PAIR: () => isStudent(a.role) && isStudent(subjectRole) && subj !== a.userId,
    ETUDIANT_MENTOR: () => isStudent(a.role) && subjectRole === "MENTOR",
  };
  if (!rules[b.type]!()) throw forbidden("Vous ne pouvez pas déposer cette évaluation.", "EVALUATION_FORBIDDEN");
  if ((b.type === "PAIR" || b.type === "ETUDIANT_MENTOR" || b.type === "ETUDIANT_EXPERIENCE" || b.type === "ENTREPRISE_PROJET") && b.skills.length) throw badRequest("Les compétences ne s'évaluent que pour les étudiants (entreprise et mentor).");
  if (b.skills.length) { const ids = [...new Set(b.skills.map((s) => s.skillId))]; if ((await prisma.skill.count({ where: { id: { in: ids } } })) !== ids.length) throw badRequest("Compétence inconnue."); }
  // Une seule évaluation par évaluateur / type / personne évaluée (la contrainte SQL ne couvre pas les sujets nuls).
  if (await prisma.evaluation.findFirst({ where: { projectId: a.project.id, type: b.type, evaluatorId: a.userId, subjectUserId: subj } })) throw conflict("Vous avez déjà déposé cette évaluation.", "ALREADY_SUBMITTED");
  // Pour l'entreprise et le mentor, une seule personne par rôle suffit à satisfaire l'exigence.
  const ev = await prisma.evaluation.create({ data: { projectId: a.project.id, type: b.type, evaluatorId: a.userId, subjectUserId: subj, rating: b.rating, comment: b.comment, criteria: { ...(b.criteria ?? {}), ...(b.adopted !== undefined ? { adopted: b.adopted } : {}) }, skills: { create: [...new Map(b.skills.map((s) => [s.skillId, s])).values()].map((s) => ({ skillId: s.skillId, demonstrated: s.demonstrated })) } } });
  await logActivity(a.project.id, a.userId, "evaluation.submitted", "Une évaluation a été déposée", { entityType: "Evaluation", entityId: ev.id, silent: false });
  const finalized = await tryFinalize(a.project.id);
  emitProject(a.project.id, "activity", {});
  res.status(201).json({ ok: true, finalized });
});

/** Évaluations reçues par l'utilisateur (étudiant ou mentor) : visibles seulement quand le projet est terminé ; les avis de coéquipiers restent anonymes. */
export const receivedEvaluationsHandler = [authenticate, async (req: Request, res: import("express").Response) => {
  const rows = await prisma.evaluation.findMany({ where: { subjectUserId: req.auth!.id, hidden: false, project: { status: "TERMINE" } }, orderBy: { submittedAt: "desc" }, include: { project: { select: { id: true, name: true } } }, take: 100 });
  const authors = await prisma.user.findMany({ where: { id: { in: rows.filter((r) => r.type !== "PAIR").map((r) => r.evaluatorId) } }, select: { id: true, firstName: true, lastName: true } });
  const am = new Map(authors.map((u) => [u.id, personName(u)]));
  res.json({ evaluations: rows.map((r) => ({ id: r.id, type: r.type, label: EVALUATION_TYPE_LABELS[r.type as keyof typeof EVALUATION_TYPE_LABELS], rating: r.rating, comment: r.comment, author: r.type === "PAIR" ? "Un coéquipier (anonyme)" : am.get(r.evaluatorId) ?? "—", project: r.project, submittedAt: r.submittedAt })) });
}];

void notFound;

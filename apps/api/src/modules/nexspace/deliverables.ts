import { Router } from "express";
import { z } from "zod";
import { DELIVERABLE_STATUS_LABELS, deliverableReviewSchema, deliverableSchema, deliverableSubmitSchema } from "@nexbridge/shared";
import { badRequest, conflict, forbidden, notFound, prisma } from "../../platform/core";
import { authenticate, validateBody } from "../../platform/http";
import { emitProject } from "../../platform/realtime";
import { notifyMany } from "../notifications/routes";
import { assertMembers, canSee, getAccess, isTeam, logActivity, memberUserIds, personName, requireContributor, requireLeadOrMentor, type Access } from "./access";

export const deliverablesRouter = Router({ mergeParams: true });
deliverablesRouter.use(authenticate);
const pid = (req: { params: Record<string, string | string[] | undefined> }) => String(req.params.projectId);

async function view(projectId: string, id?: string) {
  const rows = await prisma.deliverable.findMany({
    where: { projectId, ...(id ? { id } : {}) }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: { submissions: { orderBy: { versionNo: "desc" }, include: { reviews: { orderBy: { createdAt: "asc" } }, documentVersion: { include: { document: { select: { id: true, name: true } } } } } } },
  });
  const uids = [...new Set(rows.flatMap((r) => [r.ownerId, ...r.submissions.flatMap((s) => [s.submittedById, ...s.reviews.map((x) => x.reviewerId)])]).filter(Boolean) as string[])];
  const um = new Map((await prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, personName(u)]));
  return rows.map((d) => ({
    id: d.id, name: d.name, description: d.description, expectedFormat: d.expectedFormat, dueDate: d.dueDate, ownerId: d.ownerId, owner: d.ownerId ? um.get(d.ownerId) ?? null : null, milestoneId: d.milestoneId,
    status: d.status, mentorApprovedAt: d.mentorApprovedAt, submittedAt: d.submittedAt, validatedAt: d.validatedAt, late: d.status !== "VALIDE" && d.dueDate != null && d.dueDate < new Date(),
    submissions: d.submissions.map((s) => ({ id: s.id, versionNo: s.versionNo, note: s.note, submittedAt: s.submittedAt, submittedBy: um.get(s.submittedById) ?? "—", documentId: s.documentVersion.document.id, documentName: s.documentVersion.document.name, documentVersionNo: s.documentVersion.versionNo,
      reviews: s.reviews.map((r) => ({ id: r.id, role: r.reviewerRole, decision: r.decision, comment: r.comment, reviewer: um.get(r.reviewerId) ?? "—", createdAt: r.createdAt })) })),
  }));
}
async function load(projectId: string, id: string) {
  const d = await prisma.deliverable.findFirst({ where: { id, projectId } });
  if (!d) throw notFound("Livrable introuvable");
  return d;
}
async function label(a: Access) { const u = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } }); return personName(u); }
const hasMentor = async (projectId: string) => (await memberUserIds(projectId, { roles: ["MENTOR"] })).length > 0;

deliverablesRouter.get("/", async (req, res) => { const a = await getAccess(req, pid(req)); res.json({ deliverables: await view(a.project.id) }); });

deliverablesRouter.post("/", validateBody(deliverableSchema), async (req, res) => {
  const a = await getAccess(req, pid(req));
  if (a.readOnly || !(a.role === "CHEF_PROJET" || a.role === "MENTOR" || a.role === "CONTACT_ENTREPRISE")) throw forbidden("Réservé au chef de projet, au mentor et à l'entreprise.");
  if (req.body.ownerId) await assertMembers(a.project.id, [req.body.ownerId]);
  if (req.body.milestoneId && !(await prisma.milestone.findFirst({ where: { id: req.body.milestoneId, projectId: a.project.id } }))) throw badRequest("Jalon introuvable.");
  const d = await prisma.deliverable.create({ data: { projectId: a.project.id, name: req.body.name, description: req.body.description, expectedFormat: req.body.expectedFormat, dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null, ownerId: req.body.ownerId ?? null, milestoneId: req.body.milestoneId ?? null } });
  await logActivity(a.project.id, a.userId, "deliverable.created", `${await label(a)} a ajouté le livrable « ${d.name} »`, { entityType: "Deliverable", entityId: d.id });
  emitProject(a.project.id, "deliverable", { id: d.id });
  res.status(201).json({ deliverable: (await view(a.project.id, d.id))[0] });
});

deliverablesRouter.patch("/:id", validateBody(deliverableSchema.partial()), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireLeadOrMentor(a);
  const d = await load(a.project.id, String(req.params.id));
  if (req.body.ownerId) await assertMembers(a.project.id, [req.body.ownerId]);
  await prisma.deliverable.update({ where: { id: d.id }, data: { ...(req.body.name ? { name: req.body.name } : {}), ...(req.body.description !== undefined ? { description: req.body.description } : {}), ...(req.body.expectedFormat !== undefined ? { expectedFormat: req.body.expectedFormat } : {}), ...(req.body.dueDate !== undefined ? { dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null } : {}), ...(req.body.ownerId !== undefined ? { ownerId: req.body.ownerId } : {}), ...(req.body.milestoneId !== undefined ? { milestoneId: req.body.milestoneId } : {}) } });
  emitProject(a.project.id, "deliverable", { id: d.id });
  res.json({ deliverable: (await view(a.project.id, d.id))[0] });
});

deliverablesRouter.delete("/:id", async (req, res) => {
  const a = await getAccess(req, pid(req)); requireLeadOrMentor(a);
  const d = await load(a.project.id, String(req.params.id));
  if (d.status !== "A_PRODUIRE") throw conflict("Seul un livrable « à produire » peut être supprimé.");
  await prisma.deliverable.delete({ where: { id: d.id } });
  res.status(204).end();
});

/** L'équipe commence la préparation. */
deliverablesRouter.post("/:id/start", async (req, res) => {
  const a = await getAccess(req, pid(req));
  if (a.readOnly || !isTeam(a.role)) throw forbidden("Réservé à l'équipe.");
  const d = await load(a.project.id, String(req.params.id));
  if (d.status !== "A_PRODUIRE") throw conflict("Ce livrable est déjà en préparation.");
  await prisma.deliverable.update({ where: { id: d.id }, data: { status: "EN_PREPARATION" } });
  await logActivity(a.project.id, a.userId, "deliverable.started", `${await label(a)} prépare le livrable « ${d.name} »`, { entityType: "Deliverable", entityId: d.id });
  emitProject(a.project.id, "deliverable", { id: d.id });
  res.json({ deliverable: (await view(a.project.id, d.id))[0] });
});

/** Soumission : un document de la bibliothèque (version courante). Passe d'abord par le mentor. */
deliverablesRouter.post("/:id/submit", validateBody(deliverableSubmitSchema), async (req, res) => {
  const a = await getAccess(req, pid(req));
  if (a.readOnly || !isTeam(a.role)) throw forbidden("Seule l'équipe soumet un livrable.");
  const d = await load(a.project.id, String(req.params.id));
  if (!["A_PRODUIRE", "EN_PREPARATION", "A_CORRIGER"].includes(d.status)) throw conflict("Ce livrable ne peut pas être soumis dans son état actuel.", "BAD_STATE");
  const doc = await prisma.document.findFirst({ where: { id: req.body.documentId, projectId: a.project.id, deletedAt: null }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } });
  if (!doc || !canSee(a.role, doc.visibility)) throw notFound("Document introuvable");
  if (doc.visibility === "EQUIPE_SEULE") throw badRequest("Un livrable doit être visible par le mentor et l'entreprise : changez la visibilité du document.", "DOC_NOT_SHAREABLE");
  const last = await prisma.deliverableSubmission.findFirst({ where: { deliverableId: d.id }, orderBy: { versionNo: "desc" } });
  const mentor = await hasMentor(a.project.id);
  await prisma.$transaction([
    prisma.deliverableSubmission.create({ data: { deliverableId: d.id, versionNo: (last?.versionNo ?? 0) + 1, documentVersionId: doc.versions[0]!.id, submittedById: a.userId, note: req.body.note } }),
    prisma.deliverable.update({ where: { id: d.id }, data: { status: mentor ? "SOUMIS" : "EN_REVISION", submittedAt: new Date(), mentorApprovedAt: mentor ? null : new Date() } }),
  ]);
  await logActivity(a.project.id, a.userId, "deliverable.submitted", `${await label(a)} a soumis le livrable « ${d.name} »`, { entityType: "Deliverable", entityId: d.id });
  await notifyMany(await memberUserIds(a.project.id, { except: a.userId, roles: mentor ? ["MENTOR"] : ["CONTACT_ENTREPRISE"] }), { type: "project.deliverable", title: mentor ? "Un livrable attend votre relecture" : "Un livrable attend votre validation", body: d.name, link: `/app/projets/${a.project.id}/livrables` });
  emitProject(a.project.id, "deliverable", { id: d.id });
  res.json({ deliverable: (await view(a.project.id, d.id))[0] });
});

/** Relecture : le mentor commente / demande des corrections / approuve ; l'entreprise valide ou demande des corrections après approbation du mentor. */
deliverablesRouter.post("/:id/review", validateBody(deliverableReviewSchema), async (req, res) => {
  const a = await getAccess(req, pid(req));
  const { decision, comment } = req.body as z.infer<typeof deliverableReviewSchema>;
  const d = await load(a.project.id, String(req.params.id));
  const sub = await prisma.deliverableSubmission.findFirst({ where: { deliverableId: d.id }, orderBy: { versionNo: "desc" } });
  if (!sub || !["SOUMIS", "EN_REVISION"].includes(d.status)) throw conflict("Aucune soumission à relire.", "BAD_STATE");
  let data: Record<string, unknown> = {}; let role = "";
  if (a.role === "MENTOR" && !a.readOnly) {
    role = "MENTOR";
    if (decision === "VALIDE") throw forbidden("La validation finale appartient à l'entreprise.");
    data = decision === "CORRECTION" ? { status: "A_CORRIGER" } : decision === "APPROUVE" ? { status: "EN_REVISION", mentorApprovedAt: new Date() } : { status: "EN_REVISION" };
  } else if (a.role === "CONTACT_ENTREPRISE" && !a.readOnly) {
    role = "ENTREPRISE";
    const mentor = await hasMentor(a.project.id);
    if (mentor && !d.mentorApprovedAt) throw conflict("Le mentor doit d'abord approuver ce livrable.", "MENTOR_APPROVAL_REQUIRED");
    if (decision === "APPROUVE" || decision === "COMMENTAIRE") throw badRequest("L'entreprise valide ou demande une correction.", "BAD_DECISION");
    data = decision === "VALIDE" ? { status: "VALIDE", validatedAt: new Date() } : { status: "A_CORRIGER", mentorApprovedAt: null };
  } else throw forbidden("Seuls le mentor et l'entreprise relisent les livrables.");
  await prisma.$transaction([prisma.deliverableReview.create({ data: { submissionId: sub.id, reviewerId: a.userId, reviewerRole: role, decision, comment } }), prisma.deliverable.update({ where: { id: d.id }, data })]);
  const next = (data.status as keyof typeof DELIVERABLE_STATUS_LABELS | undefined) ?? d.status;
  await logActivity(a.project.id, a.userId, decision === "VALIDE" ? "deliverable.validated" : "deliverable.reviewed", `${await label(a)} : livrable « ${d.name} » → ${DELIVERABLE_STATUS_LABELS[next]}`, { entityType: "Deliverable", entityId: d.id });
  const targets = decision === "APPROUVE" ? await memberUserIds(a.project.id, { except: a.userId, roles: ["CONTACT_ENTREPRISE"] }) : await memberUserIds(a.project.id, { except: a.userId, roles: ["CHEF_PROJET", "ETUDIANT"] });
  await notifyMany(targets, { type: "project.deliverable", title: decision === "APPROUVE" ? "Un livrable est approuvé par le mentor : à valider" : decision === "VALIDE" ? "Livrable validé" : decision === "CORRECTION" ? "Corrections demandées sur un livrable" : "Nouveau commentaire sur un livrable", body: `${d.name}${comment ? ` — ${comment.slice(0, 100)}` : ""}`, link: `/app/projets/${a.project.id}/livrables` });
  emitProject(a.project.id, "deliverable", { id: d.id });
  res.json({ deliverable: (await view(a.project.id, d.id))[0] });
});

void requireContributor;

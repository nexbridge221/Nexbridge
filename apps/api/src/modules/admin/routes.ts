import { Router } from "express";
import { z } from "zod";
import { adminChallengeActionSchema, adminProjectPatchSchema, assignMentorSchema, challengeDraftSchema, challengeReviewSchema, kycReviewSchema } from "@nexbridge/shared";
import { badRequest, conflict, decrypt, notFound, prisma } from "../../platform/core";
import { audit, authenticate, requirePermission, validateBody, validateQuery } from "../../platform/http";
import { notify, notifyMany } from "../notifications/routes";
import { challengeInclude, companyUserIds, fromMinor, recordStatus, serializeChallenge, toMinor } from "../challenges/helpers";

export const adminRouter = Router();
adminRouter.use(authenticate, requirePermission("admin:access"));

const safeDecrypt = (v: string | null) => { if (!v) return null; try { return decrypt(v); } catch { return null; } };

/** Compteurs réels des files de validation (tableau de bord admin). */
adminRouter.get("/overview", async (_req, res) => {
  const [kyc, review, institutions, withoutMentor, users, companies, published, inProgress] = await Promise.all([
    prisma.company.count({ where: { kycStatus: "EN_VERIFICATION" } }),
    prisma.challenge.count({ where: { status: "EN_REVISION" } }),
    prisma.institution.count({ where: { status: "EN_ATTENTE" } }),
    prisma.project.count({ where: { members: { none: { projectRole: "MENTOR" } }, status: { in: ["PLANIFIE", "EN_COURS"] } } }),
    prisma.user.count({ where: { status: { not: "ANONYMISE" } } }),
    prisma.company.count(),
    prisma.challenge.count({ where: { status: "PUBLIE" } }),
    prisma.project.count({ where: { status: { in: ["PLANIFIE", "EN_COURS"] } } }),
  ]);
  res.json({ queues: { kyc, challengesToReview: review, institutionsPending: institutions, projectsWithoutMentor: withoutMentor }, totals: { users, companies, publishedChallenges: published, activeProjects: inProgress } });
});

/* ---------------- Défis ---------------- */
adminRouter.get("/challenges", async (req, res) => {
  const q = validateQuery(z.object({ status: z.enum(["EN_REVISION", "PUBLIE", "BROUILLON", "EN_COURS", "CLOTURE", "ARCHIVE", "TOUS"]).default("EN_REVISION"), q: z.string().trim().max(80).optional() }), req.query);
  const rows = await prisma.challenge.findMany({
    where: { ...(q.status !== "TOUS" ? { status: q.status } : {}), ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { company: { legalName: { contains: q.q, mode: "insensitive" } } }] } : {}) },
    orderBy: { updatedAt: q.status === "EN_REVISION" ? "asc" : "desc" }, include: { company: { select: { id: true, legalName: true, kycStatus: true } }, sector: { select: { name: true } }, project: { select: { id: true } }, _count: { select: { applications: true } } }, take: 100,
  });
  res.json({ challenges: rows.map((c) => ({ id: c.id, title: c.title, status: c.status, company: c.company, sector: c.sector?.name ?? null, updatedAt: c.updatedAt, applications: c._count.applications, projectId: c.project?.id ?? null })) });
});

adminRouter.get("/challenges/:id", async (req, res) => {
  const c = await prisma.challenge.findUnique({ where: { id: String(req.params.id) }, include: { ...challengeInclude, history: { orderBy: { at: "desc" }, take: 20 }, reviews: { orderBy: { createdAt: "desc" } } } });
  if (!c) throw notFound("Défi introuvable");
  res.json({ challenge: serializeChallenge(c) });
});

adminRouter.post("/challenges/:id/review", requirePermission("challenge:review"), validateBody(challengeReviewSchema), async (req, res) => {
  const c = await prisma.challenge.findUnique({ where: { id: String(req.params.id) }, include: { company: true } });
  if (!c) throw notFound("Défi introuvable");
  if (c.status !== "EN_REVISION") throw conflict("Ce défi n'est pas en révision.", "NOT_IN_REVIEW");
  const { decision, comment, checklist } = req.body as z.infer<typeof challengeReviewSchema>;
  const approve = decision === "APPROUVE";
  await prisma.$transaction([
    prisma.challenge.update({ where: { id: c.id }, data: approve ? { status: "PUBLIE", publishedAt: new Date(), rejectionReason: null } : { status: "BROUILLON", rejectionReason: comment! } }),
    prisma.challengeReview.create({ data: { challengeId: c.id, adminId: req.auth!.id, decision, comment, checklist: checklist as object | undefined } }),
  ]);
  await recordStatus(c.id, "EN_REVISION", approve ? "PUBLIE" : "BROUILLON", req.auth!.id, approve ? "Validé et publié" : `Refusé : ${comment}`);
  await audit(req, approve ? "challenge.approved" : "challenge.rejected", { entityType: "Challenge", entityId: c.id });
  await notifyMany(await companyUserIds(c.companyId), approve
    ? { type: "challenge.approved", title: "Votre défi est publié", body: `« ${c.title} » est visible sur la marketplace.`, link: `/app/defis/${c.id}`, email: true }
    : { type: "challenge.rejected", title: "Votre défi nécessite des modifications", body: comment, link: `/app/defis/${c.id}`, email: true });
  res.json({ ok: true, status: approve ? "PUBLIE" : "BROUILLON" });
});

/* ---------------- Validation des organisations (KYC) ---------------- */
adminRouter.get("/companies", requirePermission("admin:kyc:review"), async (req, res) => {
  const { kyc } = validateQuery(z.object({ kyc: z.enum(["EN_VERIFICATION", "VALIDE", "REFUSE", "NON_SOUMIS"]).default("EN_VERIFICATION") }), req.query);
  const rows = await prisma.company.findMany({ where: { kycStatus: kyc }, orderBy: { updatedAt: "asc" }, include: { kycDocuments: { include: { file: { select: { id: true, originalName: true, size: true, mime: true, scanStatus: true } } } }, members: { where: { isOwner: true }, include: { user: { select: { firstName: true, lastName: true, email: true } } } } }, take: 100 });
  res.json({ companies: rows.map((c) => ({ id: c.id, legalName: c.legalName, sector: c.sector, country: c.country, city: c.city, kycStatus: c.kycStatus, ninea: safeDecrypt(c.ninea), rccm: safeDecrypt(c.rccm), owner: c.members[0]?.user ?? null, documents: c.kycDocuments, updatedAt: c.updatedAt })) });
});

adminRouter.post("/companies/:id/kyc", requirePermission("admin:kyc:review"), validateBody(kycReviewSchema), async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: String(req.params.id) }, include: { kycDocuments: true } });
  if (!company) throw notFound("Organisation introuvable");
  if (company.kycStatus !== "EN_VERIFICATION") throw conflict("Ce dossier n'est pas en vérification.", "NOT_PENDING");
  const { decision, reason } = req.body as z.infer<typeof kycReviewSchema>;
  if (decision === "VALIDE" && (!company.ninea || !company.rccm || company.kycDocuments.length === 0)) throw badRequest("Dossier incomplet : identifiants ou pièces manquants.", "KYC_INCOMPLETE");
  await prisma.$transaction([
    prisma.company.update({ where: { id: company.id }, data: { kycStatus: decision, kycRejectionReason: decision === "REFUSE" ? reason : null } }),
    prisma.kycDocument.updateMany({ where: { companyId: company.id, status: "EN_VERIFICATION" }, data: { status: decision, reviewedById: req.auth!.id, reviewedAt: new Date(), rejectionReason: decision === "REFUSE" ? reason : null } }),
  ]);
  await audit(req, decision === "VALIDE" ? "kyc.approved" : "kyc.rejected", { entityType: "Company", entityId: company.id });
  await notifyMany(await companyUserIds(company.id), decision === "VALIDE"
    ? { type: "challenge.kyc", title: "Votre organisation est validée", body: "Vous pouvez désormais soumettre des défis.", link: "/app/organisation", email: true }
    : { type: "challenge.kyc", title: "Votre dossier de validation est refusé", body: reason, link: "/app/organisation", email: true });
  res.json({ ok: true });
});

/* ---------------- Établissements ---------------- */
adminRouter.get("/institutions", async (_req, res) => {
  const rows = await prisma.institution.findMany({ where: { status: "EN_ATTENTE" }, include: { _count: { select: { referents: true, students: true } } }, orderBy: { createdAt: "asc" } });
  res.json({ institutions: rows.map((i) => ({ id: i.id, name: i.name, city: i.city, country: i.country, referents: i._count.referents, students: i._count.students, createdAt: i.createdAt })) });
});
adminRouter.post("/institutions/:id/validate", requirePermission("admin:content:manage"), async (req, res) => {
  const inst = await prisma.institution.findUnique({ where: { id: String(req.params.id) }, include: { referents: { select: { userId: true } } } });
  if (!inst) throw notFound("Établissement introuvable");
  await prisma.institution.update({ where: { id: inst.id }, data: { status: "VALIDE", validatedById: req.auth!.id } });
  await audit(req, "institution.validated", { entityType: "Institution", entityId: inst.id });
  await notifyMany(inst.referents.map((r) => r.userId), { type: "system.institution", title: "Votre établissement est validé", body: inst.name, link: "/app/profil", email: true });
  res.json({ ok: true });
});

/* ---------------- Projets : affectation d'un mentor ---------------- */
adminRouter.get("/projects", async (_req, res) => {
  const rows = await prisma.project.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { challenge: { select: { title: true, sector: { select: { name: true } } } }, members: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } } });
  res.json({ projects: rows.map((p) => ({ id: p.id, name: p.name, description: p.description, startDate: p.startDate, plannedEndDate: p.plannedEndDate, challengeTitle: p.challenge.title, status: p.status, createdAt: p.createdAt, sector: p.challenge.sector?.name ?? null, budget: fromMinor(p.budgetAmount, p.budgetCurrency), currency: p.budgetCurrency, members: p.members.map((m) => ({ userId: m.userId, role: m.projectRole, name: `${m.user.firstName} ${m.user.lastName}` })) })) });
});
adminRouter.get("/mentors", async (_req, res) => {
  const rows = await prisma.mentorProfile.findMany({ where: { onboardingDone: true, user: { status: "ACTIF" } }, include: { user: { select: { id: true, firstName: true, lastName: true } } } });
  const counts = await prisma.projectMember.groupBy({ by: ["userId"], where: { projectRole: "MENTOR", project: { status: { in: ["PLANIFIE", "EN_COURS"] } } }, _count: true });
  const byUser = new Map(counts.map((c) => [c.userId, c._count]));
  res.json({ mentors: rows.map((m) => ({ userId: m.userId, name: `${m.user.firstName} ${m.user.lastName}`, sectors: m.expertiseSectors, max: m.maxConcurrentProjects, active: byUser.get(m.userId) ?? 0 })) });
});
adminRouter.post("/projects/:id/mentor", validateBody(assignMentorSchema), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: String(req.params.id) } });
  if (!project) throw notFound("Projet introuvable");
  const mentor = await prisma.mentorProfile.findUnique({ where: { userId: req.body.mentorUserId }, include: { user: true } });
  if (!mentor || mentor.user.status !== "ACTIF") throw badRequest("Mentor introuvable ou inactif");
  const active = await prisma.projectMember.count({ where: { userId: mentor.userId, projectRole: "MENTOR", project: { status: { in: ["PLANIFIE", "EN_COURS"] } } } });
  if (active >= mentor.maxConcurrentProjects) throw conflict(`Ce mentor accompagne déjà ${active} projet(s) (maximum accepté : ${mentor.maxConcurrentProjects}).`, "MENTOR_FULL");
  await prisma.$transaction([
    prisma.projectMember.updateMany({ where: { projectId: project.id, projectRole: "MENTOR", leftAt: null }, data: { leftAt: new Date() } }),
    prisma.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId: mentor.userId } }, create: { projectId: project.id, userId: mentor.userId, projectRole: "MENTOR" }, update: { projectRole: "MENTOR", leftAt: null } }),
  ]);
  await audit(req, "project.mentor_assigned", { entityType: "Project", entityId: project.id, metadata: { mentorUserId: mentor.userId } });
  await notify(mentor.userId, { type: "project.assigned", title: "Nouveau projet à accompagner", body: project.name, link: "/app/bientot/supervision", email: true });
  res.json({ ok: true });
});

/* ---------------- Défis : modification, publication, dépublication, suppression (administrateurs) ---------------- */
const ADMIN_EDITABLE = ["BROUILLON", "EN_REVISION", "PUBLIE", "ARCHIVE"] as const;
adminRouter.put("/challenges/:id", requirePermission("admin:content:manage"), validateBody(challengeDraftSchema), async (req, res) => {
  const challenge = await prisma.challenge.findUnique({ where: { id: String(req.params.id) } });
  if (!challenge) throw notFound("Défi introuvable");
  if (!(ADMIN_EDITABLE as readonly string[]).includes(challenge.status)) throw conflict("Ce défi est lié à un projet lancé ou terminé : il ne peut plus être modifié.", "NOT_EDITABLE");
  const b = req.body as z.infer<typeof challengeDraftSchema>;
  const currency = b.budgetCurrency ?? challenge.budgetCurrency;
  if (b.skills) {
    const ids = [...new Set(b.skills.map((s) => s.skillId))];
    if ((await prisma.skill.count({ where: { id: { in: ids }, active: true } })) !== ids.length) throw badRequest("Une compétence est inconnue", "UNKNOWN_SKILL");
  }
  if (b.sectorId && !(await prisma.sector.findUnique({ where: { id: b.sectorId } }))) throw badRequest("Secteur inconnu");
  const duration = b.durationWeeks === undefined ? challenge.durationWeeks : b.durationWeeks;
  if (b.milestones && duration && b.milestones.some((m) => m.targetWeek > duration)) throw badRequest("Un jalon dépasse la durée du projet", "VALIDATION_ERROR", { milestones: "Un jalon dépasse la durée du projet" });
  await prisma.$transaction(async (tx) => {
    await tx.challenge.update({ where: { id: challenge.id }, data: {
      ...(b.title !== undefined ? { title: b.title } : {}), ...(b.context !== undefined ? { context: b.context } : {}),
      ...(b.sectorId !== undefined ? { sectorId: b.sectorId } : {}), ...(b.keywords ? { keywords: [...new Set(b.keywords)] } : {}),
      ...(b.objectives !== undefined ? { objectives: b.objectives } : {}), ...(b.teamSize !== undefined ? { teamSize: b.teamSize } : {}),
      ...(b.minStudyLevel !== undefined ? { minStudyLevel: b.minStudyLevel } : {}),
      ...(b.desiredStart !== undefined ? { desiredStart: b.desiredStart ? new Date(b.desiredStart) : null } : {}),
      ...(b.durationWeeks !== undefined ? { durationWeeks: b.durationWeeks } : {}),
      ...(b.budgetCurrency ? { budgetCurrency: b.budgetCurrency } : {}),
      ...(b.budgetAmount !== undefined ? { budgetAmount: toMinor(b.budgetAmount, currency) } : {}),
      budgetPublic: false, ...(b.paymentTerms !== undefined ? { paymentTerms: b.paymentTerms } : {}),
    } });
    if (b.deliverables) { await tx.challengeDeliverable.deleteMany({ where: { challengeId: challenge.id } }); await tx.challengeDeliverable.createMany({ data: b.deliverables.map((d, i) => ({ challengeId: challenge.id, title: d.title, format: d.format, description: d.description, position: i })) }); }
    if (b.milestones) { await tx.challengeMilestone.deleteMany({ where: { challengeId: challenge.id } }); await tx.challengeMilestone.createMany({ data: b.milestones.map((m, i) => ({ challengeId: challenge.id, title: m.title, description: m.description, targetWeek: m.targetWeek, position: i })) }); }
    if (b.skills) { await tx.challengeSkill.deleteMany({ where: { challengeId: challenge.id } }); await tx.challengeSkill.createMany({ data: b.skills.map((s) => ({ challengeId: challenge.id, skillId: s.skillId, minLevel: s.minLevel, weight: s.weight })) }); }
  });
  await audit(req, "challenge.admin_updated", { entityType: "Challenge", entityId: challenge.id, metadata: { fields: Object.keys(b) } });
  const updated = await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id }, include: challengeInclude });
  res.json({ challenge: serializeChallenge(updated) });
});

adminRouter.post("/challenges/:id/publish", requirePermission("challenge:review"), validateBody(adminChallengeActionSchema), async (req, res) => {
  const c = await prisma.challenge.findUnique({ where: { id: String(req.params.id) } });
  if (!c) throw notFound("Défi introuvable");
  if (!["BROUILLON", "EN_REVISION", "ARCHIVE"].includes(c.status)) throw conflict("Ce défi ne peut pas être publié depuis son statut actuel.", "BAD_STATE");
  if (!c.title.trim() || !c.context.trim() || !c.sectorId) throw badRequest("Le défi doit avoir un titre, un contexte et un secteur avant d'être publié.", "INCOMPLETE");
  await prisma.challenge.update({ where: { id: c.id }, data: { status: "PUBLIE", publishedAt: new Date(), rejectionReason: null } });
  await recordStatus(c.id, c.status, "PUBLIE", req.auth!.id, req.body.comment ? `Publié par l'administration : ${req.body.comment}` : "Publié par l'administration");
  await audit(req, "challenge.admin_published", { entityType: "Challenge", entityId: c.id });
  await notifyMany(await companyUserIds(c.companyId), { type: "challenge.approved", title: "Votre défi est publié", body: `« ${c.title} » est visible sur la marketplace.`, link: `/app/defis/${c.id}`, email: true });
  res.json({ ok: true, status: "PUBLIE" });
});

adminRouter.post("/challenges/:id/unpublish", requirePermission("challenge:review"), validateBody(adminChallengeActionSchema.extend({ comment: z.string().trim().min(5, "Indiquez le motif (5 caractères minimum)").max(1000) })), async (req, res) => {
  const c = await prisma.challenge.findUnique({ where: { id: String(req.params.id) } });
  if (!c) throw notFound("Défi introuvable");
  if (c.status !== "PUBLIE") throw conflict("Seul un défi publié peut être dépublié.", "BAD_STATE");
  await prisma.challenge.update({ where: { id: c.id }, data: { status: "BROUILLON", rejectionReason: req.body.comment } });
  await recordStatus(c.id, "PUBLIE", "BROUILLON", req.auth!.id, `Dépublié par l'administration : ${req.body.comment}`);
  await audit(req, "challenge.admin_unpublished", { entityType: "Challenge", entityId: c.id });
  await notifyMany(await companyUserIds(c.companyId), { type: "challenge.rejected", title: "Votre défi a été retiré de la marketplace", body: req.body.comment, link: `/app/defis/${c.id}`, email: true });
  res.json({ ok: true, status: "BROUILLON" });
});

adminRouter.delete("/challenges/:id", requirePermission("admin:content:manage"), async (req, res) => {
  const c = await prisma.challenge.findUnique({ where: { id: String(req.params.id) }, include: { project: { select: { id: true } } } });
  if (!c) throw notFound("Défi introuvable");
  if (c.project) throw conflict("Un projet est lié à ce défi : supprimez ou annulez d'abord le projet (ou archivez le défi).", "HAS_PROJECT");
  const owners = await companyUserIds(c.companyId);
  await prisma.challenge.delete({ where: { id: c.id } }); // candidatures, équipes, historique : supprimés en cascade
  await audit(req, "challenge.admin_deleted", { entityType: "Challenge", entityId: c.id, metadata: { title: c.title, status: c.status } });
  await notifyMany(owners, { type: "challenge.deleted", title: "Un de vos défis a été supprimé", body: `« ${c.title} » a été supprimé par l'administration.`, email: true });
  res.json({ ok: true });
});

/* ---------------- Projets : modification et suppression (administrateurs) ---------------- */
adminRouter.patch("/projects/:id", requirePermission("admin:content:manage"), validateBody(adminProjectPatchSchema), async (req, res) => {
  const p = await prisma.project.findUnique({ where: { id: String(req.params.id) } });
  if (!p) throw notFound("Projet introuvable");
  const b = req.body as z.infer<typeof adminProjectPatchSchema>;
  if (b.status && ["EN_EVALUATION", "TERMINE"].includes(p.status)) throw conflict("Un projet en évaluation ou terminé suit le processus d'évaluation : son statut ne peut pas être modifié ici.", "BAD_STATE");
  await prisma.project.update({ where: { id: p.id }, data: {
    ...(b.name ? { name: b.name } : {}), ...(b.description !== undefined ? { description: b.description } : {}), ...(b.status ? { status: b.status } : {}),
    ...(b.startDate !== undefined ? { startDate: b.startDate ? new Date(b.startDate) : null } : {}), ...(b.plannedEndDate !== undefined ? { plannedEndDate: b.plannedEndDate ? new Date(b.plannedEndDate) : null } : {}),
  } });
  await audit(req, b.status ? `project.admin_status_${b.status.toLowerCase()}` : "project.admin_updated", { entityType: "Project", entityId: p.id, metadata: { from: p.status, fields: Object.keys(b), reason: b.reason } });
  if (b.status && b.status !== p.status) {
    const members = await prisma.projectMember.findMany({ where: { projectId: p.id, leftAt: null }, select: { userId: true } });
    await notifyMany(members.map((m) => m.userId), { type: "project.status", title: "Le statut de votre projet a changé", body: `« ${p.name} » est maintenant : ${b.status}.${b.reason ? ` Motif : ${b.reason}` : ""}`, link: `/app/projets/${p.id}` });
  }
  res.json({ ok: true });
});

adminRouter.delete("/projects/:id", requirePermission("admin:content:manage"), async (req, res) => {
  const p = await prisma.project.findUnique({ where: { id: String(req.params.id) }, include: { escrow: { include: { _count: { select: { events: true } } } }, _count: { select: { attestations: true, badgeAwards: true } } } });
  if (!p) throw notFound("Projet introuvable");
  if (p.escrow && (p.escrow.status !== "NON_DEPOSE" || p.escrow._count.events > 0)) throw conflict("Des mouvements de séquestre sont enregistrés pour ce projet : il ne peut pas être supprimé (passez-le au statut « Annulé » à la place).", "HAS_PAYMENTS");
  if (p.status === "TERMINE" || p._count.attestations > 0 || p._count.badgeAwards > 0) throw conflict("Ce projet a donné lieu à des attestations ou des badges : il ne peut pas être supprimé (passez-le au statut « Annulé » à la place).", "HAS_CREDENTIALS");
  const members = await prisma.projectMember.findMany({ where: { projectId: p.id, leftAt: null }, select: { userId: true } });
  await prisma.$transaction([
    prisma.project.delete({ where: { id: p.id } }), // tâches, documents, messages, jalons, livrables, évaluations : supprimés en cascade
    prisma.team.delete({ where: { id: p.teamId } }),
    prisma.challenge.update({ where: { id: p.challengeId }, data: { status: "ARCHIVE" } }),
  ]);
  await audit(req, "project.admin_deleted", { entityType: "Project", entityId: p.id, metadata: { name: p.name, status: p.status } });
  await notifyMany(members.map((m) => m.userId), { type: "project.deleted", title: "Un projet a été supprimé", body: `« ${p.name} » a été supprimé par l'administration.`, email: true });
  res.json({ ok: true });
});

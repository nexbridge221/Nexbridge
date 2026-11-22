import { config } from "../../config";
import { Router } from "express";
import { z } from "zod";
import { adminUserCreateSchema, adminUserPatchSchema, badgePatchSchema, evaluationModerationSchema, faqSchema, partnerSchema, reportHandleSchema, settingsSchema, skillAdminSchema, skillMergeSchema, testimonialSchema } from "@nexbridge/shared";
import { badRequest, conflict, forbidden, notFound, prisma, slugify } from "../../platform/core";
import { audit, authenticate, requirePermission, validateBody, validateQuery } from "../../platform/http";
import { fromMinor } from "../challenges/helpers";
import { notify } from "../notifications/routes";
import { forgotPassword } from "../auth/service";
import { DEFAULT_WEIGHTS } from "../matching/engine";
import { toCsv } from "./csv";

export const backofficeRouter = Router();
backofficeRouter.use(authenticate, requirePermission("admin:access"));
const cursorQ = z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50), q: z.string().trim().max(80).optional() });
const paginate = <T extends { id: string }>(rows: T[], limit: number) => ({ items: rows.length > limit ? rows.slice(0, limit) : rows, nextCursor: rows.length > limit ? rows[limit - 1]!.id : null });

/* ---------------- Utilisateurs ---------------- */
backofficeRouter.get("/users", requirePermission("admin:users:manage"), async (req, res) => {
  const q = validateQuery(cursorQ.extend({ role: z.string().optional(), status: z.string().optional() }), req.query);
  const rows = await prisma.user.findMany({
    where: { status: q.status ? (q.status as never) : { not: "ANONYMISE" }, ...(q.role ? { role: q.role as never } : {}), ...(q.q ? { OR: [{ email: { contains: q.q, mode: "insensitive" } }, { firstName: { contains: q.q, mode: "insensitive" } }, { lastName: { contains: q.q, mode: "insensitive" } }] } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, status: true, createdAt: true, lastLoginAt: true, emailVerifiedAt: true, isDemo: true },
  });
  const { items, nextCursor } = paginate(rows, q.limit);
  res.json({ users: items.map((u) => ({ ...u, emailVerified: Boolean(u.emailVerifiedAt), emailVerifiedAt: undefined })), nextCursor });
});
backofficeRouter.patch("/users/:id", requirePermission("admin:users:manage"), validateBody(adminUserPatchSchema), async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!target || target.status === "ANONYMISE") throw notFound("Utilisateur introuvable");
  if (target.id === req.auth!.id) throw forbidden("Vous ne pouvez pas modifier votre propre compte ici.", "SELF_MODIFY");
  const isSuper = req.auth!.role === "SUPER_ADMIN";
  if ((target.role === "ADMIN" || target.role === "SUPER_ADMIN") && !isSuper) throw forbidden("Seul un super administrateur peut modifier un administrateur.", "SUPER_ONLY");
  const b = req.body as z.infer<typeof adminUserPatchSchema>;
  if (b.role && !isSuper) throw forbidden("Seul un super administrateur peut changer un rôle.", "SUPER_ONLY");
  // Un rôle métier (entreprise, étudiant, mentor, référent) ne peut pas être converti : profils et historique associés. Seuls ADMIN <-> SUPER_ADMIN sont permutables.
  const adminRoles = ["ADMIN", "SUPER_ADMIN"];
  if (b.role && !(adminRoles.includes(b.role) && adminRoles.includes(target.role))) throw badRequest("Le rôle d'un utilisateur métier ne peut pas être converti (profils et historique associés). Créez un nouveau compte.", "ROLE_CONVERSION");
  if (b.email && b.email !== target.email && (await prisma.user.findUnique({ where: { email: b.email } }))) throw conflict("Cette adresse e-mail est déjà utilisée.", "EMAIL_TAKEN");
  await prisma.user.update({ where: { id: target.id }, data: {
    ...(b.status ? { status: b.status } : {}), ...(b.role ? { role: b.role } : {}),
    ...(b.firstName ? { firstName: b.firstName } : {}), ...(b.lastName ? { lastName: b.lastName } : {}), ...(b.phone !== undefined ? { phone: b.phone } : {}), ...(b.email ? { email: b.email } : {}),
  } });
  if (b.status === "SUSPENDU" || b.role || (b.email && b.email !== target.email)) await prisma.refreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } }); // sessions coupées
  const action = b.status ? `user.${b.status === "SUSPENDU" ? "suspended" : "reactivated"}` : b.role ? "user.role_changed" : "user.updated";
  await audit(req, action, { entityType: "User", entityId: target.id, metadata: { from: { status: target.status, role: target.role, email: target.email }, to: { ...b, email: b.email ? "(modifié)" : undefined }, reason: b.reason } });
  res.json({ ok: true });
});

/** Création d'un compte administrateur (Super Admin) : la personne choisit son mot de passe via un lien envoyé par e-mail. */
backofficeRouter.post("/users", requirePermission("superadmin:config"), validateBody(adminUserCreateSchema), async (req, res) => {
  const b = req.body as z.infer<typeof adminUserCreateSchema>;
  if (await prisma.user.findUnique({ where: { email: b.email } })) throw conflict("Cette adresse e-mail est déjà utilisée.", "EMAIL_TAKEN");
  const u = await prisma.user.create({ data: { email: b.email, firstName: b.firstName, lastName: b.lastName, role: "ADMIN", status: "ACTIF", emailVerifiedAt: new Date() } });
  await forgotPassword(u.email);
  await audit(req, "user.admin_created", { entityType: "User", entityId: u.id });
  res.status(201).json({ ok: true, id: u.id });
});

/** Envoie un lien de réinitialisation du mot de passe à l'utilisateur (le mot de passe n'est jamais vu par l'administrateur). */
backofficeRouter.post("/users/:id/reset-password", requirePermission("admin:users:manage"), async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!target || target.status === "ANONYMISE") throw notFound("Utilisateur introuvable");
  if ((target.role === "ADMIN" || target.role === "SUPER_ADMIN") && req.auth!.role !== "SUPER_ADMIN") throw forbidden("Seul un super administrateur peut agir sur un administrateur.", "SUPER_ONLY");
  await forgotPassword(target.email);
  await audit(req, "user.password_reset_sent", { entityType: "User", entityId: target.id });
  res.json({ ok: true });
});

/** Suppression = anonymisation (droit à l'oubli) : les données partagées avec d'autres acteurs restent cohérentes, le compte ne peut plus se connecter. */
backofficeRouter.delete("/users/:id", requirePermission("admin:users:manage"), async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!target || target.status === "ANONYMISE") throw notFound("Utilisateur introuvable");
  if (target.id === req.auth!.id) throw forbidden("Vous ne pouvez pas supprimer votre propre compte ici.", "SELF_MODIFY");
  if (target.role === "SUPER_ADMIN") throw forbidden("Un compte Super Admin ne peut pas être supprimé.", "SUPER_PROTECTED");
  if (target.role === "ADMIN" && req.auth!.role !== "SUPER_ADMIN") throw forbidden("Seul un super administrateur peut supprimer un administrateur.", "SUPER_ONLY");
  const owned = await prisma.companyMember.findFirst({ where: { userId: target.id, isOwner: true }, include: { company: { include: { _count: { select: { members: true } } } } } });
  if (owned && owned.company._count.members > 1) throw conflict("Ce compte est propriétaire d'une organisation avec d'autres collaborateurs : retirez-les d'abord.", "COMPANY_HAS_MEMBERS");
  await prisma.$transaction([
    prisma.refreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.oAuthAccount.deleteMany({ where: { userId: target.id } }),
    prisma.notification.deleteMany({ where: { userId: target.id } }),
    prisma.user.update({ where: { id: target.id }, data: { email: `supprime-${target.id}@anonymise.invalid`, firstName: "Utilisateur", lastName: "supprimé", phone: null, passwordHash: null, twoFactorEnabled: false, twoFactorSecret: null, status: "ANONYMISE" } }),
    prisma.studentProfile.updateMany({ where: { userId: target.id }, data: { bio: null, city: null, isPortfolioPublic: false, slug: `supprime-${slugify(target.id)}` } }),
    prisma.mentorProfile.updateMany({ where: { userId: target.id }, data: { bio: null } }),
  ]);
  await audit(req, "user.deleted_by_admin", { entityType: "User", entityId: target.id, metadata: { role: target.role } });
  res.json({ ok: true });
});

/* ---------------- Compétences ---------------- */
backofficeRouter.get("/skills", requirePermission("admin:skills:manage"), async (_req, res) => {
  const rows = await prisma.skill.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }], include: { _count: { select: { studentSkills: true, challengeSkills: true } } } });
  res.json({ skills: rows.map((s) => ({ id: s.id, name: s.name, category: s.category, active: s.active, mergedIntoId: s.mergedIntoId, students: s._count.studentSkills, challenges: s._count.challengeSkills })) });
});
backofficeRouter.post("/skills", requirePermission("admin:skills:manage"), validateBody(skillAdminSchema), async (req, res) => {
  const slug = slugify(req.body.name);
  if (await prisma.skill.findUnique({ where: { slug } })) throw conflict("Cette compétence existe déjà.");
  const s = await prisma.skill.create({ data: { name: req.body.name, slug, category: req.body.category } });
  await audit(req, "skill.created", { entityType: "Skill", entityId: s.id });
  res.status(201).json({ skill: s });
});
backofficeRouter.patch("/skills/:id", requirePermission("admin:skills:manage"), validateBody(skillAdminSchema.partial().extend({ active: z.boolean().optional() })), async (req, res) => {
  const s = await prisma.skill.update({ where: { id: String(req.params.id) }, data: req.body }).catch(() => null);
  if (!s) throw notFound("Compétence introuvable");
  await audit(req, "skill.updated", { entityType: "Skill", entityId: s.id });
  res.json({ skill: s });
});
/** Fusion de tags : transfère les usages vers la compétence cible (en gardant le niveau le plus élevé), puis désactive la source. */
backofficeRouter.post("/skills/:id/merge", requirePermission("admin:skills:manage"), validateBody(skillMergeSchema), async (req, res) => {
  const from = String(req.params.id); const into = req.body.intoId as string;
  if (from === into) throw badRequest("Source et cible identiques.");
  const [a, b] = await Promise.all([prisma.skill.findUnique({ where: { id: from } }), prisma.skill.findUnique({ where: { id: into } })]);
  if (!a || !b) throw notFound("Compétence introuvable");
  const order = ["SENSIBILISE", "PRATICIEN", "CONFIRME", "EXPERT"];
  await prisma.$transaction(async (tx) => {
    for (const ss of await tx.studentSkill.findMany({ where: { skillId: from } })) {
      const ex = await tx.studentSkill.findUnique({ where: { studentId_skillId: { studentId: ss.studentId, skillId: into } } });
      if (ex) { if (order.indexOf(ss.level) > order.indexOf(ex.level)) await tx.studentSkill.update({ where: { id: ex.id }, data: { level: ss.level } }); await tx.studentSkill.delete({ where: { id: ss.id } }); } else await tx.studentSkill.update({ where: { id: ss.id }, data: { skillId: into } });
    }
    for (const cs of await tx.challengeSkill.findMany({ where: { skillId: from } })) { if (await tx.challengeSkill.findUnique({ where: { challengeId_skillId: { challengeId: cs.challengeId, skillId: into } } })) await tx.challengeSkill.delete({ where: { id: cs.id } }); else await tx.challengeSkill.update({ where: { id: cs.id }, data: { skillId: into } }); }
    for (const es of await tx.evaluationSkill.findMany({ where: { skillId: from } })) { if (await tx.evaluationSkill.findUnique({ where: { evaluationId_skillId: { evaluationId: es.evaluationId, skillId: into } } })) await tx.evaluationSkill.delete({ where: { id: es.id } }); else await tx.evaluationSkill.update({ where: { id: es.id }, data: { skillId: into } }); }
    await tx.skill.update({ where: { id: from }, data: { active: false, mergedIntoId: into } });
  });
  await audit(req, "skill.merged", { entityType: "Skill", entityId: from, metadata: { into } });
  res.json({ ok: true });
});

/* ---------------- Badges ---------------- */
backofficeRouter.get("/badges", requirePermission("admin:skills:manage"), async (_req, res) => {
  const rows = await prisma.badgeDefinition.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }], include: { _count: { select: { awards: true } } } });
  res.json({ badges: rows.map((b) => ({ id: b.id, code: b.code, name: b.name, description: b.description, type: b.type, active: b.active, awards: b._count.awards })) });
});
backofficeRouter.patch("/badges/:id", requirePermission("admin:skills:manage"), validateBody(badgePatchSchema), async (req, res) => {
  const b = await prisma.badgeDefinition.update({ where: { id: String(req.params.id) }, data: req.body }).catch(() => null);
  if (!b) throw notFound("Badge introuvable");
  await audit(req, "badge.updated", { entityType: "BadgeDefinition", entityId: b.id });
  res.json({ badge: b });
});

/* ---------------- Modération des évaluations et signalements ---------------- */
backofficeRouter.get("/evaluations", requirePermission("admin:content:manage"), async (req, res) => {
  const q = validateQuery(cursorQ.extend({ hidden: z.enum(["true", "false"]).optional() }), req.query);
  const rows = await prisma.evaluation.findMany({ where: q.hidden ? { hidden: q.hidden === "true" } : {}, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}), include: { project: { select: { name: true } } } });
  const { items, nextCursor } = paginate(rows, q.limit);
  const users = await prisma.user.findMany({ where: { id: { in: items.flatMap((e) => [e.evaluatorId, e.subjectUserId]).filter(Boolean) as string[] } }, select: { id: true, firstName: true, lastName: true } });
  const um = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  res.json({ evaluations: items.map((e) => ({ id: e.id, type: e.type, rating: e.rating, comment: e.comment, hidden: e.hidden, hiddenReason: e.hiddenReason, project: e.project.name, evaluator: um.get(e.evaluatorId) ?? "—", subject: e.subjectUserId ? um.get(e.subjectUserId) ?? "—" : null, submittedAt: e.submittedAt })), nextCursor });
});
backofficeRouter.patch("/evaluations/:id", requirePermission("admin:content:manage"), validateBody(evaluationModerationSchema), async (req, res) => {
  const e = await prisma.evaluation.findUnique({ where: { id: String(req.params.id) } });
  if (!e) throw notFound("Évaluation introuvable");
  await prisma.evaluation.update({ where: { id: e.id }, data: { hidden: req.body.hidden, hiddenReason: req.body.hidden ? req.body.reason : null } });
  if (e.subjectUserId) { // l'indice de fiabilité ne tient compte que des évaluations visibles
    const agg = await prisma.evaluation.aggregate({ where: { subjectUserId: e.subjectUserId, hidden: false, type: { in: ["ENTREPRISE_ETUDIANT", "MENTOR_ETUDIANT", "PAIR"] } }, _avg: { rating: true } });
    await prisma.studentProfile.updateMany({ where: { userId: e.subjectUserId }, data: { reliabilityIndex: agg._avg.rating != null ? Math.round(agg._avg.rating * 100) / 100 : null } });
  }
  await audit(req, req.body.hidden ? "evaluation.hidden" : "evaluation.restored", { entityType: "Evaluation", entityId: e.id, metadata: { reason: req.body.reason } });
  res.json({ ok: true });
});
backofficeRouter.get("/reports", requirePermission("admin:content:manage"), async (req, res) => {
  const q = validateQuery(z.object({ status: z.enum(["OUVERT", "TRAITE", "REJETE"]).default("OUVERT") }), req.query);
  const rows = await prisma.report.findMany({ where: { status: q.status }, orderBy: { createdAt: "asc" }, take: 100 });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.reporterId) } }, select: { id: true, firstName: true, lastName: true } });
  const um = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  res.json({ reports: rows.map((r) => ({ ...r, reporter: um.get(r.reporterId) ?? "—" })) });
});
backofficeRouter.patch("/reports/:id", requirePermission("admin:content:manage"), validateBody(reportHandleSchema), async (req, res) => {
  const r = await prisma.report.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound("Signalement introuvable");
  await prisma.report.update({ where: { id: r.id }, data: { status: req.body.status, handledNote: req.body.note, handledById: req.auth!.id, handledAt: new Date() } });
  await audit(req, "report.handled", { entityType: "Report", entityId: r.id, metadata: { status: req.body.status } });
  await notify(r.reporterId, { type: "system.report", title: "Votre signalement a été examiné", body: req.body.note });
  res.json({ ok: true });
});

/* ---------------- Journal d'audit (super administrateur) ---------------- */
backofficeRouter.get("/audit", requirePermission("admin:audit:read"), async (req, res) => {
  const q = validateQuery(cursorQ.extend({ action: z.string().max(60).optional(), actorId: z.string().uuid().optional() }), req.query);
  const rows = await prisma.auditLog.findMany({ where: { ...(q.action ? { action: { startsWith: q.action } } : {}), ...(q.actorId ? { actorId: q.actorId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
  const { items, nextCursor } = paginate(rows, q.limit);
  const users = await prisma.user.findMany({ where: { id: { in: items.map((a) => a.actorId).filter(Boolean) as string[] } }, select: { id: true, firstName: true, lastName: true, role: true } });
  const um = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName} (${u.role})`]));
  res.json({ entries: items.map((a) => ({ id: a.id, action: a.action, actor: a.actorId ? um.get(a.actorId) ?? a.actorId : "Système", entityType: a.entityType, entityId: a.entityId, metadata: a.metadata, createdAt: a.createdAt })), nextCursor });
});

/* ---------------- Contenus : témoignages, partenaires, FAQ, messages ---------------- */
function cms<T extends z.ZodTypeAny>(path: string, schema: T, model: "testimonial" | "partner" | "faqItem") {
  const m = (prisma as unknown as Record<string, { findMany: Function; create: Function; update: Function; delete: Function }>)[model]!;
  backofficeRouter.get(`/${path}`, requirePermission("admin:content:manage"), async (_req, res) => res.json({ items: await m.findMany({ orderBy: { position: "asc" } }) }));
  backofficeRouter.post(`/${path}`, requirePermission("admin:content:manage"), validateBody(schema), async (req, res) => { const row = await m.create({ data: req.body }); await audit(req, `${model}.created`, { entityType: model, entityId: (row as { id: string }).id }); res.status(201).json({ item: row }); });
  backofficeRouter.put(`/${path}/:id`, requirePermission("admin:content:manage"), validateBody(schema), async (req, res) => { const row = await m.update({ where: { id: String(req.params.id) }, data: req.body }).catch(() => null); if (!row) throw notFound(); await audit(req, `${model}.updated`, { entityType: model, entityId: String(req.params.id) }); res.json({ item: row }); });
  backofficeRouter.delete(`/${path}/:id`, requirePermission("admin:content:manage"), async (req, res) => { await m.delete({ where: { id: String(req.params.id) } }).catch(() => null); await audit(req, `${model}.deleted`, { entityType: model, entityId: String(req.params.id) }); res.status(204).end(); });
}
cms("testimonials", testimonialSchema, "testimonial"); cms("partners", partnerSchema, "partner"); cms("faq", faqSchema, "faqItem");
backofficeRouter.get("/contact-messages", requirePermission("admin:content:manage"), async (_req, res) => res.json({ messages: await prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 }) }));
backofficeRouter.post("/contact-messages/:id/handled", requirePermission("admin:content:manage"), async (req, res) => { await prisma.contactMessage.update({ where: { id: String(req.params.id) }, data: { handledAt: new Date() } }).catch(() => null); res.status(204).end(); });

/* ---------------- État des intégrations (jamais les secrets) ---------------- */
backofficeRouter.get("/integrations", requirePermission("admin:access"), (_req, res) => {
  const row = (key: string, label: string, configured: boolean, active: string, inactive: string, envVars: string[]) => ({ key, label, configured, detail: configured ? active : inactive, envVars });
  res.json({ integrations: [
    row("mail", "E-mails (SendGrid)", Boolean(config.mail.sendgridKey), "Envoi réel actif (non testé de bout en bout : aucune clé disponible en développement).", "Non configuré : les e-mails sont écrits dans la boîte de développement, rien n'est envoyé.", ["SENDGRID_API_KEY", "MAIL_FROM"]),
    row("storage", "Stockage de fichiers", config.storage.driver === "s3", "S3 actif.", "Disque local : acceptable en développement uniquement.", ["STORAGE_DRIVER", "S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_ENDPOINT"]),
    row("stripe", "Paiement par carte (Stripe)", Boolean(config.stripe.secretKey), config.stripe.webhookSecret ? "Clé et webhook configurés." : "Clé présente mais STRIPE_WEBHOOK_SECRET manque : les paiements ne seraient pas enregistrés.", "Non configuré : seul le virement manuel est proposé.", ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]),
    row("google", "Connexion Google", config.oauth.google, "Identifiants présents.", "Non configuré.", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
    row("linkedin", "Connexion LinkedIn", config.oauth.linkedin, "Identifiants présents.", "Non configuré.", ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"]),
    row("redis", "Redis (jetons révoqués, file de tâches)", Boolean(config.redisUrl), "Configuré.", "Non configuré : dégradation signalée dans les journaux.", ["REDIS_URL"]),
  ] });
});

/* ---------------- Configuration (super administrateur) ---------------- */
backofficeRouter.get("/settings", requirePermission("superadmin:config"), async (_req, res) => {
  const [c, w] = await Promise.all([prisma.systemSetting.findUnique({ where: { key: "commission.rateBps" } }), prisma.systemSetting.findUnique({ where: { key: "nexmatch.weights" } })]);
  res.json({ commissionRateBps: (c?.value as number | undefined) ?? 1500, nexmatchWeights: { ...DEFAULT_WEIGHTS, ...((w?.value as object | undefined) ?? {}) }, paymentsNote: "La commission est enregistrée mais aucun paiement n'est actif (phase 5)." });
});
backofficeRouter.put("/settings", requirePermission("superadmin:config"), validateBody(settingsSchema), async (req, res) => {
  const b = req.body as z.infer<typeof settingsSchema>;
  if (b.nexmatchWeights) { const w = b.nexmatchWeights; if (w.skills + w.education + w.availability + w.sector + w.history <= 0) throw badRequest("La somme des pondérations doit être positive.", "BAD_WEIGHTS"); await prisma.systemSetting.upsert({ where: { key: "nexmatch.weights" }, create: { key: "nexmatch.weights", value: w, updatedBy: req.auth!.id }, update: { value: w, updatedBy: req.auth!.id } }); }
  if (b.commissionRateBps !== undefined) await prisma.systemSetting.upsert({ where: { key: "commission.rateBps" }, create: { key: "commission.rateBps", value: b.commissionRateBps, updatedBy: req.auth!.id }, update: { value: b.commissionRateBps, updatedBy: req.auth!.id } });
  await audit(req, "settings.updated", { entityType: "SystemSetting", metadata: b as Record<string, unknown> });
  res.json({ ok: true });
});

/* ---------------- Exports CSV ---------------- */
backofficeRouter.get("/export/:kind.csv", async (req, res) => {
  const kind = String(req.params.kind);
  let rows: (string | number | boolean | Date | null | undefined)[][];
  if (kind === "users") {
    if (!(req.auth!.role === "ADMIN" || req.auth!.role === "SUPER_ADMIN")) throw forbidden();
    const u = await prisma.user.findMany({ where: { status: { not: "ANONYMISE" } }, orderBy: { createdAt: "asc" } });
    rows = [["Identifiant", "Prénom", "Nom", "E-mail", "Rôle", "Statut", "Créé le", "Dernière connexion"], ...u.map((x) => [x.id, x.firstName, x.lastName, x.email, x.role, x.status, x.createdAt, x.lastLoginAt])];
  } else if (kind === "challenges") {
    const c = await prisma.challenge.findMany({ orderBy: { createdAt: "asc" }, include: { company: { select: { legalName: true } }, sector: { select: { name: true } } } });
    rows = [["Identifiant", "Titre", "Entreprise", "Secteur", "Statut", "Équipe", "Durée (sem.)", "Budget", "Devise", "Publié le"], ...c.map((x) => [x.id, x.title, x.company.legalName, x.sector?.name, x.status, x.teamSize, x.durationWeeks, fromMinor(x.budgetAmount, x.budgetCurrency), x.budgetCurrency, x.publishedAt])];
  } else if (kind === "projects") {
    const p = await prisma.project.findMany({ orderBy: { createdAt: "asc" } });
    rows = [["Identifiant", "Projet", "Statut", "Progression %", "Début", "Clôture"], ...p.map((x) => [x.id, x.name, x.status, x.progressPct, x.startDate, x.closedAt])];
  } else if (kind === "evaluations") {
    const e = await prisma.evaluation.findMany({ orderBy: { submittedAt: "asc" }, include: { project: { select: { name: true } } } });
    rows = [["Projet", "Type", "Note", "Masquée", "Date"], ...e.map((x) => [x.project.name, x.type, x.rating, x.hidden, x.submittedAt])];
  } else throw notFound("Export inconnu");
  await audit(req, `export.${kind}`);
  res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${kind}.csv"`);
  res.send(toCsv(rows));
});

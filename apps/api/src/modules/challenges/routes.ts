import { Router } from "express";
import { z } from "zod";
import { challengeDraftSchema, challengeSubmitSchema, EDITABLE_CHALLENGE_STATUSES } from "@nexbridge/shared";
import { badRequest, conflict, notFound, prisma, randomToken, slugify } from "../../platform/core";
import { audit, authenticate, requirePermission, requireRoles, requireVerifiedEmail, validateBody } from "../../platform/http";
import { notifyMany } from "../notifications/routes";
import { adminUserIds, challengeInclude, companyUserIds, fromMinor, loadOwnChallenge, recordStatus, serializeChallenge, toMinor } from "./helpers";

type Tpl = { title?: string; context: string; objectives: string; deliverables: { title: string; format: string }[]; milestones: { title: string; targetWeek: number }[]; skills: string[]; sector?: string; durationWeeks?: number };
export const challengeRouter = Router();
challengeRouter.use(authenticate, requireRoles("ENTREPRISE"));

/** Modèles sectoriels (aide à structurer le brief). */
challengeRouter.get("/templates", async (_req, res) => {
  res.json({ templates: await prisma.briefTemplate.findMany({ where: { active: true }, orderBy: { position: "asc" } }) });
});

challengeRouter.get("/", async (req, res) => {
  const member = await prisma.companyMember.findFirst({ where: { userId: req.auth!.id } });
  if (!member) return void res.json({ challenges: [] });
  const rows = await prisma.challenge.findMany({
    where: { companyId: member.companyId },
    orderBy: { updatedAt: "desc" },
    include: { sector: { select: { name: true } }, _count: { select: { applications: true } }, project: { select: { id: true, status: true, progressPct: true } } },
    take: 100,
  });
  res.json({ challenges: rows.map((c) => ({ id: c.id, title: c.title || "Défi sans titre", slug: c.slug, status: c.status, sector: c.sector?.name ?? null, teamSize: c.teamSize, durationWeeks: c.durationWeeks, budgetAmount: fromMinor(c.budgetAmount, c.budgetCurrency), budgetCurrency: c.budgetCurrency, updatedAt: c.updatedAt, publishedAt: c.publishedAt, applications: c._count.applications, project: c.project, rejectionReason: c.rejectionReason })) });
});

/** Crée un brouillon vide, éventuellement pré-rempli par un modèle sectoriel. */
challengeRouter.post("/", requireVerifiedEmail, requirePermission("challenge:create"), validateBody(z.object({ templateId: z.string().uuid().optional() })), async (req, res) => {
  const member = await prisma.companyMember.findFirst({ where: { userId: req.auth!.id }, include: { company: true } });
  if (!member) throw badRequest("Aucune organisation rattachée à ce compte");
  let pre = null as Tpl | null;
  if (req.body.templateId) {
    const tpl = await prisma.briefTemplate.findFirst({ where: { id: req.body.templateId, active: true } });
    if (!tpl) throw notFound("Modèle introuvable");
    pre = tpl.content as unknown as Tpl;
  }
  const sector = pre?.sector ? await prisma.sector.findFirst({ where: { name: pre.sector } }) : null;
  const skills = pre?.skills?.length ? await prisma.skill.findMany({ where: { slug: { in: pre.skills.map(slugify) } } }) : [];
  const challenge = await prisma.challenge.create({
    data: {
      companyId: member.companyId, createdById: req.auth!.id, title: "", slug: `defi-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`,
      context: pre?.context ?? "", objectives: pre?.objectives, sectorId: sector?.id, durationWeeks: pre?.durationWeeks,
      deliverables: pre ? { create: pre.deliverables.map((d) => ({ title: d.title, format: d.format as never })) } : undefined,
      milestones: pre ? { create: pre.milestones.map((m) => ({ title: m.title, targetWeek: m.targetWeek })) } : undefined,
      skills: skills.length ? { create: skills.map((s) => ({ skillId: s.id, minLevel: "PRATICIEN" as const })) } : undefined,
    },
    include: challengeInclude,
  });
  await recordStatus(challenge.id, null, "BROUILLON", req.auth!.id, pre ? "Créé depuis un modèle" : "Créé");
  await audit(req, "challenge.created", { entityType: "Challenge", entityId: challenge.id });
  res.status(201).json({ challenge: serializeChallenge(challenge) });
});

challengeRouter.get("/:id", async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  const full = await prisma.challenge.findUniqueOrThrow({
    where: { id: challenge.id },
    include: { ...challengeInclude, history: { orderBy: { at: "desc" }, take: 30 }, reviews: { orderBy: { createdAt: "desc" }, take: 5 }, _count: { select: { applications: true } }, project: { select: { id: true, status: true } } },
  });
  const { _count, ...rest } = full;
  res.json({ challenge: { ...serializeChallenge(rest), applications: _count.applications } });
});

/** Enregistrement (brouillon automatique) : mises à jour partielles, règle du CDC : modifiable seulement en BROUILLON / EN_REVISION. */
challengeRouter.put("/:id", requirePermission("challenge:update:own"), validateBody(challengeDraftSchema), async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  if (!EDITABLE_CHALLENGE_STATUSES.includes(challenge.status)) throw conflict("Ce défi ne peut plus être modifié (seuls les statuts Brouillon et En révision le permettent).", "NOT_EDITABLE");
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
    await tx.challenge.update({
      where: { id: challenge.id },
      data: {
        ...(b.title !== undefined ? { title: b.title } : {}), ...(b.context !== undefined ? { context: b.context } : {}),
        ...(b.sectorId !== undefined ? { sectorId: b.sectorId } : {}), ...(b.keywords ? { keywords: [...new Set(b.keywords)] } : {}),
        ...(b.objectives !== undefined ? { objectives: b.objectives } : {}), ...(b.teamSize !== undefined ? { teamSize: b.teamSize } : {}),
        ...(b.minStudyLevel !== undefined ? { minStudyLevel: b.minStudyLevel } : {}),
        ...(b.desiredStart !== undefined ? { desiredStart: b.desiredStart ? new Date(b.desiredStart) : null } : {}),
        ...(b.durationWeeks !== undefined ? { durationWeeks: b.durationWeeks } : {}),
        ...(b.budgetCurrency ? { budgetCurrency: b.budgetCurrency } : {}),
        ...(b.budgetAmount !== undefined ? { budgetAmount: toMinor(b.budgetAmount, currency) } : {}),
        budgetPublic: false, ...(b.paymentTerms !== undefined ? { paymentTerms: b.paymentTerms } : {}),
      },
    });
    if (b.deliverables) { await tx.challengeDeliverable.deleteMany({ where: { challengeId: challenge.id } }); await tx.challengeDeliverable.createMany({ data: b.deliverables.map((d) => ({ challengeId: challenge.id, title: d.title, format: d.format, description: d.description })) }); }
    if (b.milestones) { await tx.challengeMilestone.deleteMany({ where: { challengeId: challenge.id } }); await tx.challengeMilestone.createMany({ data: b.milestones.map((m) => ({ challengeId: challenge.id, title: m.title, description: m.description, targetWeek: m.targetWeek })) }); }
    if (b.skills) { await tx.challengeSkill.deleteMany({ where: { challengeId: challenge.id } }); await tx.challengeSkill.createMany({ data: b.skills.map((s) => ({ challengeId: challenge.id, skillId: s.skillId, minLevel: s.minLevel, weight: s.weight })) }); }
  });
  const updated = await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id }, include: challengeInclude });
  res.json({ challenge: serializeChallenge(updated) });
});

/** Aperçu des critères de soumission (utilisé par l'assistant avant l'envoi). */
async function submissionCheck(challengeId: string) {
  const c = await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId }, include: { skills: true, deliverables: true, milestones: true } });
  const result = challengeSubmitSchema.safeParse({
    title: c.title, context: c.context, sectorId: c.sectorId ?? undefined, objectives: c.objectives ?? "", deliverables: c.deliverables, teamSize: c.teamSize, skills: c.skills,
    durationWeeks: c.durationWeeks ?? undefined, budgetAmount: fromMinor(c.budgetAmount, c.budgetCurrency) ?? undefined, budgetCurrency: c.budgetCurrency, milestones: c.milestones,
  });
  const errors: Record<string, string> = {};
  if (!result.success) for (const i of result.error.issues) errors[i.path.join(".") || "_"] ??= i.message;
  return { c, errors };
}

challengeRouter.get("/:id/check", async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  const { errors } = await submissionCheck(challenge.id);
  res.json({ ready: Object.keys(errors).length === 0, errors });
});

challengeRouter.post("/:id/submit", requireVerifiedEmail, requirePermission("challenge:submit"), async (req, res) => {
  const { challenge, companyId } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  if (challenge.status !== "BROUILLON") throw conflict("Seul un brouillon peut être soumis.", "NOT_DRAFT");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  if (company.kycStatus !== "VALIDE") throw badRequest("Votre organisation doit être validée (KYC) avant de soumettre un défi.", "KYC_REQUIRED");
  const { errors } = await submissionCheck(challenge.id);
  if (Object.keys(errors).length) throw badRequest("Le brief est incomplet", "VALIDATION_ERROR", errors);
  await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "EN_REVISION", rejectionReason: null } });
  await recordStatus(challenge.id, "BROUILLON", "EN_REVISION", req.auth!.id, "Soumis pour validation");
  await audit(req, "challenge.submitted", { entityType: "Challenge", entityId: challenge.id });
  await notifyMany(await adminUserIds(), { type: "challenge.review", title: "Nouveau défi à valider", body: `« ${challenge.title} » — ${company.legalName}`, link: "/app/admin/defis", email: true });
  res.json({ ok: true, status: "EN_REVISION" });
});

/** Retrait de la file de validation (retour en brouillon pour modifier). */
challengeRouter.post("/:id/withdraw", async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  if (challenge.status !== "EN_REVISION") throw conflict("Ce défi n'est pas en révision.");
  await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "BROUILLON" } });
  await recordStatus(challenge.id, "EN_REVISION", "BROUILLON", req.auth!.id, "Retiré de la validation par l'entreprise");
  res.json({ ok: true, status: "BROUILLON" });
});

/** Clôture anticipée d'un défi publié, sans équipe (motif obligatoire). La clôture d'un projet en cours relève de la phase 3-5 (évaluations, fonds). */
challengeRouter.post("/:id/close", validateBody(z.object({ reason: z.string().trim().min(5, "Motif obligatoire").max(500) })), async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  if (challenge.status !== "PUBLIE") throw conflict("Seul un défi publié peut être clôturé ici. La clôture d'un projet en cours sera disponible avec NexSpace.", "NOT_CLOSABLE");
  if (await prisma.team.count({ where: { challengeId: challenge.id, status: { in: ["EN_VALIDATION", "VALIDEE"] } } })) throw conflict("Une équipe est en cours de validation : annulez-la d'abord.", "TEAM_ACTIVE");
  await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "CLOTURE", closedAt: new Date(), closeReason: req.body.reason } });
  await recordStatus(challenge.id, "PUBLIE", "CLOTURE", req.auth!.id, req.body.reason);
  await prisma.application.updateMany({ where: { challengeId: challenge.id, status: { in: ["SOUMISE", "PRE_SELECTIONNEE"] } }, data: { status: "REFUSEE" } });
  res.json({ ok: true, status: "CLOTURE" });
});

challengeRouter.delete("/:id", async (req, res) => {
  const { challenge } = await loadOwnChallenge(req.auth!.id, String(req.params.id));
  if (challenge.status !== "BROUILLON") throw conflict("Seul un brouillon peut être supprimé.");
  await prisma.challenge.delete({ where: { id: challenge.id } });
  await audit(req, "challenge.deleted", { entityType: "Challenge", entityId: challenge.id });
  res.status(204).end();
});

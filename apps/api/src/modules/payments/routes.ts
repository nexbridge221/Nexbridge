import { createHmac, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import { COMMISSION_MAX_BPS, COMMISSION_MIN_BPS } from "@nexbridge/shared";
import { config } from "../../config";
import { badRequest, conflict, forbidden, logger, notFound, prisma } from "../../platform/core";
import { audit, authenticate, requireRoles, validateBody } from "../../platform/http";
import { getAccess } from "../nexspace/access";
import { notify } from "../notifications/routes";

/**
 * PAIEMENTS — ARCHITECTURE ET REGISTRE.
 * NEXBRIDGE n'exécute aucun virement et ne détient aucun fonds : ce module enregistre (1) ce que l'entreprise
 * déclare avoir payé, (2) ce qu'un administrateur CONSTATE sur le relevé bancaire ou chez Stripe, (3) la libération
 * ou le remboursement décidés. Aucune transaction n'est simulée : sans clé Stripe, seul le virement manuel est proposé.
 */

const bigint = (v: bigint | number | null | undefined) => (v == null ? null : Number(v));
const refFor = (projectId: string) => `NB-${projectId.replace(/-/g, "").slice(-8).toUpperCase()}`;

async function commissionBps(): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key: "commission.rateBps" } });
  const v = (s?.value as number | undefined) ?? 1500;
  return Math.min(COMMISSION_MAX_BPS, Math.max(COMMISSION_MIN_BPS, v));
}
async function bankInstructions(): Promise<string | null> {
  const s = await prisma.systemSetting.findUnique({ where: { key: "payments.bankInstructions" } });
  return (s?.value as string | undefined) ?? null;
}

/** Montants dus : budget du défi + commission (taux courant, borné 15–20 %). null si le budget n'est pas renseigné. */
async function amounts(projectId: string) {
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { challenge: { select: { budgetAmount: true, budgetCurrency: true } } } });
  const budget = p.challenge.budgetAmount;
  const bps = await commissionBps();
  if (budget == null) return { budget: null, commission: null, total: null, bps, currency: p.challenge.budgetCurrency };
  const commission = (budget * BigInt(bps)) / 10000n;
  return { budget: Number(budget), commission: Number(commission), total: Number(budget + commission), bps, currency: p.challenge.budgetCurrency };
}

async function view(projectId: string) {
  const escrow = await prisma.escrow.findUniqueOrThrow({ where: { projectId }, include: { events: { orderBy: { createdAt: "desc" } } } });
  const due = await amounts(projectId);
  const instructions = await bankInstructions();
  const declared = escrow.events.find((e) => e.kind === "VIREMENT_DECLARE" && !escrow.events.some((x) => (x.kind === "DEPOT_CONFIRME" || x.kind === "DEPOT_REJETE") && x.createdAt > e.createdAt));
  return {
    status: escrow.status, amountHeld: bigint(escrow.amountHeld), currency: escrow.currency, due, reference: refFor(projectId),
    bankInstructions: instructions, stripeAvailable: Boolean(config.stripe.secretKey), pendingDeclaration: declared ? { amount: Number(declared.amount), reference: declared.reference, at: declared.createdAt } : null,
    events: escrow.events.map((e) => ({ id: e.id, kind: e.kind, method: e.method, amount: Number(e.amount), currency: e.currency, reference: e.reference, note: e.note, at: e.createdAt })),
    notice: "NEXBRIDGE enregistre les paiements mais n'exécute aucun virement : les mouvements sont constatés par un administrateur sur le relevé bancaire ou chez le prestataire.",
  };
}

export const paymentsRouter = Router();

/* ---------- Webhook Stripe (corps brut, signature vérifiée) ---------- */
export const stripeWebhook = Router();
stripeWebhook.post("/", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  const secret = config.stripe.webhookSecret;
  if (!secret) return void res.status(503).json({ error: { code: "NOT_CONFIGURED", message: "Webhook Stripe non configuré." } });
  const header = String(req.headers["stripe-signature"] ?? "");
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t); const sig = parts.v1;
  const body = req.body as Buffer;
  if (!t || !sig || Math.abs(Date.now() / 1000 - t) > 300) return void res.status(400).json({ error: { code: "BAD_SIGNATURE", message: "Signature invalide." } });
  const expected = createHmac("sha256", secret).update(`${t}.${body.toString("utf8")}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return void res.status(400).json({ error: { code: "BAD_SIGNATURE", message: "Signature invalide." } });
  const event = JSON.parse(body.toString("utf8")) as { id: string; type: string; data: { object: { id: string; amount_total?: number; currency?: string; payment_status?: string; client_reference_id?: string } } };
  if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") {
    const o = event.data.object;
    const escrow = o.client_reference_id ? await prisma.escrow.findUnique({ where: { projectId: o.client_reference_id } }) : null;
    if (escrow) {
      try {
        await prisma.$transaction([
          prisma.paymentEvent.create({ data: { escrowId: escrow.id, kind: "DEPOT_CONFIRME", method: "STRIPE", amount: BigInt(o.amount_total ?? 0), currency: escrow.currency, reference: o.id, externalId: event.id } }),
          prisma.escrow.update({ where: { id: escrow.id }, data: { status: "DEPOSE", amountHeld: { increment: BigInt(o.amount_total ?? 0) } } }),
        ]);
      } catch (e) { logger.info({ err: (e as Error).message }, "Webhook Stripe déjà traité (idempotence)"); }
    }
  }
  res.json({ received: true });
});

/* ---------- Entreprise : consultation et déclaration ---------- */
paymentsRouter.use(authenticate);

paymentsRouter.get("/project/:id", async (req, res) => {
  const a = await getAccess(req, String(req.params.id));
  if (a.role !== "CONTACT_ENTREPRISE" && a.role !== "ADMIN") throw notFound("Projet introuvable");
  res.json(await view(a.project.id));
});

const declareSchema = z.object({ amount: z.number().int().positive(), reference: z.string().trim().min(3).max(80), note: z.string().trim().max(300).optional() });
paymentsRouter.post("/project/:id/declare", validateBody(declareSchema), async (req, res) => {
  const a = await getAccess(req, String(req.params.id));
  if (a.role !== "CONTACT_ENTREPRISE") throw forbidden("Réservé à l'entreprise du projet.");
  const escrow = await prisma.escrow.findUniqueOrThrow({ where: { projectId: a.project.id } });
  if (escrow.status !== "NON_DEPOSE") throw conflict("Un dépôt est déjà enregistré pour ce projet.");
  const v = await view(a.project.id);
  if (v.pendingDeclaration) throw conflict("Un virement est déjà en attente de vérification.");
  await prisma.paymentEvent.create({ data: { escrowId: escrow.id, kind: "VIREMENT_DECLARE", method: "VIREMENT", amount: BigInt(req.body.amount), currency: escrow.currency, reference: req.body.reference, note: req.body.note, recordedBy: req.auth!.id } });
  await audit(req, "payment.transfer_declared", { entityType: "Project", entityId: a.project.id });
  const admins = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIF" }, select: { id: true } });
  for (const u of admins) await notify(u.id, { type: "payment.declared", title: "Virement déclaré à vérifier", body: `Projet « ${a.project.name} » — référence ${req.body.reference}`, link: "/app/admin/paiements" });
  res.status(201).json(await view(a.project.id));
});

paymentsRouter.post("/project/:id/stripe-session", async (req, res) => {
  const a = await getAccess(req, String(req.params.id));
  if (a.role !== "CONTACT_ENTREPRISE") throw forbidden("Réservé à l'entreprise du projet.");
  if (!config.stripe.secretKey) throw badRequest("Le paiement par carte n'est pas configuré. Utilisez le virement.", "NOT_CONFIGURED");
  const escrow = await prisma.escrow.findUniqueOrThrow({ where: { projectId: a.project.id } });
  if (escrow.status !== "NON_DEPOSE") throw conflict("Un dépôt est déjà enregistré pour ce projet.");
  const due = await amounts(a.project.id);
  if (due.total == null) throw badRequest("Le budget du défi n'est pas renseigné.", "NO_BUDGET");
  const form = new URLSearchParams({
    mode: "payment", client_reference_id: a.project.id, success_url: `${config.appUrl}/app/projets/${a.project.id}/paiement?paiement=ok`, cancel_url: `${config.appUrl}/app/projets/${a.project.id}/paiement?paiement=annule`,
    "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": due.currency.toLowerCase(), "line_items[0][price_data][unit_amount]": String(due.total), "line_items[0][price_data][product_data][name]": `Séquestre NEXBRIDGE — ${a.project.name}`.slice(0, 120),
  });
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${config.stripe.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  if (!r.ok) { logger.error({ status: r.status }, "Stripe a refusé la création de session"); throw badRequest("Le prestataire de paiement a refusé la demande."); }
  const s = (await r.json()) as { url: string };
  res.json({ url: s.url });
});

/* ---------- Administration : constat, libération, remboursement ---------- */
const admin = Router();
admin.use(requireRoles("ADMIN", "SUPER_ADMIN"));
paymentsRouter.use("/admin", admin);

admin.get("/pending", async (_req, res) => {
  const escrows = await prisma.escrow.findMany({ where: { OR: [{ status: "NON_DEPOSE", events: { some: { kind: "VIREMENT_DECLARE" } } }, { status: "DEPOSE", project: { status: "TERMINE" } }] }, include: { project: { select: { id: true, name: true, status: true } }, events: { orderBy: { createdAt: "desc" } } } });
  res.json({ items: escrows.map((e) => ({ projectId: e.project.id, project: e.project.name, projectStatus: e.project.status, status: e.status, amountHeld: Number(e.amountHeld), currency: e.currency, reference: refFor(e.project.id), declared: e.status === "NON_DEPOSE" ? (() => { const d = e.events.find((x) => x.kind === "VIREMENT_DECLARE"); return d && !e.events.some((x) => x.kind === "DEPOT_REJETE" && x.createdAt > d.createdAt) ? { amount: Number(d.amount), reference: d.reference, note: d.note, at: d.createdAt } : null; })() : null })).filter((i) => i.declared || i.status === "DEPOSE") });
});
admin.get("/project/:id", async (req, res) => { await prisma.project.findUniqueOrThrow({ where: { id: String(req.params.id) } }).catch(() => { throw notFound(); }); res.json(await view(String(req.params.id))); });

const confirmSchema = z.object({ amount: z.number().int().positive(), reference: z.string().trim().min(3).max(80), note: z.string().trim().max(300).optional() });
admin.post("/project/:id/confirm", validateBody(confirmSchema), async (req, res) => {
  const id = String(req.params.id);
  const escrow = await prisma.escrow.findUnique({ where: { projectId: id }, include: { project: true } });
  if (!escrow) throw notFound();
  const v = await view(id);
  if (escrow.status !== "NON_DEPOSE" || !v.pendingDeclaration) throw conflict("Aucun virement déclaré en attente pour ce projet.");
  await prisma.$transaction([
    prisma.paymentEvent.create({ data: { escrowId: escrow.id, kind: "DEPOT_CONFIRME", method: "VIREMENT", amount: BigInt(req.body.amount), currency: escrow.currency, reference: req.body.reference, note: req.body.note, recordedBy: req.auth!.id } }),
    prisma.escrow.update({ where: { id: escrow.id }, data: { status: "DEPOSE", amountHeld: BigInt(req.body.amount) } }),
  ]);
  await audit(req, "payment.deposit_confirmed", { entityType: "Project", entityId: id, metadata: { amount: req.body.amount } });
  const members = await prisma.projectMember.findMany({ where: { projectId: id, projectRole: "CONTACT_ENTREPRISE", leftAt: null } });
  for (const m of members) await notify(m.userId, { type: "payment.confirmed", title: "Dépôt confirmé", body: `Le dépôt du projet « ${escrow.project.name} » a été constaté.`, link: `/app/projets/${id}/paiement` });
  res.json(await view(id));
});

const reasonSchema = z.object({ note: z.string().trim().min(3).max(300) });
admin.post("/project/:id/reject", validateBody(reasonSchema), async (req, res) => {
  const id = String(req.params.id);
  const escrow = await prisma.escrow.findUnique({ where: { projectId: id }, include: { project: true } });
  if (!escrow) throw notFound();
  const v = await view(id);
  if (escrow.status !== "NON_DEPOSE" || !v.pendingDeclaration) throw conflict("Aucun virement déclaré en attente pour ce projet.");
  await prisma.paymentEvent.create({ data: { escrowId: escrow.id, kind: "DEPOT_REJETE", method: "VIREMENT", amount: BigInt(v.pendingDeclaration.amount), currency: escrow.currency, reference: v.pendingDeclaration.reference, note: req.body.note, recordedBy: req.auth!.id } });
  await audit(req, "payment.deposit_rejected", { entityType: "Project", entityId: id });
  const members = await prisma.projectMember.findMany({ where: { projectId: id, projectRole: "CONTACT_ENTREPRISE", leftAt: null } });
  for (const m of members) await notify(m.userId, { type: "payment.rejected", title: "Virement non retrouvé", body: req.body.note, link: `/app/projets/${id}/paiement` });
  res.json(await view(id));
});

admin.post("/project/:id/release", validateBody(reasonSchema), async (req, res) => {
  const id = String(req.params.id);
  const escrow = await prisma.escrow.findUnique({ where: { projectId: id }, include: { project: true } });
  if (!escrow) throw notFound();
  if (escrow.status !== "DEPOSE") throw conflict("Aucun fonds déposé à libérer.");
  if (escrow.project.status !== "TERMINE") throw conflict("La libération n'est possible qu'une fois le projet terminé (évaluations et validations achevées).", "PROJECT_NOT_FINISHED");
  await prisma.$transaction([
    prisma.paymentEvent.create({ data: { escrowId: escrow.id, kind: "LIBERATION_ENREGISTREE", method: "VIREMENT", amount: escrow.amountHeld, currency: escrow.currency, note: req.body.note, recordedBy: req.auth!.id } }),
    prisma.escrow.update({ where: { id: escrow.id }, data: { status: "LIBERE" } }),
  ]);
  await audit(req, "payment.released", { entityType: "Project", entityId: id });
  res.json(await view(id));
});

admin.post("/project/:id/refund", validateBody(reasonSchema), async (req, res) => {
  const id = String(req.params.id);
  const escrow = await prisma.escrow.findUnique({ where: { projectId: id } });
  if (!escrow) throw notFound();
  if (escrow.status !== "DEPOSE") throw conflict("Aucun fonds déposé à rembourser.");
  await prisma.$transaction([
    prisma.paymentEvent.create({ data: { escrowId: escrow.id, kind: "REMBOURSEMENT_ENREGISTRE", method: "VIREMENT", amount: escrow.amountHeld, currency: escrow.currency, note: req.body.note, recordedBy: req.auth!.id } }),
    prisma.escrow.update({ where: { id: escrow.id }, data: { status: "REMBOURSE" } }),
  ]);
  await audit(req, "payment.refunded", { entityType: "Project", entityId: id });
  res.json(await view(id));
});

/* Coordonnées bancaires affichées aux entreprises : Super Admin uniquement. */
const bankSchema = z.object({ text: z.string().trim().min(10).max(1000) });
paymentsRouter.get("/admin/bank-instructions", requireRoles("SUPER_ADMIN"), async (_req, res) => res.json({ text: await bankInstructions() }));
paymentsRouter.put("/admin/bank-instructions", requireRoles("SUPER_ADMIN"), validateBody(bankSchema), async (req, res) => {
  await prisma.systemSetting.upsert({ where: { key: "payments.bankInstructions" }, create: { key: "payments.bankInstructions", value: req.body.text, updatedBy: req.auth!.id }, update: { value: req.body.text, updatedBy: req.auth!.id } });
  await audit(req, "settings.bank_instructions_updated", { entityType: "SystemSetting" });
  res.json({ ok: true });
});

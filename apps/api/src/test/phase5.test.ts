import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { config } from "../config";
import { prisma } from "../platform/core";
import { app, bearer, captureMail, loginAgent, PASSWORD, registerAndVerify, resetDb, sent } from "./helpers";

beforeAll(() => captureMail());
beforeEach(async () => { await resetDb(); sent.length = 0; });
afterAll(() => prisma.$disconnect());

const post = (t: string, url: string, body: object = {}) => request(app).post(url).set(bearer(t)).send(body);
const get = (t: string, url: string) => request(app).get(url).set(bearer(t));
const put = (t: string, url: string, body: object) => request(app).put(url).set(bearer(t)).send(body);

async function fx(status: "EN_COURS" | "TERMINE" = "EN_COURS") {
  await registerAndVerify({ email: "co@example.com", role: "ENTREPRISE" });
  await registerAndVerify({ email: "stu@example.com", role: "ETUDIANT" });
  for (const [email, role] of [["admin@example.com", "ADMIN"], ["super@example.com", "SUPER_ADMIN"]] as const) await prisma.user.create({ data: { email, passwordHash: bcrypt.hashSync(PASSWORD, 4), role, status: "ACTIF", firstName: "A", lastName: "B", emailVerifiedAt: new Date() } });
  const u = (e: string) => prisma.user.findUniqueOrThrow({ where: { email: e } });
  const company = await prisma.company.findFirstOrThrow();
  const sector = await prisma.sector.upsert({ where: { slug: "s5-sector" }, create: { name: "Secteur P5", slug: "s5-sector" }, update: {} });
  const challenge = await prisma.challenge.create({ data: { sectorId: sector.id, companyId: company.id, createdById: (await u("co@example.com")).id, title: "Défi P5", slug: "defi-p5", context: "c", status: "EN_COURS", budgetAmount: 1_000_000n, budgetCurrency: "XOF" } });
  const team = await prisma.team.create({ data: { challengeId: challenge.id, origin: "MANUELLE", status: "VALIDEE" } });
  const project = await prisma.project.create({ data: { challengeId: challenge.id, teamId: team.id, companyId: company.id, name: "Projet P5", status, startDate: new Date(), members: { create: [{ userId: (await u("co@example.com")).id, projectRole: "CONTACT_ENTREPRISE" }, { userId: (await u("stu@example.com")).id, projectRole: "ETUDIANT" }] } } });
  await prisma.escrow.create({ data: { projectId: project.id, currency: "XOF" } });
  const login = async (e: string) => (await loginAgent(e)).token;
  return { id: project.id, co: await login("co@example.com"), stu: await login("stu@example.com"), admin: await login("admin@example.com"), sup: await login("super@example.com") };
}

describe("Paiements — registre et droits", () => {
  it("calcule budget + commission bornée, et n'expose rien à l'équipe étudiante", async () => {
    const f = await fx();
    const r = await get(f.co, `/api/payments/project/${f.id}`);
    expect(r.status).toBe(200);
    expect(r.body.due).toMatchObject({ budget: 1_000_000, commission: 150_000, total: 1_150_000, bps: 1500 });
    expect(r.body.stripeAvailable).toBe(false);
    expect((await get(f.stu, `/api/payments/project/${f.id}`)).status).toBe(404);
  });

  it("parcours virement : déclaration → constat admin → DEPOSE ; libération refusée tant que le projet n'est pas terminé", async () => {
    const f = await fx();
    expect((await post(f.co, `/api/payments/project/${f.id}/declare`, { amount: 1_150_000, reference: "VIR-001" })).status).toBe(201);
    expect((await post(f.co, `/api/payments/project/${f.id}/declare`, { amount: 1, reference: "VIR-002" })).status).toBe(409);
    expect((await post(f.co, `/api/payments/admin/project/${f.id}/confirm`, { amount: 1_150_000, reference: "VIR-001" })).status).toBe(403);
    expect((await get(f.admin, "/api/payments/admin/pending")).body.items).toHaveLength(1);
    const ok = await post(f.admin, `/api/payments/admin/project/${f.id}/confirm`, { amount: 1_150_000, reference: "VIR-001" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("DEPOSE");
    expect(ok.body.amountHeld).toBe(1_150_000);
    const rel = await post(f.admin, `/api/payments/admin/project/${f.id}/release`, { note: "Versement aux équipes" });
    expect(rel.status).toBe(409);
    await prisma.project.update({ where: { id: f.id }, data: { status: "TERMINE" } });
    const done = await post(f.admin, `/api/payments/admin/project/${f.id}/release`, { note: "Versement aux équipes" });
    expect(done.body.status).toBe("LIBERE");
    expect((await post(f.admin, `/api/payments/admin/project/${f.id}/refund`, { note: "x y z" })).status).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: "payment." } } })).toBeGreaterThanOrEqual(3);
  });

  it("rejet d'un virement : l'entreprise peut en déclarer un nouveau", async () => {
    const f = await fx();
    await post(f.co, `/api/payments/project/${f.id}/declare`, { amount: 5, reference: "VIR-X" });
    expect((await post(f.admin, `/api/payments/admin/project/${f.id}/reject`, { note: "Introuvable sur le relevé" })).status).toBe(200);
    expect((await post(f.co, `/api/payments/project/${f.id}/declare`, { amount: 1_150_000, reference: "VIR-Y" })).status).toBe(201);
  });

  it("carte : refusée proprement sans clé Stripe ; webhook refusé sans secret", async () => {
    const f = await fx();
    expect((await post(f.co, `/api/payments/project/${f.id}/stripe-session`)).body.error.code).toBe("NOT_CONFIGURED");
    expect((await request(app).post("/api/payments/stripe-webhook").set("Content-Type", "application/json").send("{}")).status).toBe(503);
  });

  it("coordonnées bancaires : Super Admin seulement", async () => {
    const f = await fx();
    expect((await put(f.admin, "/api/payments/admin/bank-instructions", { text: "IBAN SN00 0000 0000" })).status).toBe(403);
    expect((await put(f.sup, "/api/payments/admin/bank-instructions", { text: "IBAN SN00 0000 0000" })).status).toBe(200);
    expect((await get(f.co, `/api/payments/project/${f.id}`)).body.bankInstructions).toContain("IBAN");
  });

  it("webhook Stripe : signature vérifiée et idempotence", async () => {
    const f = await fx();
    (config.stripe as { webhookSecret?: string }).webhookSecret = "whsec_test";
    const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", amount_total: 1_150_000, payment_status: "paid", client_reference_id: f.id } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
    const bad = await request(app).post("/api/payments/stripe-webhook").set("Content-Type", "application/json").set("Stripe-Signature", `t=${t},v1=${"0".repeat(64)}`).send(body);
    expect(bad.status).toBe(400);
    for (let i = 0; i < 2; i++) expect((await request(app).post("/api/payments/stripe-webhook").set("Content-Type", "application/json").set("Stripe-Signature", `t=${t},v1=${sig}`).send(body)).status).toBe(200);
    const e = await prisma.escrow.findFirstOrThrow();
    expect(e.status).toBe("DEPOSE");
    expect(Number(e.amountHeld)).toBe(1_150_000);
    expect(await prisma.paymentEvent.count()).toBe(1);
    (config.stripe as { webhookSecret?: string }).webhookSecret = undefined;
  });
});

describe("Intégrations", () => {
  it("OAuth non configuré : redirection explicite, jamais de faux succès", async () => {
    const r = await request(app).get("/api/auth/oauth/google");
    expect(r.status).toBe(302);
    expect(r.headers.location).toContain("/connexion?oauth=non-configure");
    expect((await request(app).get("/api/auth/oauth/facebook")).status).toBe(404);
  });
  it("état des intégrations : admin seulement, sans secret", async () => {
    const f = await fx();
    expect((await get(f.co, "/api/admin/integrations")).status).toBe(403);
    const r = await get(f.admin, "/api/admin/integrations");
    expect(r.status).toBe(200);
    expect(r.body.integrations.find((i: { key: string }) => i.key === "stripe").configured).toBe(false);
    expect(JSON.stringify(r.body)).not.toMatch(/sk_|whsec_/);
  });
});

describe("Réserves — signalement et clôture", () => {
  it("un membre signale un projet, un administrateur le traite, un étudiant ne voit pas la file", async () => {
    const f = await fx();
    expect((await post(f.stu, "/api/reports", { targetType: "PROJECT", targetId: f.id, reason: "court" })).status).toBe(400);
    const ok = await post(f.stu, "/api/reports", { targetType: "PROJECT", targetId: f.id, reason: "Contenu inapproprié dans la messagerie." });
    expect(ok.status).toBe(201);
    expect((await get(f.stu, "/api/admin/reports")).status).toBe(403);
    const list = await get(f.admin, "/api/admin/reports?status=OUVERT");
    expect(list.body.reports).toHaveLength(1);
    const id = list.body.reports[0].id;
    expect((await request(app).patch(`/api/admin/reports/${id}`).set(bearer(f.admin)).send({ status: "TRAITE", note: "Pris en compte" })).status).toBe(200);
  });

  it("refuse de clôturer un projet sans aucun livrable officiel", async () => {
    const f = await fx();
    const r = await post(f.co, `/api/projects/${f.id}/close`);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("NO_DELIVERABLES");
  });
});

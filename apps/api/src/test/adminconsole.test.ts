import bcrypt from "bcryptjs";
import request from "supertest";
import { prisma } from "../platform/core";
import { app, bearer, captureMail, loginAgent, PASSWORD, registerAndVerify, resetDb, sent } from "./helpers";

beforeAll(() => captureMail());
beforeEach(async () => { await resetDb(); sent.length = 0; });
afterAll(() => prisma.$disconnect());

const call = (m: "get" | "post" | "put" | "patch" | "delete", t: string, url: string, body?: object) => { const r = request(app)[m](url).set(bearer(t)); return body ? r.send(body) : r; };

async function fx() {
  await registerAndVerify({ email: "co@example.com", role: "ENTREPRISE" });
  await registerAndVerify({ email: "stu@example.com", role: "ETUDIANT" });
  for (const [email, role] of [["admin@example.com", "ADMIN"], ["admin2@example.com", "ADMIN"], ["super@example.com", "SUPER_ADMIN"]] as const) await prisma.user.create({ data: { email, passwordHash: bcrypt.hashSync(PASSWORD, 4), role, status: "ACTIF", firstName: "A", lastName: "B", emailVerifiedAt: new Date() } });
  const u = (e: string) => prisma.user.findUniqueOrThrow({ where: { email: e } });
  const company = await prisma.company.findFirstOrThrow();
  const sector = await prisma.sector.upsert({ where: { slug: "adm-sector" }, create: { name: "Secteur Adm", slug: "adm-sector" }, update: {} });
  const owner = await u("co@example.com");
  const challenge = async (slug: string, status: "BROUILLON" | "PUBLIE" | "EN_COURS", extra = {}) => prisma.challenge.create({ data: { sectorId: sector.id, companyId: company.id, createdById: owner.id, title: `Défi ${slug}`, slug, context: "Contexte", status, budgetAmount: 500_000n, budgetCurrency: "XOF", ...extra } });
  const project = async (slug: string, status: "EN_COURS" | "EN_EVALUATION" = "EN_COURS") => {
    const ch = await challenge(slug, "EN_COURS");
    const team = await prisma.team.create({ data: { challengeId: ch.id, origin: "MANUELLE", status: "VALIDEE" } });
    const p = await prisma.project.create({ data: { challengeId: ch.id, teamId: team.id, companyId: company.id, name: `Projet ${slug}`, status, startDate: new Date(), members: { create: [{ userId: owner.id, projectRole: "CONTACT_ENTREPRISE" }, { userId: (await u("stu@example.com")).id, projectRole: "ETUDIANT" }] } } });
    await prisma.escrow.create({ data: { projectId: p.id, currency: "XOF" } });
    return { p, ch };
  };
  const login = async (e: string) => (await loginAgent(e)).token;
  return { challenge, project, u, sector, co: await login("co@example.com"), stu: await login("stu@example.com"), admin: await login("admin@example.com"), sup: await login("super@example.com") };
}

describe("Console admin — utilisateurs", () => {
  it("modifie un profil, refuse un e-mail déjà pris et protège les administrateurs", async () => {
    const f = await fx(); const stu = await f.u("stu@example.com");
    expect((await call("patch", f.stu, `/api/admin/users/${stu.id}`, { firstName: "X" })).status).toBe(403);
    const ok = await call("patch", f.admin, `/api/admin/users/${stu.id}`, { firstName: "Awa", lastName: "Ndiaye", phone: "+221700000000" });
    expect(ok.status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).toMatchObject({ firstName: "Awa", lastName: "Ndiaye", phone: "+221700000000" });
    expect((await call("patch", f.admin, `/api/admin/users/${stu.id}`, { email: "co@example.com" })).status).toBe(409);
    const other = await f.u("admin2@example.com");
    expect((await call("patch", f.admin, `/api/admin/users/${other.id}`, { firstName: "Z" })).status).toBe(403);
    expect((await call("delete", f.admin, `/api/admin/users/${other.id}`)).status).toBe(403);
  });

  it("crée un administrateur (Super Admin seulement) et envoie un lien d'activation", async () => {
    const f = await fx();
    expect((await call("post", f.admin, "/api/admin/users", { email: "new@example.com", firstName: "N", lastName: "A" })).status).toBe(403);
    const r = await call("post", f.sup, "/api/admin/users", { email: "new@example.com", firstName: "Nouvel", lastName: "Admin" });
    expect(r.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "new@example.com" } })).role).toBe("ADMIN");
    expect(sent.some((m) => m.to === "new@example.com")).toBe(true);
    expect((await call("post", f.sup, "/api/admin/users", { email: "new@example.com", firstName: "N", lastName: "A" })).status).toBe(409);
  });

  it("envoie un lien de réinitialisation et supprime (anonymise) un compte", async () => {
    const f = await fx(); const stu = await f.u("stu@example.com");
    sent.length = 0;
    expect((await call("post", f.admin, `/api/admin/users/${stu.id}/reset-password`)).status).toBe(200);
    expect(sent.some((m) => m.to === "stu@example.com")).toBe(true);
    const sup = await f.u("super@example.com");
    expect((await call("delete", f.admin, `/api/admin/users/${sup.id}`)).status).toBe(403);
    expect((await call("delete", f.admin, `/api/admin/users/${stu.id}`)).status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: stu.id } });
    expect(after.status).toBe("ANONYMISE");
    expect(after.email).toContain("anonymise.invalid");
    expect((await request(app).post("/api/auth/login").send({ email: "stu@example.com", password: PASSWORD })).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: "user.deleted_by_admin" } })).toBe(1);
  });
});

describe("Console admin — défis", () => {
  it("modifie, publie, dépublie puis supprime un défi ; refuse la suppression s'il a un projet", async () => {
    const f = await fx();
    const ch = await f.challenge("a", "BROUILLON");
    expect((await call("put", f.stu, `/api/admin/challenges/${ch.id}`, { title: "Nouveau" })).status).toBe(403);
    const upd = await call("put", f.admin, `/api/admin/challenges/${ch.id}`, { title: "Titre corrigé", teamSize: 3, budgetAmount: 800000 });
    expect(upd.status).toBe(200);
    expect(await prisma.challenge.findUniqueOrThrow({ where: { id: ch.id } })).toMatchObject({ title: "Titre corrigé", teamSize: 3, budgetPublic: false });
    expect((await call("post", f.admin, `/api/admin/challenges/${ch.id}/publish`, {})).status).toBe(200);
    expect((await request(app).get("/api/public/challenges")).body.challenges.map((c: { title: string }) => c.title)).toContain("Titre corrigé");
    expect((await call("post", f.admin, `/api/admin/challenges/${ch.id}/unpublish`, { comment: "x" })).status).toBe(400);
    expect((await call("post", f.admin, `/api/admin/challenges/${ch.id}/unpublish`, { comment: "Contenu à revoir" })).status).toBe(200);
    expect((await request(app).get("/api/public/challenges")).body.challenges).toHaveLength(0);
    expect((await call("delete", f.admin, `/api/admin/challenges/${ch.id}`)).status).toBe(200);
    expect(await prisma.challenge.count({ where: { id: ch.id } })).toBe(0);

    const { ch: withProject } = await f.project("b");
    expect((await call("delete", f.admin, `/api/admin/challenges/${withProject.id}`)).status).toBe(409);
    expect((await call("put", f.admin, `/api/admin/challenges/${withProject.id}`, { title: "X" })).status).toBe(409);
    const list = await call("get", f.admin, "/api/admin/challenges?status=TOUS");
    expect(list.status).toBe(200);
  });
});

describe("Console admin — projets", () => {
  it("modifie un projet, verrouille le statut en évaluation et supprime proprement", async () => {
    const f = await fx();
    const { p, ch } = await f.project("c");
    expect((await call("patch", f.stu, `/api/admin/projects/${p.id}`, { name: "Hack" })).status).toBe(403);
    expect((await call("patch", f.admin, `/api/admin/projects/${p.id}`, { name: "Projet renommé", status: "EN_PAUSE", reason: "Attente" })).status).toBe(200);
    expect(await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ name: "Projet renommé", status: "EN_PAUSE" });
    expect((await call("patch", f.admin, `/api/admin/projects/${p.id}`, {})).status).toBe(400);

    const locked = await f.project("d", "EN_EVALUATION");
    expect((await call("patch", f.admin, `/api/admin/projects/${locked.p.id}`, { status: "EN_COURS" })).status).toBe(409);

    const del = await call("delete", f.admin, `/api/admin/projects/${p.id}`);
    expect(del.status).toBe(200);
    expect(await prisma.project.count({ where: { id: p.id } })).toBe(0);
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id: ch.id } })).status).toBe("ARCHIVE");
  });

  it("refuse de supprimer un projet dont le séquestre a été mouvementé", async () => {
    const f = await fx();
    const { p } = await f.project("e");
    await prisma.escrow.update({ where: { projectId: p.id }, data: { status: "DEPOSE" } });
    const r = await call("delete", f.admin, `/api/admin/projects/${p.id}`);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("HAS_PAYMENTS");
    expect(await prisma.project.count({ where: { id: p.id } })).toBe(1);
  });
});

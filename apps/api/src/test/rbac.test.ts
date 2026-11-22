import request from "supertest";
import { can, ROLE_PERMISSIONS, ROLES } from "@nexbridge/shared";
import { prisma } from "../platform/core";
import { app, bearer, captureMail, loginAgent, registerAndVerify, resetDb } from "./helpers";

beforeAll(() => captureMail());
beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("Matrice de permissions (RBAC)", () => {
  it("le principe du moindre privilège est respecté", () => {
    expect(can("ETUDIANT", "challenge:create")).toBe(false);
    expect(can("ENTREPRISE", "challenge:create")).toBe(true);
    expect(can("ENTREPRISE", "application:create")).toBe(false);
    expect(can("ADMIN", "superadmin:config")).toBe(false);
    expect(can("SUPER_ADMIN", "superadmin:config")).toBe(true);
    expect(can(undefined, "profile:read:own")).toBe(false);
    for (const role of ROLES) expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
  });
});

describe("Contrôle d'accès des routes", () => {
  it("un étudiant ne peut pas accéder à l'espace entreprise, et inversement", async () => {
    await registerAndVerify({ email: "etu@example.com", role: "ETUDIANT" });
    await registerAndVerify({ email: "ent@example.com", role: "ENTREPRISE" });
    const etu = await loginAgent("etu@example.com");
    const ent = await loginAgent("ent@example.com");

    await request(app).get("/api/company").set(bearer(etu.token)).expect(403);
    await request(app).put("/api/me/student-profile").set(bearer(ent.token)).send({ city: "Dakar" }).expect(403);
    await request(app).put("/api/me/mentor-profile").set(bearer(etu.token)).send({ bio: "x" }).expect(403);
    await request(app).get("/api/company").set(bearer(ent.token)).expect(200);
  });

  it("une entreprise ne voit pas l'organisation d'une autre (périmètre par appartenance)", async () => {
    await registerAndVerify({ email: "e1@example.com", role: "ENTREPRISE", extra: { organizationName: "Alpha SARL" } });
    await registerAndVerify({ email: "e2@example.com", role: "ENTREPRISE", extra: { organizationName: "Beta SA" } });
    const e1 = await loginAgent("e1@example.com");
    const res = await request(app).get("/api/company").set(bearer(e1.token)).expect(200);
    expect(res.body.company.legalName).toBe("Alpha SARL");
    expect(JSON.stringify(res.body)).not.toContain("Beta SA");
  });

  it("un utilisateur ne peut pas télécharger le fichier d'un autre (404, existence non confirmée)", async () => {
    await registerAndVerify({ email: "o1@example.com", role: "ENTREPRISE" });
    await registerAndVerify({ email: "o2@example.com", role: "ENTREPRISE" });
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "o1@example.com" } });
    const file = await prisma.fileObject.create({ data: { ownerId: owner.id, key: "test/x.pdf", originalName: "x.pdf", mime: "application/pdf", size: 10, sha256: "a".repeat(64) } });
    const other = await loginAgent("o2@example.com");
    await request(app).get(`/api/files/${file.id}`).set(bearer(other.token)).expect(404);
  });

  it("un rôle ne peut jamais être choisi ni modifié via le profil", async () => {
    await registerAndVerify({ email: "esc@example.com" });
    const { token } = await loginAgent("esc@example.com");
    await request(app).patch("/api/me/account").set(bearer(token)).send({ role: "SUPER_ADMIN", firstName: "Z" }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "esc@example.com" } })).role).toBe("ETUDIANT");
  });
});

describe("Profil étudiant et compétences", () => {
  it("enregistre le profil, les compétences et exige un profil complet pour terminer l'onboarding", async () => {
    await registerAndVerify({ email: "p@example.com" });
    const { token } = await loginAgent("p@example.com");
    await request(app).post("/api/me/onboarding/complete").set(bearer(token)).expect(400); // incomplet

    await request(app).put("/api/me/student-profile").set(bearer(token)).send({ institutionName: "Université Test", programName: "Informatique", studyLevel: "M1", availability: "PARTIEL", city: "Dakar" }).expect(200);
    const skill = await prisma.skill.upsert({ where: { slug: "analyse-test" }, create: { name: "Analyse", slug: "analyse-test", category: "TECHNIQUE" }, update: {} });
    await request(app).put("/api/me/student-skills").set(bearer(token)).send({ skills: [{ skillId: skill.id, level: "CONFIRME" }] }).expect(200);
    await request(app).put("/api/me/student-skills").set(bearer(token)).send({ skills: [{ skillId: "00000000-0000-4000-8000-000000000000", level: "EXPERT" }] }).expect(400);
    await request(app).post("/api/me/onboarding/complete").set(bearer(token)).expect(200);

    const me = await request(app).get("/api/me").set(bearer(token)).expect(200);
    expect(me.body.user.onboardingDone).toBe(true);
    expect(me.body.profile.skills).toHaveLength(1);
    expect(me.body.profile.institution.name).toBe("Université Test");
  });

  it("anonymise le compte (droit à l'oubli) et empêche la reconnexion", async () => {
    await registerAndVerify({ email: "bye@example.com" });
    const { token } = await loginAgent("bye@example.com");
    await request(app).post("/api/me/delete-account").set(bearer(token)).send({ password: "Faux12345678" }).expect(400);
    await request(app).post("/api/me/delete-account").set(bearer(token)).send({ password: "Motdepasse2026" }).expect(204);
    const u = await prisma.user.findFirstOrThrow({ where: { status: "ANONYMISE" } });
    expect(u.email).toMatch(/anonymise\.invalid$/);
    expect(u.passwordHash).toBeNull();
    await request(app).post("/api/auth/login").send({ email: "bye@example.com", password: "Motdepasse2026" }).expect(401);
  });
});

describe("Entreprise : identifiants chiffrés et collaborateurs", () => {
  it("chiffre NINEA/RCCM en base et ne les renvoie que masqués", async () => {
    await registerAndVerify({ email: "kyc@example.com", role: "ENTREPRISE" });
    const { token } = await loginAgent("kyc@example.com");
    await request(app).post("/api/company/identifiers").set(bearer(token)).send({ ninea: "0012345672", rccm: "SN-DKR-2020-B-12345" }).expect(200);
    const row = await prisma.company.findFirstOrThrow();
    expect(row.ninea).not.toContain("0012345672");
    expect(row.ninea).toMatch(/^v1\./);
    const res = await request(app).get("/api/company").set(bearer(token)).expect(200);
    expect(res.body.company.nineaMasked).toMatch(/^•+672$/);
    expect(JSON.stringify(res.body)).not.toContain("0012345672");
  });

  it("refuse l'envoi d'un fichier dont le contenu n'est pas un PDF/PNG/JPEG, même avec une extension .pdf", async () => {
    await registerAndVerify({ email: "up@example.com", role: "ENTREPRISE" });
    const { token } = await loginAgent("up@example.com");
    const res = await request(app).post("/api/company/kyc-documents").set(bearer(token)).field("type", "NINEA").attach("file", Buffer.from("<script>alert(1)</script>"), "faux.pdf");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("FILE_TYPE_NOT_ALLOWED");
  });

  it("invite un collaborateur, qui active son compte via un lien à usage unique", async () => {
    await registerAndVerify({ email: "boss@example.com", role: "ENTREPRISE" });
    const { token } = await loginAgent("boss@example.com");
    await request(app).post("/api/company/members").set(bearer(token)).send({ email: "col@example.com", firstName: "Col", lastName: "Lab", contactRole: "DRH" }).expect(201);
    const { tokenFromMail } = await import("./helpers");
    await request(app).post("/api/auth/reset-password").send({ token: tokenFromMail("col@example.com"), password: "Collab2026motdepasse" }).expect(200);
    const col = await loginAgent("col@example.com", "Collab2026motdepasse");
    const view = await request(app).get("/api/company").set(bearer(col.token)).expect(200);
    expect(view.body.isOwner).toBe(false);
    await request(app).post("/api/company/members").set(bearer(col.token)).send({ email: "x@example.com", firstName: "X", lastName: "Y", contactRole: "AUTRE" }).expect(403); // pas propriétaire
  });
});

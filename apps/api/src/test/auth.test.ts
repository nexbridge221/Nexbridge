import request from "supertest";
import { authenticator } from "otplib";
import { prisma } from "../platform/core";
import { app, bearer, captureMail, loginAgent, PASSWORD, registerAndVerify, resetDb, sent, tokenFromMail } from "./helpers";

const CSRF = { "X-Requested-With": "nexbridge" };

beforeAll(async () => {
  captureMail();
});
beforeEach(async () => {
  await resetDb();
  sent.length = 0;
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("Inscription et vérification e-mail", () => {
  it("crée un compte en attente, puis l'active après vérification", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ role: "ETUDIANT", email: "Aminata@Example.com", password: PASSWORD, firstName: "Aminata", lastName: "Diop", acceptTerms: true })
      .expect(202);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "aminata@example.com" } });
    expect(user.status).toBe("EN_ATTENTE_EMAIL");
    expect(user.passwordHash).not.toBe(PASSWORD);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, coût 12
    expect(await prisma.studentProfile.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.consent.count({ where: { userId: user.id } })).toBe(2);

    await request(app).post("/api/auth/verify-email").send({ token: tokenFromMail("aminata@example.com") }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("ACTIF");
  });

  it("refuse un jeton de vérification réutilisé", async () => {
    await request(app).post("/api/auth/register").send({ role: "MENTOR", email: "m@example.com", password: PASSWORD, firstName: "M", lastName: "K", acceptTerms: true }).expect(202);
    const token = tokenFromMail("m@example.com");
    await request(app).post("/api/auth/verify-email").send({ token }).expect(200);
    await request(app).post("/api/auth/verify-email").send({ token }).expect(400);
  });

  it("ne révèle pas qu'un compte existe déjà (même réponse, un seul compte)", async () => {
    const body = { role: "ETUDIANT", email: "dup@example.com", password: PASSWORD, firstName: "A", lastName: "B", acceptTerms: true };
    await request(app).post("/api/auth/register").send(body).expect(202);
    await request(app).post("/api/auth/register").send(body).expect(202);
    expect(await prisma.user.count({ where: { email: "dup@example.com" } })).toBe(1);
    expect(sent.some((m) => m.subject.includes("déjà un compte"))).toBe(true);
  });

  it("valide les données côté serveur (mot de passe faible, CGU, rôle administrateur interdit)", async () => {
    const base = { role: "ETUDIANT", email: "v@example.com", password: PASSWORD, firstName: "A", lastName: "B", acceptTerms: true };
    await request(app).post("/api/auth/register").send({ ...base, password: "court1" }).expect(400);
    await request(app).post("/api/auth/register").send({ ...base, acceptTerms: false }).expect(400);
    await request(app).post("/api/auth/register").send({ ...base, role: "ADMIN" }).expect(400);
    await request(app).post("/api/auth/register").send({ ...base, role: "ENTREPRISE" }).expect(400); // raison sociale manquante
    expect(await prisma.user.count()).toBe(0);
  });

  it("crée l'organisation (propriétaire) pour une entreprise et l'établissement pour un référent", async () => {
    await registerAndVerify({ email: "ent@example.com", role: "ENTREPRISE" });
    await registerAndVerify({ email: "ref@example.com", role: "REFERENT_ACADEMIQUE" });
    const m = await prisma.companyMember.findFirstOrThrow({ include: { company: true } });
    expect(m.isOwner).toBe(true);
    expect(m.company.kycStatus).toBe("NON_SOUMIS");
    const inst = await prisma.institution.findFirstOrThrow();
    expect(inst.status).toBe("EN_ATTENTE"); // à valider par un administrateur
  });
});

describe("Connexion, sessions et verrouillage", () => {
  it("refuse de façon identique un mauvais mot de passe et un compte inconnu", async () => {
    await registerAndVerify({ email: "a@example.com" });
    const wrong = await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "Faux12345678" });
    const unknown = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "Faux12345678" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it("bloque le compte après 5 échecs consécutifs (même avec le bon mot de passe)", async () => {
    await registerAndVerify({ email: "lock@example.com" });
    for (let i = 0; i < 5; i++) await request(app).post("/api/auth/login").send({ email: "lock@example.com", password: "Faux12345678" }).expect(401);
    const res = await request(app).post("/api/auth/login").send({ email: "lock@example.com", password: PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("émet un jeton d'accès RS256 et pose un cookie de rafraîchissement HttpOnly", async () => {
    await registerAndVerify({ email: "s@example.com" });
    const res = await request(app).post("/api/auth/login").send({ email: "s@example.com", password: PASSWORD }).expect(200);
    const header = JSON.parse(Buffer.from(res.body.accessToken.split(".")[0], "base64url").toString());
    expect(header.alg).toBe("RS256");
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("nb_refresh="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("fait tourner le refresh token et révoque toute la famille en cas de réutilisation", async () => {
    await registerAndVerify({ email: "r@example.com" });
    const first = await request(app).post("/api/auth/login").send({ email: "r@example.com", password: PASSWORD });
    const cookie1 = (first.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("nb_refresh="))!.split(";")[0]!;

    await request(app).post("/api/auth/refresh").set("Cookie", cookie1).expect(403); // sans en-tête CSRF
    const second = await request(app).post("/api/auth/refresh").set(CSRF).set("Cookie", cookie1).expect(200);
    const cookie2 = (second.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("nb_refresh="))!.split(";")[0]!;
    expect(cookie2).not.toBe(cookie1);

    // Rejouer l'ancien jeton = vol suspecté : tout est révoqué, y compris le jeton valide le plus récent.
    await request(app).post("/api/auth/refresh").set(CSRF).set("Cookie", cookie1).expect(401);
    await request(app).post("/api/auth/refresh").set(CSRF).set("Cookie", cookie2).expect(401);
  });

  it("refuse l'accès sans jeton, avec un jeton falsifié ou pour un compte suspendu", async () => {
    await request(app).get("/api/me").expect(401);
    await request(app).get("/api/me").set(bearer("abc.def.ghi")).expect(401);
    await registerAndVerify({ email: "susp@example.com" });
    const { token } = await loginAgent("susp@example.com");
    await request(app).get("/api/me").set(bearer(token)).expect(200);
    await prisma.user.update({ where: { email: "susp@example.com" }, data: { status: "SUSPENDU" } });
    await request(app).get("/api/me").set(bearer(token)).expect(403); // effet immédiat, sans attendre l'expiration du jeton
  });
});

describe("Mot de passe", () => {
  it("réinitialise le mot de passe, révoque les sessions et invalide le lien", async () => {
    await registerAndVerify({ email: "pw@example.com" });
    await request(app).post("/api/auth/forgot-password").send({ email: "pw@example.com" }).expect(202);
    const token = tokenFromMail("pw@example.com");
    await request(app).post("/api/auth/reset-password").send({ token, password: "Nouveau2026pass" }).expect(200);
    await request(app).post("/api/auth/reset-password").send({ token, password: "Autre2026motdepasse" }).expect(400);
    await request(app).post("/api/auth/login").send({ email: "pw@example.com", password: PASSWORD }).expect(401);
    await request(app).post("/api/auth/login").send({ email: "pw@example.com", password: "Nouveau2026pass" }).expect(200);
  });

  it("répond de la même façon pour un e-mail inconnu (aucun e-mail envoyé)", async () => {
    sent.length = 0;
    await request(app).post("/api/auth/forgot-password").send({ email: "inconnu@example.com" }).expect(202);
    expect(sent).toHaveLength(0);
  });
});

describe("Authentification à deux facteurs (TOTP)", () => {
  it("exige un code valide à la connexion une fois activée", async () => {
    await registerAndVerify({ email: "2fa@example.com" });
    const { token } = await loginAgent("2fa@example.com");
    const setup = await request(app).post("/api/auth/2fa/setup").set(bearer(token)).expect(200);
    await request(app).post("/api/auth/2fa/enable").set(bearer(token)).send({ code: "000000" }).expect(400);
    await request(app).post("/api/auth/2fa/enable").set(bearer(token)).send({ code: authenticator.generate(setup.body.secret) }).expect(200);

    const noCode = await request(app).post("/api/auth/login").send({ email: "2fa@example.com", password: PASSWORD });
    expect(noCode.status).toBe(401);
    expect(noCode.body.error.code).toBe("TOTP_REQUIRED");
    await request(app).post("/api/auth/login").send({ email: "2fa@example.com", password: PASSWORD, totp: "123456" }).expect(401);
    await request(app).post("/api/auth/login").send({ email: "2fa@example.com", password: PASSWORD, totp: authenticator.generate(setup.body.secret) }).expect(200);
    // Le secret est stocké chiffré, jamais en clair.
    const stored = (await prisma.user.findUniqueOrThrow({ where: { email: "2fa@example.com" } })).twoFactorSecret!;
    expect(stored).not.toContain(setup.body.secret);
  });
});

import request from "supertest";
import { prisma } from "../platform/core";
import { app, captureMail, resetDb, sent, tokenFromMail } from "./helpers";

beforeAll(() => captureMail());
beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("Formulaires publics", () => {
  const valid = { name: "Awa Ba", email: "awa@example.com", subject: "Partenariat", message: "Bonjour, je souhaite en savoir plus.", consent: true };

  it("enregistre un message de contact valide", async () => {
    await request(app).post("/api/public/contact").send(valid).expect(201);
    expect(await prisma.contactMessage.count()).toBe(1);
  });
  it("exige le consentement et rejette les données invalides", async () => {
    await request(app).post("/api/public/contact").send({ ...valid, consent: false }).expect(400);
    await request(app).post("/api/public/contact").send({ ...valid, email: "pas-un-email" }).expect(400);
    await request(app).post("/api/public/contact").send({ ...valid, message: "court" }).expect(400);
    expect(await prisma.contactMessage.count()).toBe(0);
  });
  it("rejette les robots (champ piège anti-spam rempli)", async () => {
    await request(app).post("/api/public/contact").send({ ...valid, website: "http://spam" }).expect(400);
    expect(await prisma.contactMessage.count()).toBe(0);
  });
  it("inscrit à la newsletter en double opt-in", async () => {
    await request(app).post("/api/public/newsletter").send({ email: "nl@example.com", consent: true }).expect(202);
    let sub = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: "nl@example.com" } });
    expect(sub.confirmedAt).toBeNull();
    await request(app).post("/api/public/newsletter/confirm").send({ token: tokenFromMail("nl@example.com") }).expect(200);
    sub = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: "nl@example.com" } });
    expect(sub.confirmedAt).not.toBeNull();
    expect(sent.length).toBeGreaterThan(0);
  });
});

describe("Marketplace publique et chiffres clés", () => {
  async function makeChallenge(overrides: Record<string, unknown>) {
    const user = await prisma.user.create({ data: { email: `o${Math.random()}@x.test`, role: "ENTREPRISE", firstName: "O", lastName: "W" } });
    const company = await prisma.company.create({ data: { legalName: "Société Réelle" } });
    return prisma.challenge.create({
      data: { companyId: company.id, createdById: user.id, title: "Un défi", slug: `defi-${Math.random().toString(36).slice(2)}`, context: "Contexte détaillé du défi.", budgetAmount: 1000000n, ...overrides },
    });
  }

  it("n'expose que les défis PUBLIÉS et n'expose jamais le budget", async () => {
    await makeChallenge({ status: "PUBLIE", publishedAt: new Date(), budgetPublic: false, title: "Publié sans budget" });
    await makeChallenge({ status: "PUBLIE", publishedAt: new Date(), budgetPublic: true, title: "Publié avec budget" });
    await makeChallenge({ status: "BROUILLON", title: "Brouillon secret" });
    await makeChallenge({ status: "EN_REVISION", title: "En révision secret" });
    const res = await request(app).get("/api/public/challenges").expect(200);
    const titles = res.body.challenges.map((c: { title: string }) => c.title);
    expect(titles).toEqual(expect.arrayContaining(["Publié sans budget", "Publié avec budget"]));
    expect(titles).not.toContain("Brouillon secret");
    expect(titles).not.toContain("En révision secret");
    for (const c of res.body.challenges) { expect(c).not.toHaveProperty("budget"); expect(JSON.stringify(c)).not.toContain("1000000"); }
    const one = await request(app).get(`/api/public/challenges/${res.body.challenges[0].slug}`).expect(200);
    expect(one.body.challenge).not.toHaveProperty("budget");
    expect(JSON.stringify(one.body)).not.toContain("1000000");
  });

  it("ne sert pas un défi non publié par son identifiant public", async () => {
    const c = await makeChallenge({ status: "BROUILLON" });
    await request(app).get(`/api/public/challenges/${c.slug}`).expect(404);
  });

  it("ne compte que du réel : une base vide donne des zéros, et les données de démo sont exclues hors mode démo", async () => {
    const empty = await request(app).get("/api/public/stats").expect(200);
    expect(empty.body).toMatchObject({ students: 0, mentors: 0, companies: 0, institutions: 0, challenges: 0, isDemoData: false });
    await makeChallenge({ status: "PUBLIE", publishedAt: new Date(), isDemo: true });
    const res = await request(app).get("/api/public/stats").expect(200);
    expect(res.body.challenges).toBe(0);
    const list = await request(app).get("/api/public/challenges").expect(200);
    expect(list.body.challenges).toHaveLength(0);
  });
});

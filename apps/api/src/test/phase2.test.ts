import bcrypt from "bcryptjs";
import request from "supertest";
import { prisma } from "../platform/core";
import { processTeamDeadlines } from "../modules/teams/service";
import { app, bearer, captureMail, loginAgent, PASSWORD, registerAndVerify, resetDb, sent } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

beforeAll(() => captureMail());
beforeEach(async () => { await resetDb(); sent.length = 0; });
afterAll(() => prisma.$disconnect());

/* ---------- Aides de scénario ---------- */
async function ensureRef() {
  const sector = await prisma.sector.upsert({ where: { slug: "test-fintech" }, create: { name: "Test FinTech", slug: "test-fintech" }, update: {} });
  const mk = (slug: string, name: string) => prisma.skill.upsert({ where: { slug }, create: { name, slug, category: "TECHNIQUE" }, update: {} });
  const [ml, ux, fin] = await Promise.all([mk("t-ml", "Test ML"), mk("t-ux", "Test UX"), mk("t-fin", "Test Finance")]);
  return { sector, ml, ux, fin };
}
async function makeAdmin(email: string, role: "ADMIN" | "SUPER_ADMIN" = "ADMIN") {
  await prisma.user.create({ data: { email, passwordHash: bcrypt.hashSync(PASSWORD, 4), role, status: "ACTIF", emailVerifiedAt: new Date(), firstName: "Ad", lastName: "Min" } });
  return loginAgent(email);
}
async function makeStudent(email: string, opts: { skills: { id: string; level: string }[]; institution?: string; program?: string; level?: string }) {
  await registerAndVerify({ email, role: "ETUDIANT" });
  const s = await loginAgent(email);
  await request(app).put("/api/me/student-profile").set(bearer(s.token)).send({ institutionName: opts.institution ?? "Université Test", programName: opts.program ?? "Informatique", studyLevel: opts.level ?? "M1", availability: "PLEIN_TEMPS", city: "Dakar" }).expect(200);
  await request(app).put("/api/me/student-skills").set(bearer(s.token)).send({ skills: opts.skills.map((k) => ({ skillId: k.id, level: k.level })) }).expect(200);
  await request(app).post("/api/me/onboarding/complete").set(bearer(s.token)).expect(200);
  return s;
}
async function makeValidatedCompany(email: string, admin: { token: string }) {
  await registerAndVerify({ email, role: "ENTREPRISE", extra: { organizationName: "Société Phase2 SARL" } });
  const c = await loginAgent(email);
  await request(app).put("/api/company").set(bearer(c.token)).send({ legalName: "Société Phase2 SARL", sector: "Finance", country: "Sénégal" }).expect(200);
  await request(app).post("/api/company/identifiers").set(bearer(c.token)).send({ ninea: "0012345672", rccm: "SN-DKR-2020-B-12345" }).expect(200);
  await request(app).post("/api/company/kyc-documents").set(bearer(c.token)).field("type", "NINEA").attach("file", PDF, "ninea.pdf").expect(201);
  const company = await prisma.company.findFirstOrThrow({ where: { legalName: "Société Phase2 SARL" } });
  expect(company.kycStatus).toBe("EN_VERIFICATION");
  await request(app).post(`/api/admin/companies/${company.id}/kyc`).set(bearer(admin.token)).send({ decision: "VALIDE" }).expect(200);
  return { ...c, companyId: company.id };
}
async function fillChallenge(token: string, id: string, ref: Awaited<ReturnType<typeof ensureRef>>, teamSize = 3) {
  return request(app).put(`/api/challenges/${id}`).set(bearer(token)).send({
    title: "Optimiser le parcours d'inscription mobile", context: "Notre taux d'abandon à l'inscription est de 60 %. Nous souhaitons comprendre les causes et proposer un parcours repensé, testé auprès d'utilisateurs réels, avec des indicateurs de suivi.",
    sectorId: ref.sector.id, keywords: ["ux", "mobile"], objectives: "Identifier les causes d'abandon et proposer un parcours mesurable.",
    deliverables: [{ title: "Rapport d'analyse", format: "RAPPORT" }], teamSize, skills: [{ skillId: ref.ml.id, minLevel: "CONFIRME", weight: 2 }, { skillId: ref.ux.id, minLevel: "PRATICIEN", weight: 1 }, { skillId: ref.fin.id, minLevel: "PRATICIEN", weight: 1 }],
    durationWeeks: 8, milestones: [{ title: "Cadrage", targetWeek: 2 }], budgetAmount: 900000, budgetCurrency: "XOF", budgetPublic: true,
  });
}
async function publishChallenge(company: { token: string }, admin: { token: string }, ref: Awaited<ReturnType<typeof ensureRef>>, teamSize = 3) {
  const created = await request(app).post("/api/challenges").set(bearer(company.token)).send({}).expect(201);
  const id = created.body.challenge.id as string;
  await fillChallenge(company.token, id, ref, teamSize).then((r) => expect(r.status).toBe(200));
  await request(app).post(`/api/challenges/${id}/submit`).set(bearer(company.token)).expect(200);
  await request(app).post(`/api/admin/challenges/${id}/review`).set(bearer(admin.token)).send({ decision: "APPROUVE", checklist: { detail: true, budget: true, skills: true, sector: true, deliverables: true } }).expect(200);
  return id;
}

describe("NexBrief : création, soumission et validation", () => {
  it("refuse la soumission tant que l'organisation n'est pas validée (KYC) ou que le brief est incomplet", async () => {
    const ref = await ensureRef();
    const admin = await makeAdmin("admin@example.com");
    await registerAndVerify({ email: "e@example.com", role: "ENTREPRISE" });
    const c = await loginAgent("e@example.com");
    const created = await request(app).post("/api/challenges").set(bearer(c.token)).send({}).expect(201);
    const id = created.body.challenge.id;
    const kyc = await request(app).post(`/api/challenges/${id}/submit`).set(bearer(c.token));
    expect(kyc.status).toBe(400);
    expect(kyc.body.error.code).toBe("KYC_REQUIRED");

    await prisma.company.updateMany({ data: { kycStatus: "VALIDE" } });
    const incomplete = await request(app).post(`/api/challenges/${id}/submit`).set(bearer(c.token));
    expect(incomplete.status).toBe(400);
    expect(Object.keys(incomplete.body.error.details)).toEqual(expect.arrayContaining(["title", "context", "sectorId", "objectives", "skills", "budgetAmount"]));
    await fillChallenge(c.token, id, ref).then((r) => expect(r.status).toBe(200));
    await request(app).post(`/api/challenges/${id}/submit`).set(bearer(c.token)).expect(200);
    void admin;
  });

  it("refuse un brief dont les passages d'aide du modèle n'ont pas été remplacés", async () => {
    const ref = await ensureRef();
    const admin = await makeAdmin("admin@example.com");
    const company = await makeValidatedCompany("e@example.com", admin);
    const created = await request(app).post("/api/challenges").set(bearer(company.token)).send({}).expect(201);
    const id = created.body.challenge.id;
    await fillChallenge(company.token, id, ref);
    await request(app).put(`/api/challenges/${id}`).set(bearer(company.token)).send({ context: "[Décrivez votre activité financière, le parcours ou le produit concerné et le problème constaté (abandon, coût, délai, risque)…] Contexte chiffré si possible : volume d'utilisateurs." }).expect(200);
    const res = await request(app).post(`/api/challenges/${id}/submit`).set(bearer(company.token));
    expect(res.status).toBe(400);
    expect(res.body.error.details.context).toMatch(/crochets/);
  });

  it("applique le workflow Brouillon → En révision → Publié, avec historique, et verrouille la modification après publication", async () => {
    const ref = await ensureRef();
    const admin = await makeAdmin("admin@example.com");
    const company = await makeValidatedCompany("e@example.com", admin);
    const id = await publishChallenge(company, admin, ref);
    const detail = await request(app).get(`/api/challenges/${id}`).set(bearer(company.token)).expect(200);
    expect(detail.body.challenge.status).toBe("PUBLIE");
    expect(detail.body.challenge.budgetAmount).toBe(900000);
    expect(detail.body.challenge.history.map((h: { to: string }) => h.to)).toEqual(expect.arrayContaining(["BROUILLON", "EN_REVISION", "PUBLIE"]));
    await request(app).put(`/api/challenges/${id}`).set(bearer(company.token)).send({ title: "Titre modifié après publication" }).expect(409);
    const pub = await request(app).get("/api/public/challenges").expect(200);
    expect(pub.body.challenges.map((x: { id: string }) => x.id)).toContain(id);
    expect(await prisma.notification.count({ where: { type: "challenge.approved" } })).toBeGreaterThan(0);
  });

  it("renvoie en brouillon avec le motif quand l'administrateur refuse (motif obligatoire)", async () => {
    const ref = await ensureRef();
    const admin = await makeAdmin("admin@example.com");
    const company = await makeValidatedCompany("e@example.com", admin);
    const created = await request(app).post("/api/challenges").set(bearer(company.token)).send({}).expect(201);
    const id = created.body.challenge.id;
    await fillChallenge(company.token, id, ref);
    await request(app).post(`/api/challenges/${id}/submit`).set(bearer(company.token)).expect(200);
    await request(app).post(`/api/admin/challenges/${id}/review`).set(bearer(admin.token)).send({ decision: "REFUSE" }).expect(400);
    await request(app).post(`/api/admin/challenges/${id}/review`).set(bearer(admin.token)).send({ decision: "REFUSE", comment: "Précisez les livrables attendus." }).expect(200);
    const c = await request(app).get(`/api/challenges/${id}`).set(bearer(company.token)).expect(200);
    expect(c.body.challenge.status).toBe("BROUILLON");
    expect(c.body.challenge.rejectionReason).toBe("Précisez les livrables attendus.");
  });

  it("pré-remplit un brouillon depuis un modèle sectoriel", async () => {
    await ensureRef();
    await prisma.briefTemplate.deleteMany({ where: { name: "Modèle test" } });
    await prisma.briefTemplate.create({ data: { name: "Modèle test", sector: "Test FinTech", content: { context: "Contexte modèle", objectives: "Objectifs modèle", deliverables: [{ title: "Rapport", format: "RAPPORT" }], milestones: [{ title: "Jalon", targetWeek: 3 }], skills: ["t-ml"], sector: "Test FinTech", durationWeeks: 6 } } });
    await registerAndVerify({ email: "e@example.com", role: "ENTREPRISE" });
    const c = await loginAgent("e@example.com");
    const tpl = await prisma.briefTemplate.findFirstOrThrow({ where: { name: "Modèle test" } });
    const res = await request(app).post("/api/challenges").set(bearer(c.token)).send({ templateId: tpl.id }).expect(201);
    expect(res.body.challenge.context).toBe("Contexte modèle");
    expect(res.body.challenge.skills).toHaveLength(1);
    expect(res.body.challenge.deliverables).toHaveLength(1);
    expect(res.body.challenge.durationWeeks).toBe(6);
  });

  it("valide la taille d'équipe (2 à 8) et les droits : un étudiant ou une autre entreprise ne peut rien", async () => {
    const ref = await ensureRef();
    const admin = await makeAdmin("admin@example.com");
    const company = await makeValidatedCompany("e@example.com", admin);
    const created = await request(app).post("/api/challenges").set(bearer(company.token)).send({}).expect(201);
    const id = created.body.challenge.id;
    await request(app).put(`/api/challenges/${id}`).set(bearer(company.token)).send({ teamSize: 1 }).expect(400);
    await request(app).put(`/api/challenges/${id}`).set(bearer(company.token)).send({ teamSize: 9 }).expect(400);
    await request(app).put(`/api/challenges/${id}`).set(bearer(company.token)).send({ teamSize: 8 }).expect(200);

    await registerAndVerify({ email: "etu@example.com", role: "ETUDIANT" });
    await registerAndVerify({ email: "other@example.com", role: "ENTREPRISE", extra: { organizationName: "Autre SA" } });
    const etu = await loginAgent("etu@example.com");
    const other = await loginAgent("other@example.com");
    await request(app).post("/api/challenges").set(bearer(etu.token)).send({}).expect(403);
    await request(app).get(`/api/challenges/${id}`).set(bearer(other.token)).expect(404);
    await request(app).put(`/api/challenges/${id}`).set(bearer(other.token)).send({ title: "Piraté" }).expect(404);
    await request(app).post(`/api/admin/challenges/${id}/review`).set(bearer(company.token)).send({ decision: "REFUSE", comment: "x" }).expect(403);
    void ref;
  });
});

describe("Candidatures, NexMatch et validation d'équipe", () => {
  async function scenario(teamSize = 3) {
    const ref = await ensureRef();
    const admin = await makeAdmin("admin@example.com");
    const company = await makeValidatedCompany("e@example.com", admin);
    const challengeId = await publishChallenge(company, admin, ref, teamSize);
    const s1 = await makeStudent("s1@example.com", { skills: [{ id: ref.ml.id, level: "EXPERT" }], program: "Data" });
    const s2 = await makeStudent("s2@example.com", { skills: [{ id: ref.ux.id, level: "CONFIRME" }], program: "Design", institution: "École Design" });
    const s3 = await makeStudent("s3@example.com", { skills: [{ id: ref.fin.id, level: "PRATICIEN" }], program: "Gestion", institution: "École Gestion" });
    const s4 = await makeStudent("s4@example.com", { skills: [{ id: ref.ml.id, level: "PRATICIEN" }], program: "Data" });
    return { ref, admin, company, challengeId, students: [s1, s2, s3, s4] };
  }

  it("permet une candidature libre unique, réservée aux étudiants au profil complet", async () => {
    const { challengeId, students: [s1], company } = await scenario();
    await request(app).post(`/api/applications/challenge/${challengeId}`).set(bearer(s1!.token)).send({ motivation: "court" }).expect(400);
    await request(app).post(`/api/applications/challenge/${challengeId}`).set(bearer(s1!.token)).send({ motivation: "Je souhaite appliquer mes compétences en machine learning à un cas réel." }).expect(201);
    const dup = await request(app).post(`/api/applications/challenge/${challengeId}`).set(bearer(s1!.token)).send({ motivation: "Je souhaite appliquer mes compétences en machine learning à un cas réel." });
    expect(dup.status).toBe(409);
    await request(app).post(`/api/applications/challenge/${challengeId}`).set(bearer(company.token)).send({ motivation: "x".repeat(30) }).expect(403);
    const list = await request(app).get(`/api/challenges/${challengeId}/applications`).set(bearer(company.token)).expect(200);
    expect(list.body.applications).toHaveLength(1);
    expect(list.body.applications[0].score).toBeGreaterThan(0);
    const mine = await request(app).get("/api/applications").set(bearer(s1!.token)).expect(200);
    expect(mine.body.applications[0].status).toBe("SOUMISE");
  });

  it("propose jusqu'à 3 équipes expliquées et n'accepte pas deux équipes actives pour un même défi", async () => {
    const { challengeId, company } = await scenario();
    const run = await request(app).post(`/api/challenges/${challengeId}/match`).set(bearer(company.token)).send({}).expect(201);
    expect(run.body.proposals.length).toBeGreaterThanOrEqual(1);
    expect(run.body.proposals.length).toBeLessThanOrEqual(3);
    const p = run.body.proposals[0];
    expect(p.members).toHaveLength(3);
    expect(p.explanation.strengths.length).toBeGreaterThan(0);
    expect(run.body.run.engine).toBe("REGLES");
    expect(run.body.run.durationMs).toBeLessThan(5000);
    const approved = await request(app).post(`/api/challenges/${challengeId}/proposals/${p.id}/approve`).set(bearer(company.token)).expect(201);
    expect(approved.body.teamId).toBeTruthy();
    await request(app).post(`/api/challenges/${challengeId}/match`).set(bearer(company.token)).send({}).expect(409);
  });

  it("lance le projet quand tous les étudiants ont accepté : membres, escrow non déposé, défi En cours", async () => {
    const { challengeId, company, students } = await scenario();
    const run = await request(app).post(`/api/challenges/${challengeId}/match`).set(bearer(company.token)).send({}).expect(201);
    const prop = run.body.proposals[0];
    await request(app).post(`/api/challenges/${challengeId}/proposals/${prop.id}/approve`).set(bearer(company.token)).expect(201);
    for (const s of students) {
      const inv = await request(app).get("/api/applications/invitations").set(bearer(s.token)).expect(200);
      const mine = inv.body.invitations.find((i: { status: string }) => i.status === "INVITE");
      if (!mine) continue;
      await request(app).post(`/api/applications/invitations/${mine.id}/respond`).set(bearer(s.token)).send({ accept: true }).expect(200);
    }
    expect(prop.members).toHaveLength(3);
    const team = await request(app).get(`/api/challenges/${challengeId}/team`).set(bearer(company.token)).expect(200);
    expect(team.body.team.status).toBe("VALIDEE");
    expect(team.body.team.project).toBeTruthy();
    const project = await prisma.project.findFirstOrThrow({ include: { members: true, escrow: true } });
    expect(project.status).toBe("EN_COURS");
    expect(project.escrow!.status).toBe("NON_DEPOSE");
    expect(await prisma.milestone.count({ where: { projectId: project.id } })).toBe(1); // jalon du brief repris dans NexSpace
    expect(await prisma.deliverable.count({ where: { projectId: project.id } })).toBe(1); // livrable du brief repris
    expect(await prisma.channel.count({ where: { projectId: project.id, type: "GENERAL" } })).toBe(1);
    expect(project.members.filter((m) => m.projectRole === "CHEF_PROJET")).toHaveLength(1);
    expect(project.members.filter((m) => m.projectRole === "ETUDIANT")).toHaveLength(2);
    expect(project.members.filter((m) => m.projectRole === "CONTACT_ENTREPRISE").length).toBeGreaterThanOrEqual(1);
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } })).status).toBe("EN_COURS");
    expect(project.budgetAmount).toBe(900000n); // montant repris du défi ; aucun flux d'argent n'est créé
  });

  it("remplace automatiquement un étudiant qui décline par le suivant du classement NexMatch", async () => {
    const { challengeId, company, students } = await scenario();
    const run = await request(app).post(`/api/challenges/${challengeId}/match`).set(bearer(company.token)).send({}).expect(201);
    await request(app).post(`/api/challenges/${challengeId}/proposals/${run.body.proposals[0].id}/approve`).set(bearer(company.token)).expect(201);
    // Trouve un étudiant invité et fait-le décliner.
    let declined = false;
    for (const s of students) {
      const inv = await request(app).get("/api/applications/invitations").set(bearer(s.token)).expect(200);
      const mine = inv.body.invitations.find((i: { status: string }) => i.status === "INVITE");
      if (mine && !declined) { await request(app).post(`/api/applications/invitations/${mine.id}/respond`).set(bearer(s.token)).send({ accept: false }).expect(200); declined = true; }
    }
    const team = await request(app).get(`/api/challenges/${challengeId}/team`).set(bearer(company.token)).expect(200);
    const statuses = team.body.team.members.map((m: { status: string }) => m.status);
    expect(statuses.filter((x: string) => x === "DECLINE")).toHaveLength(1);
    expect(statuses.filter((x: string) => x === "INVITE").length).toBeGreaterThanOrEqual(2);
    expect(team.body.team.members.length).toBe(4); // le 4ᵉ étudiant du classement a été invité automatiquement
    expect(team.body.team.members.some((m: { replaced: boolean }) => m.replaced)).toBe(true);
  });

  it("relance après 24 h et fait expirer l'invitation après 72 h (avec remplacement)", async () => {
    const { challengeId, company } = await scenario();
    const run = await request(app).post(`/api/challenges/${challengeId}/match`).set(bearer(company.token)).send({}).expect(201);
    await request(app).post(`/api/challenges/${challengeId}/proposals/${run.body.proposals[0].id}/approve`).set(bearer(company.token)).expect(201);
    const t0 = Date.now();
    expect(await processTeamDeadlines(new Date(t0 + 3600_000))).toEqual({ expired: 0, reminded: 0 });
    const day1 = await processTeamDeadlines(new Date(t0 + 25 * 3600_000));
    expect(day1).toEqual({ expired: 0, reminded: 3 });
    expect(await prisma.notification.count({ where: { type: "match.reminder" } })).toBe(3);
    expect((await processTeamDeadlines(new Date(t0 + 26 * 3600_000))).reminded).toBe(0); // pas de doublon avant 24 h de plus
    const day3 = await processTeamDeadlines(new Date(t0 + 73 * 3600_000));
    expect(day3.expired).toBe(3);
    const members = await prisma.teamMember.findMany({});
    expect(members.filter((m) => m.status === "EXPIRE")).toHaveLength(3);
    expect(members.filter((m) => m.status === "INVITE").length).toBeGreaterThanOrEqual(1); // remplacements invités
  });

  it("n'autorise pas un étudiant à répondre à l'invitation d'un autre", async () => {
    const { challengeId, company, students } = await scenario();
    const run = await request(app).post(`/api/challenges/${challengeId}/match`).set(bearer(company.token)).send({}).expect(201);
    await request(app).post(`/api/challenges/${challengeId}/proposals/${run.body.proposals[0].id}/approve`).set(bearer(company.token)).expect(201);
    const member = await prisma.teamMember.findFirstOrThrow({ include: { student: { include: { user: true } } } });
    const outsider = students.find((s) => s.user.email !== member.student.user.email)!;
    await request(app).post(`/api/applications/invitations/${member.id}/respond`).set(bearer(outsider.token)).send({ accept: true }).expect(400);
  });

  it("exige la validation du référent académique de l'établissement avant le lancement", async () => {
    const ref = await ensureRef();
    const admin = await makeAdmin("admin@example.com");
    const company = await makeValidatedCompany("e@example.com", admin);
    const challengeId = await publishChallenge(company, admin, ref, 2);
    const a = await makeStudent("a@example.com", { skills: [{ id: ref.ml.id, level: "EXPERT" }], institution: "Université Pilote" });
    const b = await makeStudent("b@example.com", { skills: [{ id: ref.ux.id, level: "EXPERT" }], institution: "Université Pilote", program: "Design" });
    await registerAndVerify({ email: "ref@example.com", role: "REFERENT_ACADEMIQUE", extra: { institutionName: "Université Pilote" } });
    await registerAndVerify({ email: "ref2@example.com", role: "REFERENT_ACADEMIQUE", extra: { institutionName: "Autre Université" } });
    const referent = await loginAgent("ref@example.com");
    const referent2 = await loginAgent("ref2@example.com");
    // Tant que l'établissement n'est pas validé par NEXBRIDGE, aucune validation académique n'est requise.
    await request(app).post(`/api/admin/institutions/${(await prisma.institution.findFirstOrThrow({ where: { name: "Université Pilote" } })).id}/validate`).set(bearer(admin.token)).expect(200);

    const run = await request(app).post(`/api/challenges/${challengeId}/match`).set(bearer(company.token)).send({}).expect(201);
    await request(app).post(`/api/challenges/${challengeId}/proposals/${run.body.proposals[0].id}/approve`).set(bearer(company.token)).expect(201);
    for (const s of [a, b]) {
      const inv = await request(app).get("/api/applications/invitations").set(bearer(s.token)).expect(200);
      await request(app).post(`/api/applications/invitations/${inv.body.invitations[0].id}/respond`).set(bearer(s.token)).send({ accept: true }).expect(200);
    }
    expect(await prisma.project.count()).toBe(0); // en attente du référent
    const pending = await request(app).get("/api/academic/validations").set(bearer(referent.token)).expect(200);
    expect(pending.body.validations).toHaveLength(1);
    expect((await request(app).get("/api/academic/validations").set(bearer(referent2.token)).expect(200)).body.validations).toHaveLength(0);
    const teamId = pending.body.validations[0].teamId;
    await request(app).post(`/api/academic/validations/${teamId}/decide`).set(bearer(referent2.token)).send({ decision: "VALIDE" }).expect(400);
    await request(app).post(`/api/academic/validations/${teamId}/decide`).set(bearer(referent.token)).send({ decision: "REFUSE" }).expect(400); // motif obligatoire
    await request(app).post(`/api/academic/validations/${teamId}/decide`).set(bearer(referent.token)).send({ decision: "VALIDE" }).expect(200);
    expect(await prisma.project.count()).toBe(1);
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } })).status).toBe("EN_COURS");
  });

  it("n'affecte un mentor que s'il est actif et sous son plafond de projets simultanés", async () => {
    const { challengeId, company, admin, students } = await scenario(2);
    const run = await request(app).post(`/api/challenges/${challengeId}/match`).set(bearer(company.token)).send({}).expect(201);
    await request(app).post(`/api/challenges/${challengeId}/proposals/${run.body.proposals[0].id}/approve`).set(bearer(company.token)).expect(201);
    for (const s of students) {
      const inv = await request(app).get("/api/applications/invitations").set(bearer(s.token)).expect(200);
      const mine = inv.body.invitations.find((i: { status: string }) => i.status === "INVITE");
      if (mine) await request(app).post(`/api/applications/invitations/${mine.id}/respond`).set(bearer(s.token)).send({ accept: true }).expect(200);
    }
    const project = await prisma.project.findFirstOrThrow();
    await registerAndVerify({ email: "mentor@example.com", role: "MENTOR" });
    const mentor = await loginAgent("mentor@example.com");
    await prisma.mentorProfile.updateMany({ data: { onboardingDone: true, maxConcurrentProjects: 1 } });
    await request(app).post(`/api/admin/projects/${project.id}/mentor`).set(bearer(admin.token)).send({ mentorUserId: mentor.user.id }).expect(200);
    expect(await prisma.projectMember.count({ where: { projectId: project.id, projectRole: "MENTOR" } })).toBe(1);
    await request(app).post(`/api/admin/projects/${project.id}/mentor`).set(bearer(company.token)).send({ mentorUserId: mentor.user.id }).expect(403);
  });
});

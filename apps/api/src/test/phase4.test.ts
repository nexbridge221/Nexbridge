import bcrypt from "bcryptjs";
import request from "supertest";
import { prisma } from "../platform/core";
import { app, bearer, captureMail, loginAgent, PASSWORD, registerAndVerify, resetDb, sent } from "./helpers";

beforeAll(() => captureMail());
beforeEach(async () => { await resetDb(); sent.length = 0; });
afterAll(() => prisma.$disconnect());

const post = (t: string, url: string, body: object = {}) => request(app).post(url).set(bearer(t)).send(body);
const get = (t: string, url: string) => request(app).get(url).set(bearer(t));
const patch = (t: string, url: string, body: object) => request(app).patch(url).set(bearer(t)).send(body);
const put = (t: string, url: string, body: object) => request(app).put(url).set(bearer(t)).send(body);

async function skills() {
  const mk = (slug: string, name: string) => prisma.skill.upsert({ where: { slug }, create: { name, slug, category: "TECHNIQUE" }, update: {} });
  const sector = await prisma.sector.upsert({ where: { slug: "s4-sector" }, create: { name: "Secteur P4", slug: "s4-sector" }, update: {} });
  return { a: await mk("p4-a", "Analyse P4"), b: await mk("p4-b", "Design P4"), sector };
}

/** Projet EN_COURS avec entreprise, chef de projet, étudiant, mentor ; + admin et super admin. */
async function fx(opts: { institution?: { validated: boolean; referent?: boolean } } = {}) {
  const sk = await skills();
  await registerAndVerify({ email: "co@example.com", role: "ENTREPRISE" });
  await registerAndVerify({ email: "lead@example.com", role: "ETUDIANT" });
  await registerAndVerify({ email: "stu@example.com", role: "ETUDIANT" });
  await registerAndVerify({ email: "mentor@example.com", role: "MENTOR" });
  await registerAndVerify({ email: "out@example.com", role: "ETUDIANT" });
  for (const [email, role] of [["admin@example.com", "ADMIN"], ["super@example.com", "SUPER_ADMIN"]] as const) await prisma.user.create({ data: { email, passwordHash: bcrypt.hashSync(PASSWORD, 4), role, status: "ACTIF", emailVerifiedAt: new Date(), firstName: role, lastName: "Test" } });
  const u = (e: string) => prisma.user.findUniqueOrThrow({ where: { email: e } });
  const company = await prisma.company.findFirstOrThrow();
  const challenge = await prisma.challenge.create({ data: { companyId: company.id, createdById: (await u("co@example.com")).id, title: "Défi P4", slug: "defi-p4", context: "c", status: "EN_COURS", sectorId: sk.sector.id } });
  const team = await prisma.team.create({ data: { challengeId: challenge.id, origin: "MANUELLE", status: "VALIDEE" } });
  const project = await prisma.project.create({ data: { challengeId: challenge.id, teamId: team.id, companyId: company.id, name: "Projet P4", status: "EN_COURS", startDate: new Date(Date.now() - 40 * 86400_000), members: { create: [
    { userId: (await u("co@example.com")).id, projectRole: "CONTACT_ENTREPRISE" }, { userId: (await u("lead@example.com")).id, projectRole: "CHEF_PROJET" }, { userId: (await u("stu@example.com")).id, projectRole: "ETUDIANT" }, { userId: (await u("mentor@example.com")).id, projectRole: "MENTOR" }] } } });
  if (opts.institution) {
    await registerAndVerify({ email: "ref@example.com", role: "REFERENT_ACADEMIQUE", extra: { institutionName: "Fac P4" } });
    const inst = await prisma.institution.findFirstOrThrow({ where: { name: "Fac P4" } });
    await prisma.institution.update({ where: { id: inst.id }, data: { status: opts.institution.validated ? "VALIDE" : "EN_ATTENTE" } });
    await prisma.studentProfile.updateMany({ where: { user: { email: { in: ["lead@example.com", "stu@example.com"] } } }, data: { institutionId: inst.id } });
  }
  const login = async (e: string) => (await loginAgent(e)).token;
  const t = { co: await login("co@example.com"), lead: await login("lead@example.com"), stu: await login("stu@example.com"), mentor: await login("mentor@example.com"), out: await login("out@example.com"), admin: await login("admin@example.com"), super: await login("super@example.com"), ref: opts.institution ? await login("ref@example.com") : "" };
  const id = { lead: (await u("lead@example.com")).id, stu: (await u("stu@example.com")).id, mentor: (await u("mentor@example.com")).id };
  await prisma.deliverable.create({ data: { projectId: project.id, name: "Livrable final", status: "VALIDE", validatedAt: new Date() } }); // la clôture exige au moins un livrable officiel validé
  return { sk, project, t, id, base: `/api/projects/${project.id}`, challenge };
}
type F = Awaited<ReturnType<typeof fx>>;

/** Dépose toutes les évaluations obligatoires (+ options), avec des notes données. */
async function evaluateAll(f: F, rating = 5, skillId?: string) {
  const { t, id, base } = f;
  const skillsBody = skillId ? [{ skillId, demonstrated: "CONFIRME" }] : [];
  await post(t.co, `${base}/evaluations`, { type: "ENTREPRISE_PROJET", rating, adopted: true }).expect(201);
  for (const s of [id.lead, id.stu]) {
    await post(t.co, `${base}/evaluations`, { type: "ENTREPRISE_ETUDIANT", subjectUserId: s, rating, skills: skillsBody }).expect(201);
    await post(t.mentor, `${base}/evaluations`, { type: "MENTOR_ETUDIANT", subjectUserId: s, rating, skills: skillsBody }).expect(201);
  }
  await post(t.lead, `${base}/evaluations`, { type: "ETUDIANT_EXPERIENCE", rating: 4 }).expect(201);
  return post(t.stu, `${base}/evaluations`, { type: "ETUDIANT_EXPERIENCE", rating: 5 });
}

describe("Clôture et évaluations", () => {
  it("réserve la clôture à l'entreprise et au mentor, et la bloque tant qu'un livrable n'est pas validé", async () => {
    const f = await fx(); const { t, base, project } = f;
    await prisma.deliverable.create({ data: { projectId: project.id, name: "Rapport", status: "SOUMIS" } });
    await post(t.stu, `${base}/close`).expect(403);
    await post(t.out, `${base}/close`).expect(404);
    await post(t.admin, `${base}/close`).expect(403);
    const blocked = await post(t.co, `${base}/close`).expect(400);
    expect(blocked.body.error.code).toBe("DELIVERABLES_PENDING");
    await prisma.deliverable.updateMany({ data: { status: "VALIDE" } });
    await post(t.mentor, `${base}/close`).expect(200);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe("EN_EVALUATION");
    await post(t.co, `${base}/close`).expect(409); // déjà clôturé
  });

  it("n'ouvre les évaluations qu'après la clôture et propose à chacun les bons formulaires", async () => {
    const f = await fx(); const { t, id, base } = f;
    await post(t.co, `${base}/evaluations`, { type: "ENTREPRISE_PROJET", rating: 4 }).expect(409);
    await post(t.co, `${base}/close`).expect(200);
    const coTodo = (await get(t.co, `${base}/evaluations/todo`)).body;
    expect(coTodo.todo.map((x: { type: string }) => x.type).sort()).toEqual(["ENTREPRISE_ETUDIANT", "ENTREPRISE_ETUDIANT", "ENTREPRISE_PROJET"]);
    const stuTodo = (await get(t.stu, `${base}/evaluations/todo`)).body;
    expect(stuTodo.todo.map((x: { type: string; optional: boolean }) => `${x.type}${x.optional ? "*" : ""}`).sort()).toEqual(["ETUDIANT_EXPERIENCE", "ETUDIANT_MENTOR*", "PAIR*"]);
    expect((await get(t.mentor, `${base}/evaluations/todo`)).body.todo).toHaveLength(2);
    expect(coTodo.progress).toMatchObject({ required: 1 + 2 * 3, done: 0 });
    void id;
  });

  it("refuse les évaluations non autorisées, invalides ou en double", async () => {
    const f = await fx(); const { t, id, base, sk } = f;
    await post(t.co, `${base}/close`).expect(200);
    await post(t.stu, `${base}/evaluations`, { type: "ENTREPRISE_PROJET", rating: 5 }).expect(403); // l'étudiant n'évalue pas pour l'entreprise
    await post(t.co, `${base}/evaluations`, { type: "MENTOR_ETUDIANT", subjectUserId: id.stu, rating: 5 }).expect(403);
    await post(t.co, `${base}/evaluations`, { type: "ENTREPRISE_ETUDIANT", subjectUserId: id.mentor, rating: 5 }).expect(403); // le mentor n'est pas un étudiant
    await post(t.co, `${base}/evaluations`, { type: "ENTREPRISE_ETUDIANT", rating: 5 }).expect(403); // sujet manquant
    await post(t.co, `${base}/evaluations`, { type: "ENTREPRISE_PROJET", rating: 6 }).expect(400);
    await post(t.co, `${base}/evaluations`, { type: "ENTREPRISE_PROJET", rating: 0 }).expect(400);
    await post(t.co, `${base}/evaluations`, { type: "ENTREPRISE_PROJET", rating: 4, skills: [{ skillId: sk.a.id, demonstrated: "EXPERT" }] }).expect(400); // compétences : étudiants seulement
    await post(t.lead, `${base}/evaluations`, { type: "PAIR", subjectUserId: id.lead, rating: 3 }).expect(403); // pas d'auto-évaluation
    await post(t.out, `${base}/evaluations`, { type: "ETUDIANT_EXPERIENCE", rating: 3 }).expect(404);
    await post(t.co, `${base}/evaluations`, { type: "ENTREPRISE_PROJET", rating: 4 }).expect(201);
    await post(t.co, `${base}/evaluations`, { type: "ENTREPRISE_PROJET", rating: 5 }).expect(409);
  });

  it("finalise le projet quand toutes les évaluations obligatoires sont déposées : badges, compétences, attestation, indice", async () => {
    const f = await fx(); const { t, id, base, project, sk } = f;
    await post(t.co, `${base}/close`).expect(200);
    await post(t.lead, `${base}/evaluations`, { type: "PAIR", subjectUserId: id.stu, rating: 5 }).expect(201); // facultatif : ne conditionne rien
    const last = await evaluateAll(f, 5, sk.a.id);
    expect(last.status).toBe(201);
    expect(last.body.finalized).toBe(true);
    const p = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(p.status).toBe("TERMINE");
    expect(p.closedAt).not.toBeNull();
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id: p.challengeId } })).status).toBe("CLOTURE");

    const sp = await prisma.studentProfile.findFirstOrThrow({ where: { user: { email: "stu@example.com" } }, include: { skills: true, badgeAwards: { include: { badge: true } } } });
    const codes = sp.badgeAwards.map((b) => b.badge.code).sort();
    expect(codes).toEqual(expect.arrayContaining(["competence:p4-a", "excellence:top-performer", "excellence:innovateur"]));
    expect(sp.skills.find((s) => s.skillId === sk.a.id)).toMatchObject({ level: "CONFIRME", source: "PROJET" });
    expect(Number(sp.reliabilityIndex)).toBeGreaterThan(4.9); // (5 entreprise + 5 mentor + 5 pair) / 3
    const assertion = sp.badgeAwards[0]!.assertion as { "@context": string; recipient: { hashed: boolean; identity: string } };
    expect(assertion["@context"]).toContain("openbadges");
    expect(assertion.recipient.hashed).toBe(true);
    expect(JSON.stringify(assertion)).not.toContain("stu@example.com"); // l'e-mail n'apparaît jamais en clair

    const att = await prisma.attestation.findFirstOrThrow({ where: { studentId: sp.id } });
    const dl = await get(t.stu, `/api/attestations/${att.id}/download`).expect(200);
    expect(dl.headers["content-type"]).toBe("application/pdf");
    expect(Buffer.from(dl.body).subarray(0, 4).toString()).toBe("%PDF");
    await get(t.out, `/api/attestations/${att.id}/download`).expect(404);
    await get(t.lead, `/api/attestations/${att.id}/download`).expect(404); // un coéquipier n'y accède pas
    await get(t.admin, `/api/attestations/${att.id}/download`).expect(200);
    expect(await prisma.notification.count({ where: { type: "project.closed" } })).toBeGreaterThanOrEqual(4);
    await post(t.co, `${base}/evaluations`, { type: "ENTREPRISE_PROJET", rating: 3 }).expect(409); // plus d'évaluation après clôture finale
  });

  it("n'attribue aucun badge de compétence si l'évaluation moyenne est inférieure à 3/5", async () => {
    const f = await fx(); const { t, base, sk } = f;
    await post(t.co, `${base}/close`).expect(200);
    await evaluateAll(f, 2, sk.a.id).then((r) => expect(r.body.finalized).toBe(true));
    expect(await prisma.badgeAward.count()).toBe(0);
    expect(await prisma.studentSkill.count({ where: { source: "PROJET" } })).toBe(0);
    expect(await prisma.attestation.count()).toBe(2); // la participation reste attestée
  });

  it("délivre la certification NEXBRIDGE après 3 projets validés sur la même compétence", async () => {
    const f = await fx(); const { t, base, sk } = f;
    const stu = await prisma.studentProfile.findFirstOrThrow({ where: { user: { email: "stu@example.com" } } });
    const badge = await prisma.badgeDefinition.create({ data: { code: "competence:p4-a", name: "Compétence : Analyse P4", description: "d", type: "COMPETENCE", skillId: sk.a.id } });
    for (let i = 0; i < 2; i++) {
      const c = await prisma.challenge.create({ data: { companyId: f.project.companyId, createdById: f.id.lead, title: `Ancien ${i}`, slug: `ancien-${i}`, context: "c", status: "CLOTURE" } });
      const tm = await prisma.team.create({ data: { challengeId: c.id, origin: "MANUELLE", status: "VALIDEE" } });
      const pr = await prisma.project.create({ data: { challengeId: c.id, teamId: tm.id, companyId: f.project.companyId, name: `Ancien ${i}`, status: "TERMINE" } });
      await prisma.badgeAward.create({ data: { badgeId: badge.id, studentId: stu.id, projectId: pr.id } });
    }
    expect(await prisma.certification.count()).toBe(0);
    await post(t.co, `${base}/close`).expect(200);
    await evaluateAll(f, 4, sk.a.id);
    const cert = await prisma.certification.findFirstOrThrow({ where: { studentId: stu.id } });
    expect(cert.skillId).toBe(sk.a.id);
    expect(cert.basedOnProjects).toBe(3);
  });

  it("attend la décision du référent pour les établissements validés, et n'accepte que le référent concerné", async () => {
    const f = await fx({ institution: { validated: true } }); const { t, base, project } = f;
    await registerAndVerify({ email: "ref2@example.com", role: "REFERENT_ACADEMIQUE", extra: { institutionName: "Autre Fac" } });
    const ref2 = (await loginAgent("ref2@example.com")).token;
    await post(t.co, `${base}/close`).expect(200);
    expect(await prisma.academicValidation.count({ where: { projectId: project.id } })).toBe(2);
    const last = await evaluateAll(f, 4);
    expect(last.body.finalized).toBe(false); // en attente des crédits
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe("EN_EVALUATION");
    const list = (await get(t.ref, "/api/academic/credits").expect(200)).body.validations;
    expect(list).toHaveLength(2);
    expect((await get(ref2, "/api/academic/credits").expect(200)).body.validations).toHaveLength(0);
    await post(ref2, `/api/academic/credits/${list[0].id}`, { decision: "VALIDE", credits: 3 }).expect(404);
    await post(t.ref, `/api/academic/credits/${list[0].id}`, { decision: "VALIDE" }).expect(400); // crédits obligatoires
    await post(t.ref, `/api/academic/credits/${list[0].id}`, { decision: "REFUSE" }).expect(400); // motif obligatoire
    expect((await post(t.ref, `/api/academic/credits/${list[0].id}`, { decision: "VALIDE", credits: 3 }).expect(200)).body.finalized).toBe(false);
    await post(t.ref, `/api/academic/credits/${list[0].id}`, { decision: "VALIDE", credits: 2 }).expect(409); // déjà traité
    expect((await post(t.ref, `/api/academic/credits/${list[1].id}`, { decision: "REFUSE", comment: "Stage non reconnu." }).expect(200)).body.finalized).toBe(true);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe("TERMINE");
    const mine = (await get(t.stu, "/api/badges/me").expect(200)).body;
    expect([0, 3]).toContain(mine.credits.total);
  });

  it("ignore l'exigence académique quand l'établissement n'est pas validé par NEXBRIDGE", async () => {
    const f = await fx({ institution: { validated: false } }); const { t, base, project } = f;
    await post(t.co, `${base}/close`).expect(200);
    expect(await prisma.academicValidation.count({ where: { projectId: project.id } })).toBe(0);
    expect((await evaluateAll(f, 4)).body.finalized).toBe(true);
  });
});

describe("NexBadge, portfolio et vérification publique", () => {
  async function finished() {
    const f = await fx(); await post(f.t.co, `${f.base}/close`).expect(200); await evaluateAll(f, 5, f.sk.a.id);
    return f;
  }
  it("restitue le tableau NexBadge de l'étudiant, et masque les avis anonymes de coéquipiers", async () => {
    const f = await finished(); const { t, id, base } = f;
    await post(t.lead, `${base}/evaluations`, { type: "PAIR", subjectUserId: id.stu, rating: 5 }).expect(409); // projet terminé
    const me = (await get(t.stu, "/api/badges/me").expect(200)).body;
    expect(me.badges.length).toBeGreaterThanOrEqual(2);
    expect(me.attestations).toHaveLength(1);
    expect(me.radar.find((r: { category: string }) => r.category === "TECHNIQUE").value).toBe(3);
    expect(me.ratingTimeline).toHaveLength(1);
    await get(t.co, "/api/badges/me").expect(403);
    const recv = (await get(t.stu, "/api/evaluations/received").expect(200)).body.evaluations;
    expect(recv.length).toBeGreaterThanOrEqual(2);
  });
  it("ne publie le portfolio que si l'étudiant le choisit, et vérifie les attestations sans fuite de données", async () => {
    const f = await finished(); const { t } = f;
    const me = (await get(t.stu, "/api/badges/me")).body;
    await request(app).get(`/api/public/portfolio/${me.slug}`).expect(404);
    await put(t.stu, "/api/badges/me/portfolio", { isPortfolioPublic: true }).expect(200);
    const pf = (await request(app).get(`/api/public/portfolio/${me.slug}`).expect(200)).body;
    expect(pf.name).toContain("Utilisateur");
    expect(pf.badges.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(pf)).not.toMatch(/@example\.com/);
    const code = me.attestations[0].code;
    const v = (await request(app).get(`/api/public/attestations/${code}`).expect(200)).body;
    expect(v).toMatchObject({ valid: true, project: "Projet P4" });
    expect(Object.keys(v).sort()).toEqual(["company", "issuedAt", "project", "student", "valid"]);
    await request(app).get("/api/public/attestations/INEXISTANT").expect(404);
    const award = await prisma.badgeAward.findFirstOrThrow();
    const assertion = (await request(app).get(`/api/public/badges/assertions/${award.id}`).expect(200)).body;
    expect(assertion.type).toBe("Assertion");
    await request(app).get("/api/public/badges/issuer").expect(200);
  });
});

describe("Tableaux de bord NexDash (données réelles)", () => {
  it("calcule les indicateurs de chaque rôle à partir de la base, sans valeur inventée", async () => {
    const f = await fx(); const { t, base } = f;
    const co = (await get(t.co, "/api/dashboards/me").expect(200)).body;
    expect(co.projects).toMatchObject({ active: 1, finished: 0, avgProgress: 0 });
    expect(co.challengesByStatus).toEqual({ EN_COURS: 1 });
    expect(co.satisfaction.average).toBeNull(); // aucune évaluation : pas de moyenne inventée
    const st = (await get(t.stu, "/api/dashboards/me").expect(200)).body;
    expect(st.activeProjects).toHaveLength(1);
    expect(st.badges).toBe(0);
    const mt = (await get(t.mentor, "/api/dashboards/me").expect(200)).body;
    expect(mt.supervised).toEqual({ active: 1, finished: 0 });
    const ad = (await get(t.admin, "/api/dashboards/me").expect(200)).body;
    expect(ad.usersByRole.ETUDIANT).toBe(3);
    expect(ad.revenue).toBeNull();
    expect(ad.completionRate).toBe(0);
    await post(t.co, `${base}/close`).expect(200); await evaluateAll(f, 4, f.sk.a.id);
    const ad2 = (await get(t.admin, "/api/dashboards/me")).body;
    expect(ad2.completionRate).toBe(100);
    expect(ad2.nps.responses).toBe(2);
    expect((await get(t.co, "/api/dashboards/me")).body.satisfaction.average).toBe(4.5);
  });
});

describe("Référent : cohortes et exports", () => {
  it("gère les cohortes de son établissement uniquement et exporte ses étudiants", async () => {
    const f = await fx({ institution: { validated: true } }); const { t } = f;
    await registerAndVerify({ email: "ref2@example.com", role: "REFERENT_ACADEMIQUE", extra: { institutionName: "Autre Fac" } });
    const ref2 = (await loginAgent("ref2@example.com")).token;
    const c = (await post(t.ref, "/api/academic/cohorts", { name: "L3 Info", academicYear: "2026-2027" }).expect(201)).body.cohort;
    await post(t.ref, "/api/academic/cohorts", { name: "L3 Info", academicYear: "2026-2027" }).expect(409);
    await post(t.ref, "/api/academic/cohorts", { name: "X", academicYear: "2026" }).expect(400);
    const mine = (await get(t.ref, "/api/academic/students")).body.students;
    expect(mine).toHaveLength(2);
    await post(t.ref, `/api/academic/cohorts/${c.id}/members`, { studentIds: mine.map((s: { id: string }) => s.id) }).expect(201);
    const outStudent = await prisma.studentProfile.findFirstOrThrow({ where: { user: { email: "out@example.com" } } });
    await post(t.ref, `/api/academic/cohorts/${c.id}/members`, { studentIds: [outStudent.id] }).expect(400);
    await get(ref2, `/api/academic/cohorts/${c.id}`).expect(404);
    expect((await get(t.ref, `/api/academic/cohorts/${c.id}`)).body.cohort.members).toHaveLength(2);
    await get(t.stu, "/api/academic/cohorts").expect(403);
    const csv = await get(t.ref, "/api/academic/export/students.csv").expect(200);
    expect(csv.text).toContain("Étudiant");
    expect(csv.text.split("\r\n")).toHaveLength(3);
    expect(csv.text).not.toContain("@example.com");
    const pdf = await get(t.ref, "/api/academic/export/report.pdf").expect(200);
    expect(Buffer.from(pdf.body).subarray(0, 4).toString()).toBe("%PDF");
    const ov = (await get(t.ref, "/api/academic/overview")).body;
    expect(ov.totals.students).toBe(2);
    expect(ov.insertion).toBeNull();
  });
});

describe("Back-office : droits et actions", () => {
  it("sépare administrateur et super administrateur (rôles, audit, configuration)", async () => {
    const f = await fx(); const { t } = f;
    expect((await get(t.admin, "/api/admin/users").expect(200)).body.users.length).toBeGreaterThanOrEqual(7);
    await get(t.admin, "/api/admin/audit").expect(403);
    await get(t.admin, "/api/admin/settings").expect(403);
    await get(t.super, "/api/admin/audit").expect(200);
    await get(t.super, "/api/admin/settings").expect(200);
    await get(t.stu, "/api/admin/users").expect(403);
    await get(t.co, "/api/admin/export/users.csv").expect(403);
    const sUser = await prisma.user.findUniqueOrThrow({ where: { email: "super@example.com" } });
    const aUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    await patch(t.admin, `/api/admin/users/${sUser.id}`, { status: "SUSPENDU" }).expect(403); // un admin ne touche pas un admin
    await patch(t.super, `/api/admin/users/${sUser.id}`, { status: "SUSPENDU" }).expect(403); // pas de modification de soi
    await patch(t.admin, `/api/admin/users/${f.id.stu}`, { role: "ADMIN" }).expect(403); // seul le super admin change un rôle
    const conv = await patch(t.super, `/api/admin/users/${f.id.stu}`, { role: "ADMIN" }).expect(400);
    expect(conv.body.error.code).toBe("ROLE_CONVERSION");
    await patch(t.super, `/api/admin/users/${aUser.id}`, { role: "SUPER_ADMIN" }).expect(200);
    const audit = (await get(t.super, "/api/admin/audit?action=user")).body.entries;
    expect(audit.map((a: { action: string }) => a.action)).toContain("user.role_changed");
  });

  it("suspend un utilisateur : session coupée immédiatement, connexion impossible, réactivation possible", async () => {
    const f = await fx(); const { t, id } = f;
    await get(t.stu, "/api/me").expect(200);
    await patch(t.admin, `/api/admin/users/${id.stu}`, { status: "SUSPENDU", reason: "test" }).expect(200);
    await get(t.stu, "/api/me").expect(403);
    await request(app).post("/api/auth/login").send({ email: "stu@example.com", password: PASSWORD }).expect(403);
    await patch(t.admin, `/api/admin/users/${id.stu}`, { status: "ACTIF" }).expect(200);
    await request(app).post("/api/auth/login").send({ email: "stu@example.com", password: PASSWORD }).expect(200);
  });

  it("borne la commission à 15–20 % et valide les pondérations NexMatch (super administrateur)", async () => {
    const f = await fx(); const { t } = f;
    await put(t.super, "/api/admin/settings", { commissionRateBps: 2500 }).expect(400);
    await put(t.super, "/api/admin/settings", { commissionRateBps: 1000 }).expect(400);
    await put(t.admin, "/api/admin/settings", { commissionRateBps: 1800 }).expect(403);
    await put(t.super, "/api/admin/settings", { commissionRateBps: 1800 }).expect(200);
    const w = { skills: 60, education: 10, availability: 10, sector: 10, history: 10, overloadFactor: 0.7, diversityBonus3: 10, diversityBonus2: 4 };
    await put(t.super, "/api/admin/settings", { nexmatchWeights: w }).expect(200);
    await put(t.super, "/api/admin/settings", { nexmatchWeights: { ...w, skills: 0, education: 0, availability: 0, sector: 0, history: 0 } }).expect(400);
    const s = (await get(t.super, "/api/admin/settings")).body;
    expect(s.commissionRateBps).toBe(1800);
    expect(s.nexmatchWeights.skills).toBe(60);
  });

  it("fusionne des compétences sans perdre le niveau le plus élevé", async () => {
    const f = await fx(); const { t, sk } = f;
    const stu = await prisma.studentProfile.findFirstOrThrow({ where: { user: { email: "stu@example.com" } } });
    await prisma.studentSkill.create({ data: { studentId: stu.id, skillId: sk.a.id, level: "EXPERT" } });
    await prisma.studentSkill.create({ data: { studentId: stu.id, skillId: sk.b.id, level: "PRATICIEN" } });
    await post(t.admin, `/api/admin/skills/${sk.b.id}/merge`, { intoId: sk.a.id }).expect(200);
    const rows = await prisma.studentSkill.findMany({ where: { studentId: stu.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ skillId: sk.a.id, level: "EXPERT" });
    expect(await prisma.skill.findUniqueOrThrow({ where: { id: sk.b.id } })).toMatchObject({ active: false, mergedIntoId: sk.a.id });
    await post(t.admin, `/api/admin/skills/${sk.a.id}/merge`, { intoId: sk.a.id }).expect(400);
    await post(t.co, `/api/admin/skills/${sk.a.id}/merge`, { intoId: sk.b.id }).expect(403);
  });

  it("modère une évaluation (recalcule l'indice) et traite un signalement", async () => {
    const f = await fx(); const { t, base, id } = f;
    await post(t.co, `${base}/close`).expect(200); await evaluateAll(f, 4, f.sk.a.id);
    const ev = await prisma.evaluation.findFirstOrThrow({ where: { type: "ENTREPRISE_ETUDIANT", subjectUserId: id.stu } });
    const sp = () => prisma.studentProfile.findFirstOrThrow({ where: { user: { email: "stu@example.com" } } });
    expect(Number((await sp()).reliabilityIndex)).toBe(4);
    await post(t.admin, "/api/admin/evaluations/" + ev.id, {}).expect(404);
    await patch(t.admin, `/api/admin/evaluations/${ev.id}`, { hidden: true, reason: "Propos inappropriés" }).expect(200);
    expect((await get(t.stu, "/api/evaluations/received")).body.evaluations.every((e: { id: string }) => e.id !== ev.id)).toBe(true);
    await post(t.stu, "/api/reports", { targetType: "EVALUATION", targetId: ev.id, reason: "court" }).expect(400);
    await post(t.stu, "/api/reports", { targetType: "EVALUATION", targetId: ev.id, reason: "Cette évaluation contient des propos déplacés." }).expect(201);
    const rep = (await get(t.admin, "/api/admin/reports")).body.reports;
    expect(rep).toHaveLength(1);
    await patch(t.admin, `/api/admin/reports/${rep[0].id}`, { status: "TRAITE", note: "Évaluation masquée." }).expect(200);
    expect((await get(t.admin, "/api/admin/reports")).body.reports).toHaveLength(0);
    expect(await prisma.notification.count({ where: { type: "system.report" } })).toBe(1);
    await get(t.stu, "/api/admin/reports").expect(403);
  });

  it("neutralise l'injection de formules dans les exports CSV et réserve les contenus aux administrateurs", async () => {
    const f = await fx(); const { t } = f;
    await prisma.user.update({ where: { email: "out@example.com" }, data: { firstName: "=HYPERLINK(\"http://evil\")" } });
    const csv = (await get(t.admin, "/api/admin/export/users.csv").expect(200)).text;
    expect(csv).toContain("\"'=HYPERLINK");
    expect(csv).not.toContain(";\"=HYPERLINK");
    await get(t.admin, "/api/admin/export/inconnu.csv").expect(404);
    const tm = (await post(t.admin, "/api/admin/testimonials", { authorName: "Personne", quote: "Un témoignage réel et suffisamment long.", published: true }).expect(201)).body.item;
    expect((await request(app).get("/api/public/testimonials").expect(200)).body.testimonials.map((x: { id: string }) => x.id)).toContain(tm.id);
    await post(t.admin, "/api/admin/testimonials", { authorName: "P", quote: "court" }).expect(400);
    await post(t.stu, "/api/admin/testimonials", { authorName: "Personne", quote: "Un témoignage réel et suffisamment long." }).expect(403);
    await request(app).delete(`/api/admin/testimonials/${tm.id}`).set(bearer(t.admin)).expect(204);
    expect(await prisma.auditLog.count({ where: { action: "export.users" } })).toBe(1);
  });
});

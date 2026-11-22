import bcrypt from "bcryptjs";
import request from "supertest";
import { prisma } from "../platform/core";
import { app, bearer, captureMail, loginAgent, PASSWORD, registerAndVerify, resetDb, sent } from "./helpers";

const PDF = (n = 1) => Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog /N ${n} >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`);

beforeAll(() => captureMail());
beforeEach(async () => { await resetDb(); sent.length = 0; });
afterAll(() => prisma.$disconnect());

/** Construit un projet lancé (sans passer par tout le workflow d'équipe) : entreprise, chef de projet, étudiant, mentor + un étranger. */
async function fixture(opts: { mentor?: boolean; rule?: string } = {}) {
  const { mentor = true, rule = "LES_DEUX" } = opts;
  await registerAndVerify({ email: "co@example.com", role: "ENTREPRISE" });
  await registerAndVerify({ email: "lead@example.com", role: "ETUDIANT" });
  await registerAndVerify({ email: "stu@example.com", role: "ETUDIANT" });
  await registerAndVerify({ email: "out@example.com", role: "ETUDIANT" });
  if (mentor) await registerAndVerify({ email: "mentor@example.com", role: "MENTOR" });
  const u = (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
  const company = await prisma.company.findFirstOrThrow();
  const challenge = await prisma.challenge.create({ data: { companyId: company.id, createdById: (await u("co@example.com")).id, title: "Défi NexSpace", slug: "defi-nexspace", context: "Contexte", status: "EN_COURS" } });
  const team = await prisma.team.create({ data: { challengeId: challenge.id, origin: "MANUELLE", status: "VALIDEE" } });
  const project = await prisma.project.create({
    data: {
      challengeId: challenge.id, teamId: team.id, companyId: company.id, name: "Projet test", status: "EN_COURS", milestoneRule: rule, lastActivityAt: new Date(),
      members: { create: [{ userId: (await u("co@example.com")).id, projectRole: "CONTACT_ENTREPRISE" }, { userId: (await u("lead@example.com")).id, projectRole: "CHEF_PROJET" }, { userId: (await u("stu@example.com")).id, projectRole: "ETUDIANT" }, ...(mentor ? [{ userId: (await u("mentor@example.com")).id, projectRole: "MENTOR" as const }] : [])] },
    },
  });
  await prisma.user.create({ data: { email: "admin@example.com", passwordHash: bcrypt.hashSync(PASSWORD, 4), role: "ADMIN", status: "ACTIF", emailVerifiedAt: new Date(), firstName: "Ad", lastName: "Min" } });
  const login = async (e: string) => (await loginAgent(e)).token;
  const t = { co: await login("co@example.com"), lead: await login("lead@example.com"), stu: await login("stu@example.com"), out: await login("out@example.com"), admin: await login("admin@example.com"), mentor: mentor ? await login("mentor@example.com") : "" };
  const ids = { co: (await u("co@example.com")).id, lead: (await u("lead@example.com")).id, stu: (await u("stu@example.com")).id, mentor: mentor ? (await u("mentor@example.com")).id : "" };
  return { project, t, ids, base: `/api/projects/${project.id}` };
}
const post = (token: string, url: string, body: object = {}) => request(app).post(url).set(bearer(token)).send(body);
const get = (token: string, url: string) => request(app).get(url).set(bearer(token));
const patch = (token: string, url: string, body: object) => request(app).patch(url).set(bearer(token)).send(body);

describe("NexSpace : accès et droits", () => {
  it("cloisonne les projets : un étranger reçoit 404 partout, l'admin est en lecture seule", async () => {
    const { t, base } = await fixture();
    for (const path of ["", "/tasks", "/milestones", "/documents", "/channels", "/deliverables", "/meetings", "/activity"]) await get(t.out, `${base}${path}`).expect(404);
    await post(t.out, `${base}/tasks`, { title: "Piratage" }).expect(404);
    await get(t.admin, base).expect(200);
    await get(t.admin, `${base}/tasks`).expect(200);
    await post(t.admin, `${base}/tasks`, { title: "Admin ne modifie pas" }).expect(403);
    await get(t.admin, `${base}/channels`).expect(403); // pas de lecture des échanges
    expect((await get(t.out, "/api/projects").expect(200)).body.projects).toHaveLength(0);
    expect((await get(t.lead, "/api/projects").expect(200)).body.projects).toHaveLength(1);
  });

  it("l'entreprise peut commenter mais pas créer ni déplacer des tâches", async () => {
    const { t, base } = await fixture();
    const task = (await post(t.lead, `${base}/tasks`, { title: "Tâche A" }).expect(201)).body.task;
    await post(t.co, `${base}/tasks`, { title: "Non" }).expect(403);
    await post(t.co, `${base}/tasks/${task.id}/move`, { status: "EN_COURS" }).expect(403);
    await post(t.co, `${base}/tasks/${task.id}/comments`, { body: "Merci de prioriser." }).expect(201);
    await post(t.stu, `${base}/tasks/${task.id}/comments`, { body: "Compris" }).expect(201);
    const d = await get(t.lead, `${base}/tasks/${task.id}`).expect(200);
    expect(d.body.comments).toHaveLength(2);
  });

  it("n'accorde l'accès référent que si son établissement compte un étudiant du projet", async () => {
    const { t, base } = await fixture();
    await registerAndVerify({ email: "ref@example.com", role: "REFERENT_ACADEMIQUE", extra: { institutionName: "Fac Liée" } });
    await registerAndVerify({ email: "ref2@example.com", role: "REFERENT_ACADEMIQUE", extra: { institutionName: "Fac Étrangère" } });
    const inst = await prisma.institution.findFirstOrThrow({ where: { name: "Fac Liée" } });
    await prisma.studentProfile.updateMany({ where: { user: { email: "stu@example.com" } }, data: { institutionId: inst.id } });
    const r1 = (await loginAgent("ref@example.com")).token, r2 = (await loginAgent("ref2@example.com")).token;
    await get(r1, base).expect(200);
    await post(r1, `${base}/tasks`, { title: "x" }).expect(403);
    await get(r2, base).expect(404);
    void t;
  });
});

describe("NexSpace : tâches (Kanban)", () => {
  it("calcule la progression sur les tâches de premier niveau et historise les changements", async () => {
    const { t, base, project } = await fixture();
    const a = (await post(t.lead, `${base}/tasks`, { title: "A" }).expect(201)).body.task;
    const b = (await post(t.lead, `${base}/tasks`, { title: "B" }).expect(201)).body.task;
    await post(t.lead, `${base}/tasks`, { title: "Sous-tâche", parentTaskId: a.id }).expect(201);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).progressPct).toBe(0);
    await post(t.lead, `${base}/tasks/${a.id}/move`, { status: "TERMINE" }).expect(200);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).progressPct).toBe(50);
    await patch(t.stu, `${base}/tasks/${b.id}`, { status: "TERMINE", priority: "URGENTE", title: "B renommée" }).expect(200);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).progressPct).toBe(100);
    const done = await prisma.task.findUniqueOrThrow({ where: { id: a.id } });
    expect(done.completedAt).not.toBeNull();
    await post(t.lead, `${base}/tasks/${a.id}/move`, { status: "A_FAIRE" }).expect(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).completedAt).toBeNull();
    const d = await get(t.lead, `${base}/tasks/${b.id}`).expect(200);
    expect(d.body.history.map((h: { field: string }) => h.field)).toEqual(expect.arrayContaining(["statut", "priorité", "titre", "création"]));
    const feed = await get(t.lead, `${base}/activity`).expect(200);
    expect(feed.body.events.length).toBeGreaterThanOrEqual(5);
    expect(feed.body.events[0].label).toMatch(/Test|Utilisateur/);
  });

  it("insère une carte à la position voulue dans une colonne (déplacement entre deux cartes)", async () => {
    const { t, base } = await fixture();
    const mk = async (title: string) => (await post(t.lead, `${base}/tasks`, { title }).expect(201)).body.task.id as string;
    const [x, y, z, w] = [await mk("x"), await mk("y"), await mk("z"), await mk("w")];
    await post(t.lead, `${base}/tasks/${w}/move`, { status: "A_FAIRE", afterId: x, beforeId: y }).expect(200); // w entre x et y
    await post(t.lead, `${base}/tasks/${z}/move`, { status: "A_FAIRE", beforeId: x }).expect(200); // z en tête
    const list = (await get(t.lead, `${base}/tasks?status=A_FAIRE`).expect(200)).body.tasks.map((k: { title: string }) => k.title);
    expect(list).toEqual(["z", "x", "w", "y"]);
  });

  it("valide les références (assigné membre, sous-tâche à un seul niveau) et les droits de suppression", async () => {
    const { t, base, ids } = await fixture();
    const outId = (await prisma.user.findUniqueOrThrow({ where: { email: "out@example.com" } })).id;
    await post(t.lead, `${base}/tasks`, { title: "Assignation étrangère", assigneeIds: [outId] }).expect(403);
    const parent = (await post(t.lead, `${base}/tasks`, { title: "Parent", assigneeIds: [ids.stu] }).expect(201)).body.task;
    expect(await prisma.notification.count({ where: { userId: ids.stu, type: "project.task" } })).toBe(1);
    const child = (await post(t.lead, `${base}/tasks`, { title: "Enfant", parentTaskId: parent.id }).expect(201)).body.task;
    await post(t.lead, `${base}/tasks`, { title: "Petit-enfant", parentTaskId: child.id }).expect(400);
    await request(app).delete(`${base}/tasks/${parent.id}`).set(bearer(t.stu)).expect(403); // créée par le chef de projet
    await request(app).delete(`${base}/tasks/${parent.id}`).set(bearer(t.lead)).expect(204);
    await get(t.lead, `${base}/tasks/${child.id}`).expect(404); // les sous-tâches suivent
  });

  it("filtre la liste (responsable, priorité, retard) et signale les retards dans l'aperçu", async () => {
    const { t, base, ids } = await fixture();
    await post(t.lead, `${base}/tasks`, { title: "En retard", dueDate: "2020-01-01", priority: "HAUTE", assigneeIds: [ids.stu] }).expect(201);
    await post(t.lead, `${base}/tasks`, { title: "Plus tard", dueDate: "2099-01-01" }).expect(201);
    expect((await get(t.lead, `${base}/tasks?due=late`)).body.tasks.map((k: { title: string }) => k.title)).toEqual(["En retard"]);
    expect((await get(t.lead, `${base}/tasks?assignee=${ids.stu}`)).body.tasks).toHaveLength(1);
    expect((await get(t.lead, `${base}/tasks?priority=HAUTE`)).body.tasks).toHaveLength(1);
    const ov = (await get(t.mentor, base).expect(200)).body;
    expect(ov.counts.late).toBe(1);
    expect(ov.alerts.map((x: { text: string }) => x.text).join(" ")).toMatch(/en retard/);
    const cal = await get(t.lead, `${base}/calendar?from=2019-12-01&to=2020-02-01`).expect(200);
    expect(cal.body.events.map((e: { title: string }) => e.title)).toContain("En retard");
  });
});

describe("NexSpace : jalons", () => {
  it("applique la règle LES_DEUX : mentor ET entreprise doivent valider", async () => {
    const { t, base } = await fixture({ rule: "LES_DEUX" });
    const m = (await post(t.lead, `${base}/milestones`, { title: "Jalon 1", targetDate: "2099-06-01" }).expect(201)).body.milestone;
    await post(t.stu, `${base}/milestones/${m.id}/validate`).expect(403);
    const r1 = await post(t.mentor, `${base}/milestones/${m.id}/validate`).expect(200);
    expect(r1.body.complete).toBe(false);
    const r2 = await post(t.co, `${base}/milestones/${m.id}/validate`).expect(200);
    expect(r2.body.complete).toBe(true);
    expect(r2.body.milestone.status).toBe("VALIDE");
    await post(t.co, `${base}/milestones/${m.id}/validate`).expect(400);
  });
  it("applique la règle MENTOR (l'entreprise ne valide pas) et le repli sans mentor", async () => {
    const f1 = await fixture({ rule: "MENTOR" });
    const m = (await post(f1.t.lead, `${f1.base}/milestones`, { title: "J", targetDate: "2099-06-01" }).expect(201)).body.milestone;
    await post(f1.t.co, `${f1.base}/milestones/${m.id}/validate`).expect(403);
    expect((await post(f1.t.mentor, `${f1.base}/milestones/${m.id}/validate`).expect(200)).body.complete).toBe(true);
    await resetDb();
    const f2 = await fixture({ rule: "MENTOR", mentor: false });
    const m2 = (await post(f2.t.lead, `${f2.base}/milestones`, { title: "J", targetDate: "2099-06-01" }).expect(201)).body.milestone;
    expect((await post(f2.t.co, `${f2.base}/milestones/${m2.id}/validate`).expect(200)).body.complete).toBe(true); // pas de mentor : l'entreprise valide seule
  });
  it("calcule le statut : Prêt quand toutes les tâches sont terminées, Manqué après la date cible", async () => {
    const { t, base } = await fixture();
    const m = (await post(t.lead, `${base}/milestones`, { title: "Futur", targetDate: "2099-06-01" }).expect(201)).body.milestone;
    const past = (await post(t.lead, `${base}/milestones`, { title: "Passé", targetDate: "2020-06-01" }).expect(201)).body.milestone;
    const task = (await post(t.lead, `${base}/tasks`, { title: "Liée", milestoneId: m.id }).expect(201)).body.task;
    let list = (await get(t.lead, `${base}/milestones`)).body.milestones;
    expect(list.find((x: { id: string }) => x.id === m.id).status).toBe("A_VENIR");
    await post(t.lead, `${base}/tasks/${task.id}/move`, { status: "TERMINE" }).expect(200);
    list = (await get(t.lead, `${base}/milestones`)).body.milestones;
    expect(list.find((x: { id: string }) => x.id === m.id).status).toBe("PRET");
    expect(list.find((x: { id: string }) => x.id === past.id).status).toBe("MANQUE");
    await post(t.stu, `${base}/milestones`, { title: "Non", targetDate: "2099-01-01" }).expect(403); // réservé au chef de projet et au mentor
  });
});

describe("NexSpace : documents", () => {
  const upload = (token: string, base: string, buf: Buffer, name: string, extra: Record<string, string> = {}) => { const r = request(app).post(`${base}/documents`).set(bearer(token)); for (const [k, v] of Object.entries(extra)) r.field(k, v); return r.attach("file", buf, name); };

  it("contrôle le contenu des fichiers, versionne (3 dernières conservées) et refuse l'extension trompeuse", async () => {
    const { t, base } = await fixture();
    const bad = await upload(t.lead, base, Buffer.from("MZ\x90\x00 pas un pdf"), "rapport.pdf");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("FILE_TYPE_NOT_ALLOWED");
    let doc = (await upload(t.lead, base, PDF(1), "rapport.pdf").expect(201)).body.document;
    expect(doc.current.versionNo).toBe(1);
    for (let i = 2; i <= 5; i++) doc = (await upload(t.stu, base, PDF(i), "rapport.pdf").expect(201)).body.document;
    expect(doc.current.versionNo).toBe(5);
    expect(doc.versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([5, 4, 3]); // 3 dernières
    expect(await prisma.documentVersion.count({ where: { documentId: doc.id } })).toBe(3);
    const dl = await get(t.co, `${base}/documents/${doc.id}/download?version=5`).expect(200);
    expect(dl.headers["content-type"]).toMatch(/pdf/);
    expect(dl.headers["x-content-type-options"]).toBe("nosniff");
    await get(t.out, `${base}/documents/${doc.id}/download`).expect(404);
    await get(t.co, `${base}/documents/${doc.id}/download?version=1`).expect(404); // version purgée
  });

  it("applique la visibilité : « équipe seule » masque le document au mentor et à l'entreprise", async () => {
    const { t, base } = await fixture();
    const secret = (await upload(t.lead, base, PDF(7), "interne.pdf", { visibility: "EQUIPE_SEULE" }).expect(201)).body.document;
    const mentorOnly = (await upload(t.lead, base, PDF(8), "mentor.pdf", { visibility: "EQUIPE_ET_MENTOR" }).expect(201)).body.document;
    const names = async (tok: string) => (await get(tok, `${base}/documents`).expect(200)).body.documents.map((d: { name: string }) => d.name).sort();
    expect(await names(t.lead)).toEqual(["interne.pdf", "mentor.pdf"]);
    expect(await names(t.mentor)).toEqual(["mentor.pdf"]);
    expect(await names(t.co)).toEqual([]);
    await get(t.co, `${base}/documents/${secret.id}/download`).expect(404);
    await get(t.co, `${base}/documents/${mentorOnly.id}/download`).expect(404);
    await get(t.mentor, `${base}/documents/${mentorOnly.id}/download`).expect(200);
  });

  it("organise en dossiers et empêche de supprimer un dossier non vide", async () => {
    const { t, base } = await fixture();
    const f = (await post(t.lead, `${base}/documents/folders`, { name: "Livrables" }).expect(201)).body.folder;
    await upload(t.lead, base, PDF(1), "a.pdf", { folderId: f.id }).expect(201);
    expect((await get(t.lead, `${base}/documents?folderId=${f.id}`)).body.documents).toHaveLength(1);
    await request(app).delete(`${base}/documents/folders/${f.id}`).set(bearer(t.lead)).expect(409);
  });
});

describe("NexSpace : messagerie", () => {
  it("crée le canal général, notifie les mentions, compte les non lus et marque comme lu", async () => {
    const { t, base, ids } = await fixture();
    const chans = (await get(t.lead, `${base}/channels`).expect(200)).body.channels;
    expect(chans[0].type).toBe("GENERAL");
    const cid = chans[0].id;
    await post(t.lead, `${base}/channels/${cid}/messages`, { body: "Bonjour @stu, point demain ?", mentions: [ids.stu] }).expect(201);
    await post(t.mentor, `${base}/channels/${cid}/messages`, { body: "Oui, 10 h." }).expect(201);
    expect(await prisma.notification.count({ where: { userId: ids.stu, type: "message.mention" } })).toBe(1);
    const stuChans = (await get(t.stu, `${base}/channels`)).body.channels;
    expect(stuChans[0].unread).toBe(2);
    await post(t.stu, `${base}/channels/${cid}/read`).expect(204);
    expect((await get(t.stu, `${base}/channels`)).body.channels[0].unread).toBe(0);
    const msgs = (await get(t.stu, `${base}/channels/${cid}/messages`)).body.messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].mentions).toEqual([ids.stu]);
  });

  it("gère réponses, réactions, modification et suppression avec les bons droits", async () => {
    const { t, base } = await fixture();
    const cid = (await get(t.lead, `${base}/channels`)).body.channels[0].id;
    const m = (await post(t.lead, `${base}/channels/${cid}/messages`, { body: "Original" }).expect(201)).body.message;
    const reply = (await post(t.stu, `${base}/channels/${cid}/messages`, { body: "Réponse", parentId: m.id }).expect(201)).body.message;
    expect(reply.parentId).toBe(m.id);
    await post(t.stu, `${base}/channels/${cid}/messages/${m.id}/reactions`, { emoji: "👍" }).expect(200);
    await post(t.stu, `${base}/channels/${cid}/messages/${m.id}/reactions`, { emoji: "🔥" }).expect(400); // emoji hors liste
    let top = (await get(t.lead, `${base}/channels/${cid}/messages`)).body.messages;
    expect(top).toHaveLength(1);
    expect(top[0].replies).toBe(1);
    expect(top[0].reactions).toEqual([{ emoji: "👍", count: 1, mine: false }]);
    await post(t.stu, `${base}/channels/${cid}/messages/${m.id}/reactions`, { emoji: "👍" }).expect(200); // bascule : retire
    expect((await get(t.lead, `${base}/channels/${cid}/messages`)).body.messages[0].reactions).toEqual([]);
    await patch(t.stu, `${base}/channels/${cid}/messages/${m.id}`, { body: "Piraté" }).expect(403);
    await patch(t.lead, `${base}/channels/${cid}/messages/${m.id}`, { body: "Modifié" }).expect(200);
    await request(app).delete(`${base}/channels/${cid}/messages/${m.id}`).set(bearer(t.co)).expect(403);
    await request(app).delete(`${base}/channels/${cid}/messages/${m.id}`).set(bearer(t.mentor)).expect(204);
    top = (await get(t.lead, `${base}/channels/${cid}/messages`)).body.messages;
    expect(top[0].deleted).toBe(true);
    expect(top[0].body).toBe("");
  });

  it("isole les messages directs et rejette les mentions de non-membres", async () => {
    const { t, base, ids } = await fixture();
    const dm = (await post(t.lead, `${base}/channels`, { type: "DIRECT", userId: ids.stu }).expect(201)).body.channel.id;
    await post(t.lead, `${base}/channels/${dm}/messages`, { body: "Confidentiel" }).expect(201);
    await get(t.stu, `${base}/channels/${dm}/messages`).expect(200);
    await get(t.mentor, `${base}/channels/${dm}/messages`).expect(404);
    await get(t.co, `${base}/channels/${dm}/messages`).expect(404);
    expect((await get(t.mentor, `${base}/channels`)).body.channels.some((c: { id: string }) => c.id === dm)).toBe(false);
    const outId = (await prisma.user.findUniqueOrThrow({ where: { email: "out@example.com" } })).id;
    const gen = (await get(t.lead, `${base}/channels`)).body.channels.find((c: { type: string }) => c.type === "GENERAL").id;
    await post(t.lead, `${base}/channels/${gen}/messages`, { body: "x", mentions: [outId] }).expect(403);
    await post(t.lead, `${base}/channels/${gen}/messages`, { body: "   " }).expect(400);
  });

  it("partage un fichier (≤ 25 Mo, contrôlé par contenu) dans un message", async () => {
    const { t, base } = await fixture();
    const cid = (await get(t.lead, `${base}/channels`)).body.channels[0].id;
    const bad = await request(app).post(`${base}/channels/${cid}/upload`).set(bearer(t.lead)).attach("file", Buffer.from("not a pdf"), "x.pdf");
    expect(bad.status).toBe(400);
    const up = (await request(app).post(`${base}/channels/${cid}/upload`).set(bearer(t.lead)).attach("file", PDF(3), "note.pdf").expect(201)).body.file;
    const msg = (await post(t.lead, `${base}/channels/${cid}/messages`, { body: "Voir le PDF", fileId: up.id }).expect(201)).body.message;
    expect(msg.file.originalName).toBe("note.pdf");
    await get(t.co, `${base}/channels/${cid}/messages/${msg.id}/file`).expect(200);
    await post(t.stu, `${base}/channels/${cid}/messages`, { body: "Fichier volé", fileId: up.id }).expect(400); // appartient à un autre utilisateur
  });
});

describe("NexSpace : livrables (double validation)", () => {
  async function ready(f: Awaited<ReturnType<typeof fixture>>) {
    const doc = (await request(app).post(`${f.base}/documents`).set(bearer(f.t.stu)).attach("file", PDF(1), "livrable.pdf").expect(201)).body.document;
    const d = (await post(f.t.lead, `${f.base}/deliverables`, { name: "Rapport final", dueDate: "2099-01-01" }).expect(201)).body.deliverable;
    return { doc, d };
  }
  it("suit le workflow : soumis → approuvé par le mentor → validé par l'entreprise (jamais avant)", async () => {
    const f = await fixture(); const { t, base } = f;
    const { doc, d } = await ready(f);
    expect(d.status).toBe("A_PRODUIRE");
    await post(t.stu, `${base}/deliverables/${d.id}/start`).expect(200);
    await post(t.co, `${base}/deliverables/${d.id}/submit`, { documentId: doc.id }).expect(403); // seule l'équipe soumet
    expect((await post(t.stu, `${base}/deliverables/${d.id}/submit`, { documentId: doc.id, note: "V1" }).expect(200)).body.deliverable.status).toBe("SOUMIS");
    await post(t.co, `${base}/deliverables/${d.id}/review`, { decision: "VALIDE" }).expect(409); // le mentor n'a pas approuvé
    await post(t.mentor, `${base}/deliverables/${d.id}/review`, { decision: "VALIDE" }).expect(403); // validation finale = entreprise
    await post(t.mentor, `${base}/deliverables/${d.id}/review`, { decision: "CORRECTION" }).expect(400); // commentaire obligatoire
    const fix = await post(t.mentor, `${base}/deliverables/${d.id}/review`, { decision: "CORRECTION", comment: "Ajouter les sources." }).expect(200);
    expect(fix.body.deliverable.status).toBe("A_CORRIGER");
    await post(t.stu, `${base}/deliverables/${d.id}/submit`, { documentId: doc.id, note: "V2" }).expect(200);
    const ok = await post(t.mentor, `${base}/deliverables/${d.id}/review`, { decision: "APPROUVE" }).expect(200);
    expect(ok.body.deliverable.status).toBe("EN_REVISION");
    expect(ok.body.deliverable.mentorApprovedAt).toBeTruthy();
    expect(await prisma.notification.count({ where: { type: "project.deliverable", user: { email: "co@example.com" } } })).toBeGreaterThan(0);
    const val = await post(t.co, `${base}/deliverables/${d.id}/review`, { decision: "VALIDE" }).expect(200);
    expect(val.body.deliverable.status).toBe("VALIDE");
    expect(val.body.deliverable.submissions).toHaveLength(2);
    await post(t.stu, `${base}/deliverables/${d.id}/submit`, { documentId: doc.id }).expect(409); // plus modifiable
  });
  it("sans mentor, la soumission va directement à l'entreprise ; un document « équipe seule » ne peut pas être soumis", async () => {
    const f = await fixture({ mentor: false }); const { t, base } = f;
    const { doc, d } = await ready(f);
    const secret = (await request(app).post(`${base}/documents`).set(bearer(t.stu)).field("visibility", "EQUIPE_SEULE").attach("file", PDF(2), "prive.pdf").expect(201)).body.document;
    await post(t.stu, `${base}/deliverables/${d.id}/submit`, { documentId: secret.id }).expect(400);
    expect((await post(t.stu, `${base}/deliverables/${d.id}/submit`, { documentId: doc.id }).expect(200)).body.deliverable.status).toBe("EN_REVISION");
    expect((await post(t.co, `${base}/deliverables/${d.id}/review`, { decision: "VALIDE" }).expect(200)).body.deliverable.status).toBe("VALIDE");
  });
});

describe("NexSpace : réunions et espace mentor", () => {
  it("planifie une réunion avec lien de visioconférence, gère les réponses et exporte un .ics", async () => {
    const { t, base, ids } = await fixture();
    const m = (await post(t.lead, `${base}/meetings`, { title: "Kick-off", type: "KICKOFF", startsAt: "2099-03-01T10:00:00Z", durationMin: 45, agenda: "Présentations" }).expect(201)).body.meeting;
    expect(m.videoUrl).toMatch(/^https:\/\/meet\.jit\.si\/nexbridge-/);
    expect(m.participants.length).toBe(4);
    expect(await prisma.notification.count({ where: { userId: ids.stu, type: "project.meeting" } })).toBe(1);
    await post(t.stu, `${base}/meetings/${m.id}/rsvp`, { rsvp: "ACCEPTE" }).expect(200);
    await post(t.out, `${base}/meetings/${m.id}/rsvp`, { rsvp: "ACCEPTE" }).expect(404);
    await patch(t.stu, `${base}/meetings/${m.id}`, { minutes: "Compte rendu" }).expect(403); // ni organisateur, ni chef, ni mentor
    await patch(t.mentor, `${base}/meetings/${m.id}`, { minutes: "Compte rendu" }).expect(200);
    const ics = await get(t.stu, `${base}/meetings/${m.id}/ics`).expect(200);
    expect(ics.text).toContain("BEGIN:VEVENT");
    expect(ics.text).toContain("SUMMARY:Kick-off");
  });

  it("donne au mentor une vue consolidée avec alertes, et règle la visibilité des rapports", async () => {
    const { t, base, project } = await fixture();
    await post(t.lead, `${base}/tasks`, { title: "En retard", dueDate: "2020-01-01" }).expect(201);
    await prisma.project.update({ where: { id: project.id }, data: { lastActivityAt: new Date(Date.now() - 10 * 86400_000) } });
    const mp = (await get(t.mentor, "/api/mentor/projects").expect(200)).body.projects;
    expect(mp).toHaveLength(1);
    expect(mp[0].health).not.toBe("VERT");
    expect(mp[0].alerts.join(" ")).toMatch(/7 jours/);
    await get(t.stu, "/api/mentor/projects").expect(403);
    await post(t.stu, `${base}/reports`, { weekStart: "2026-11-16", summary: "Résumé trop libre" }).expect(403);
    await post(t.mentor, `${base}/reports`, { weekStart: "2026-11-18", summary: "Équipe motivée, bon rythme.", health: "VERT", visibleToCompany: true, visibleToReferent: false }).expect(201);
    await post(t.mentor, `${base}/reports`, { weekStart: "2026-11-17", summary: "Doublon de la même semaine" }).expect(409);
    expect((await get(t.mentor, `${base}/reports`)).body.reports).toHaveLength(1);
    expect((await get(t.co, `${base}/reports`)).body.reports).toHaveLength(1);
    await get(t.lead, `${base}/reports`).expect(403); // l'équipe ne lit pas les rapports du mentor
  });
});

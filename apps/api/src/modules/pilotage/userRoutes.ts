import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { abuseReportSchema, cohortMembersSchema, cohortSchema, creditDecisionSchema } from "@nexbridge/shared";
import { badRequest, conflict, forbidden, notFound, prisma } from "../../platform/core";
import { audit, authenticate, limiter, requireRoles, validateBody } from "../../platform/http";
import { readFileObject } from "../../platform/storage";
import { notify } from "../notifications/routes";
import { tryFinalize } from "./closure";
import { toCsv } from "./csv";

const LV = { SENSIBILISE: 1, PRATICIEN: 2, CONFIRME: 3, EXPERT: 4 } as const;

/* =================== NexBadge (étudiant) =================== */
export const badgesRouter = Router();
badgesRouter.use(authenticate, requireRoles("ETUDIANT"));
badgesRouter.get("/me", async (req, res) => {
  const sp = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: req.auth!.id }, include: { skills: { include: { skill: true } }, badgeAwards: { where: { revokedAt: null }, include: { badge: true, project: { select: { id: true, name: true } } }, orderBy: { awardedAt: "desc" } }, certifications: true, attestations: { include: { project: { select: { id: true, name: true, closedAt: true, challenge: { select: { company: { select: { legalName: true } } } } } } }, orderBy: { issuedAt: "desc" } } } });
  const skillNames = new Map((await prisma.skill.findMany({ where: { id: { in: sp.certifications.map((c) => c.skillId) } } })).map((s) => [s.id, s.name]));
  const validations = await prisma.academicValidation.findMany({ where: { studentId: sp.id, status: "VALIDE" }, include: { project: { select: { name: true } } } });
  // Évolution de l'indice : note moyenne reçue par projet terminé
  const evals = await prisma.evaluation.findMany({ where: { subjectUserId: req.auth!.id, hidden: false, type: { in: ["ENTREPRISE_ETUDIANT", "MENTOR_ETUDIANT", "PAIR"] }, project: { status: "TERMINE" } }, include: { project: { select: { id: true, name: true, closedAt: true } } } });
  const byProject = new Map<string, { name: string; at: Date | null; sum: number; n: number }>();
  for (const e of evals) { const c = byProject.get(e.projectId) ?? { name: e.project.name, at: e.project.closedAt, sum: 0, n: 0 }; c.sum += e.rating; c.n++; byProject.set(e.projectId, c); }
  const sectionLevel = (cat: string) => { const l = sp.skills.filter((s) => s.skill.category === cat); return l.length ? Math.round((l.reduce((a, s) => a + LV[s.level], 0) / l.length) * 100) / 100 : 0; };
  res.json({
    slug: sp.slug, isPortfolioPublic: sp.isPortfolioPublic, reliabilityIndex: sp.reliabilityIndex ? Number(sp.reliabilityIndex) : null,
    skills: sp.skills.map((s) => ({ id: s.skillId, name: s.skill.name, category: s.skill.category, level: s.level, source: s.source })),
    radar: ["TECHNIQUE", "METIER", "TRANSVERSALE", "SECTORIELLE"].map((c) => ({ category: c, value: sectionLevel(c) })),
    badges: sp.badgeAwards.map((b) => ({ id: b.id, code: b.badge.code, name: b.badge.name, description: b.badge.description, type: b.badge.type, awardedAt: b.awardedAt, project: b.project })),
    certifications: sp.certifications.map((c) => ({ id: c.id, skill: skillNames.get(c.skillId) ?? "—", level: c.level, basedOnProjects: c.basedOnProjects, issuedAt: c.issuedAt })),
    attestations: sp.attestations.map((a) => ({ id: a.id, code: a.verificationCode, issuedAt: a.issuedAt, project: a.project.name, company: a.project.challenge.company.legalName })),
    credits: { total: validations.reduce((a, v) => a + Number(v.credits ?? 0), 0), items: validations.map((v) => ({ project: v.project.name, credits: Number(v.credits ?? 0) })) },
    ratingTimeline: [...byProject.values()].sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)).map((p) => ({ project: p.name, at: p.at, rating: Math.round((p.sum / p.n) * 100) / 100 })),
    nextBadges: [{ label: "Certification NEXBRIDGE", hint: "3 projets validés sur une même compétence" }, { label: "Top Performer", hint: "une évaluation moyenne supérieure à 4,5/5 sur un projet" }, { label: "Leader", hint: "3 projets menés comme chef d'équipe" }, { label: "Spécialiste sectoriel", hint: "2 projets terminés dans le même secteur" }],
  });
});
badgesRouter.put("/me/portfolio", validateBody(z.object({ isPortfolioPublic: z.boolean() })), async (req, res) => {
  await prisma.studentProfile.update({ where: { userId: req.auth!.id }, data: { isPortfolioPublic: req.body.isPortfolioPublic } });
  res.json({ ok: true });
});

/* =================== Attestation PDF (téléchargement contrôlé) =================== */
export const attestationsRouter = Router();
attestationsRouter.use(authenticate);
attestationsRouter.get("/:id/download", async (req, res) => {
  const att = await prisma.attestation.findUnique({ where: { id: String(req.params.id) }, include: { student: { select: { userId: true, institutionId: true } }, project: { select: { companyId: true } } } });
  if (!att) throw notFound("Attestation introuvable");
  let ok = att.student.userId === req.auth!.id || req.auth!.role === "ADMIN" || req.auth!.role === "SUPER_ADMIN";
  if (!ok && req.auth!.role === "REFERENT_ACADEMIQUE") ok = Boolean(await prisma.referentProfile.findFirst({ where: { userId: req.auth!.id, institutionId: att.student.institutionId ?? "-" } }));
  if (!ok && req.auth!.role === "ENTREPRISE") ok = Boolean(await prisma.companyMember.findFirst({ where: { userId: req.auth!.id, companyId: att.project.companyId } }));
  if (!ok) throw notFound("Attestation introuvable");
  const { data } = await readFileObject(att.fileId);
  res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="attestation-nexbridge-${att.verificationCode}.pdf"`); res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(data);
});

/* =================== Signalements (tout utilisateur connecté) =================== */
export const reportsRouter = Router();
reportsRouter.post("/", authenticate, limiter({ windowMs: 10 * 60_000, limit: 10, message: "Trop de signalements. Réessayez plus tard." }), validateBody(abuseReportSchema), async (req, res) => {
  const r = await prisma.report.create({ data: { reporterId: req.auth!.id, ...req.body } });
  await audit(req, "report.created", { entityType: "Report", entityId: r.id });
  res.status(201).json({ ok: true });
});

/* =================== Référent académique : crédits, cohortes, étudiants, rapports =================== */
export const academicPilotRouter = Router();
academicPilotRouter.use(authenticate, requireRoles("REFERENT_ACADEMIQUE"));
async function institutionOf(userId: string) {
  const ref = await prisma.referentProfile.findUnique({ where: { userId }, include: { institution: true } });
  if (!ref) throw forbidden("Aucun établissement rattaché.");
  return ref;
}

academicPilotRouter.get("/credits", async (req, res) => {
  const ref = await institutionOf(req.auth!.id);
  const rows = await prisma.academicValidation.findMany({ where: { student: { institutionId: ref.institutionId } }, orderBy: [{ status: "asc" }, { id: "desc" }], take: 200, include: { project: { select: { id: true, name: true, status: true, challenge: { select: { company: { select: { legalName: true } } } } } }, student: { include: { user: { select: { firstName: true, lastName: true } }, program: { select: { name: true } } } } } });
  res.json({ institution: { name: ref.institution.name, status: ref.institution.status }, validations: rows.map((v) => ({ id: v.id, status: v.status, credits: v.credits != null ? Number(v.credits) : null, comment: v.comment, project: v.project.name, projectStatus: v.project.status, company: v.project.challenge.company.legalName, student: `${v.student.user.firstName} ${v.student.user.lastName}`, program: v.student.program?.name ?? null })) });
});
academicPilotRouter.post("/credits/:id", validateBody(creditDecisionSchema), async (req, res) => {
  const ref = await institutionOf(req.auth!.id);
  const v = await prisma.academicValidation.findFirst({ where: { id: String(req.params.id), student: { institutionId: ref.institutionId } }, include: { student: { select: { userId: true } }, project: { select: { id: true, name: true } } } });
  if (!v) throw notFound("Validation introuvable");
  if (v.status !== "EN_ATTENTE") throw conflict("Cette validation a déjà été traitée.", "ALREADY_DECIDED");
  await prisma.academicValidation.update({ where: { id: v.id }, data: { status: req.body.decision, credits: req.body.decision === "VALIDE" ? req.body.credits : null, comment: req.body.comment, referentId: req.auth!.id, decidedAt: new Date() } });
  await audit(req, `credits.${req.body.decision.toLowerCase()}`, { entityType: "AcademicValidation", entityId: v.id, metadata: { credits: req.body.credits } });
  await notify(v.student.userId, { type: "project.credits", title: req.body.decision === "VALIDE" ? `Crédits académiques validés : ${req.body.credits}` : "Validation académique refusée", body: `« ${v.project.name} »${req.body.comment ? ` — ${req.body.comment}` : ""}`, link: "/app/badges", email: true });
  const finalized = await tryFinalize(v.project.id);
  res.json({ ok: true, finalized });
});

academicPilotRouter.get("/cohorts", async (req, res) => {
  const ref = await institutionOf(req.auth!.id);
  const rows = await prisma.cohort.findMany({ where: { institutionId: ref.institutionId }, orderBy: [{ academicYear: "desc" }, { name: "asc" }], include: { _count: { select: { members: true } } } });
  res.json({ cohorts: rows.map((c) => ({ id: c.id, name: c.name, academicYear: c.academicYear, members: c._count.members })) });
});
academicPilotRouter.post("/cohorts", validateBody(cohortSchema), async (req, res) => {
  const ref = await institutionOf(req.auth!.id);
  if (await prisma.cohort.findUnique({ where: { institutionId_name_academicYear: { institutionId: ref.institutionId, name: req.body.name, academicYear: req.body.academicYear } } })) throw conflict("Cette cohorte existe déjà.");
  res.status(201).json({ cohort: await prisma.cohort.create({ data: { institutionId: ref.institutionId, ...req.body } }) });
});
academicPilotRouter.get("/cohorts/:id", async (req, res) => {
  const ref = await institutionOf(req.auth!.id);
  const c = await prisma.cohort.findFirst({ where: { id: String(req.params.id), institutionId: ref.institutionId }, include: { members: { include: { student: { include: { user: { select: { firstName: true, lastName: true } }, program: { select: { name: true } }, _count: { select: { badgeAwards: true } } } } } } } });
  if (!c) throw notFound("Cohorte introuvable");
  res.json({ cohort: { id: c.id, name: c.name, academicYear: c.academicYear, members: c.members.map((m) => ({ studentId: m.studentId, name: `${m.student.user.firstName} ${m.student.user.lastName}`, program: m.student.program?.name ?? null, studyLevel: m.student.studyLevel, badges: m.student._count.badgeAwards })) } });
});
academicPilotRouter.post("/cohorts/:id/members", validateBody(cohortMembersSchema), async (req, res) => {
  const ref = await institutionOf(req.auth!.id);
  const c = await prisma.cohort.findFirst({ where: { id: String(req.params.id), institutionId: ref.institutionId } });
  if (!c) throw notFound("Cohorte introuvable");
  const ids: string[] = [...new Set<string>(req.body.studentIds)];
  const ok = await prisma.studentProfile.findMany({ where: { id: { in: ids }, institutionId: ref.institutionId }, select: { id: true } });
  if (ok.length !== ids.length) throw badRequest("Certains étudiants n'appartiennent pas à votre établissement.", "NOT_YOUR_STUDENTS");
  await prisma.cohortMember.createMany({ data: ids.map((studentId) => ({ cohortId: c.id, studentId })), skipDuplicates: true });
  res.status(201).json({ ok: true });
});
academicPilotRouter.delete("/cohorts/:id/members/:studentId", async (req, res) => {
  const ref = await institutionOf(req.auth!.id);
  await prisma.cohortMember.deleteMany({ where: { cohortId: String(req.params.id), studentId: String(req.params.studentId), cohort: { institutionId: ref.institutionId } } });
  res.status(204).end();
});

async function studentRows(institutionId: string) {
  const sps = await prisma.studentProfile.findMany({ where: { institutionId, user: { status: "ACTIF" } }, include: { user: { select: { firstName: true, lastName: true } }, program: { select: { name: true } }, skills: { include: { skill: { select: { name: true } } } }, _count: { select: { badgeAwards: true } }, academicValidations: { where: { status: "VALIDE" } }, cohortLinks: { include: { cohort: { select: { name: true } } } } }, orderBy: { user: { lastName: "asc" } }, take: 500 });
  const active = await prisma.projectMember.groupBy({ by: ["userId"], where: { userId: { in: sps.map((s) => s.userId) }, projectRole: { in: ["ETUDIANT", "CHEF_PROJET"] }, project: { status: { in: ["EN_COURS", "EN_EVALUATION"] } } }, _count: true });
  const done = await prisma.projectMember.groupBy({ by: ["userId"], where: { userId: { in: sps.map((s) => s.userId) }, projectRole: { in: ["ETUDIANT", "CHEF_PROJET"] }, project: { status: "TERMINE" } }, _count: true });
  const a = new Map(active.map((x) => [x.userId, x._count])), d = new Map(done.map((x) => [x.userId, x._count]));
  return sps.map((s) => ({ id: s.id, name: `${s.user.firstName} ${s.user.lastName}`, program: s.program?.name ?? null, studyLevel: s.studyLevel, cohorts: s.cohortLinks.map((c) => c.cohort.name), activeProjects: a.get(s.userId) ?? 0, completedProjects: d.get(s.userId) ?? 0, badges: s._count.badgeAwards, credits: s.academicValidations.reduce((t, v) => t + Number(v.credits ?? 0), 0), skills: s.skills.map((k) => k.skill.name) }));
}
academicPilotRouter.get("/students", async (req, res) => { const ref = await institutionOf(req.auth!.id); res.json({ students: await studentRows(ref.institutionId) }); });

academicPilotRouter.get("/overview", async (req, res) => {
  const ref = await institutionOf(req.auth!.id);
  const [students, cohorts, pending, validated] = await Promise.all([studentRows(ref.institutionId), prisma.cohort.count({ where: { institutionId: ref.institutionId } }), prisma.academicValidation.count({ where: { status: "EN_ATTENTE", student: { institutionId: ref.institutionId } } }), prisma.academicValidation.findMany({ where: { status: "VALIDE", student: { institutionId: ref.institutionId } }, select: { credits: true } })]);
  const top = new Map<string, number>(); students.forEach((s) => s.skills.forEach((k) => top.set(k, (top.get(k) ?? 0) + 1)));
  res.json({ institution: { name: ref.institution.name, status: ref.institution.status }, totals: { students: students.length, cohorts, activeProjects: students.reduce((a, s) => a + s.activeProjects, 0), completedProjects: students.reduce((a, s) => a + s.completedProjects, 0), creditsValidated: validated.reduce((a, v) => a + Number(v.credits ?? 0), 0), creditsPending: pending, badges: students.reduce((a, s) => a + s.badges, 0) }, topSkills: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })), insertion: null, insertionNote: "Taux d'insertion : donnée non disponible tant que les déclarations d'offre / recrutement ne sont pas en service." });
});
academicPilotRouter.get("/export/students.csv", async (req, res) => {
  const ref = await institutionOf(req.auth!.id);
  const rows = await studentRows(ref.institutionId);
  await audit(req, "export.students", { entityType: "Institution", entityId: ref.institutionId });
  res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", 'attachment; filename="etudiants.csv"');
  res.send(toCsv([["Étudiant", "Filière", "Niveau", "Cohortes", "Projets actifs", "Projets terminés", "Badges", "Crédits validés"], ...rows.map((s) => [s.name, s.program, s.studyLevel, s.cohorts.join(" / "), s.activeProjects, s.completedProjects, s.badges, s.credits])]));
});
academicPilotRouter.get("/export/report.pdf", async (req, res) => {
  const ref = await institutionOf(req.auth!.id);
  const rows = await studentRows(ref.institutionId);
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#031646").text(`Rapport pédagogique — ${ref.institution.name}`);
  doc.moveDown(0.3).font("Helvetica").fontSize(10).fillColor("#475569").text(`Généré le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())} · données de la plateforme NEXBRIDGE`);
  doc.moveDown().fontSize(11).fillColor("#0F172A").text(`Étudiants inscrits : ${rows.length}   ·   Projets terminés : ${rows.reduce((a, s) => a + s.completedProjects, 0)}   ·   Crédits validés : ${rows.reduce((a, s) => a + s.credits, 0)}`);
  doc.moveDown().font("Helvetica-Bold").text("Étudiants");
  doc.font("Helvetica").fontSize(9.5);
  rows.forEach((s) => { if (doc.y > 760) doc.addPage(); doc.text(`${s.name} — ${s.program ?? "filière non renseignée"} · ${s.completedProjects} projet(s) terminé(s) · ${s.badges} badge(s) · ${s.credits} crédit(s)`); });
  doc.end();
  await audit(req, "export.report_pdf", { entityType: "Institution", entityId: ref.institutionId });
  res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", 'attachment; filename="rapport-pedagogique.pdf"');
  res.send(await done);
});

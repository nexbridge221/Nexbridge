import { Router } from "express";
import { authenticate } from "../../platform/http";
import { prisma } from "../../platform/core";
import { fromMinor } from "../challenges/helpers";
import { loadChallengeInput, loadMatchWeights, loadStudentInputs } from "../teams/service";
import { scoreStudent } from "../matching/engine";

/** NexDash : indicateurs calculés UNIQUEMENT à partir des données réelles de la base. Rien n'est estimé ni inventé. */
export const dashboardsRouter = Router();
dashboardsRouter.use(authenticate);

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const LV = { SENSIBILISE: 1, PRATICIEN: 2, CONFIRME: 3, EXPERT: 4 } as const;

dashboardsRouter.get("/me", async (req, res) => {
  const uid = req.auth!.id; const role = req.auth!.role;
  if (role === "ENTREPRISE") {
    const m = await prisma.companyMember.findFirst({ where: { userId: uid } });
    if (!m) return void res.json({ role, empty: true });
    const [challenges, projects, delivs, exp, activity] = await Promise.all([
      prisma.challenge.groupBy({ by: ["status"], where: { companyId: m.companyId }, _count: true }),
      prisma.project.findMany({ where: { companyId: m.companyId }, select: { id: true, name: true, status: true, progressPct: true, budgetAmount: true, budgetCurrency: true } }),
      prisma.deliverable.groupBy({ by: ["status"], where: { project: { companyId: m.companyId } }, _count: true }),
      prisma.evaluation.findMany({ where: { type: "ETUDIANT_EXPERIENCE", project: { companyId: m.companyId } }, select: { rating: true } }),
      prisma.activityEvent.findMany({ where: { project: { companyId: m.companyId } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, label: true, createdAt: true, projectId: true } }),
    ]);
    const budgets: Record<string, number> = {};
    for (const p of projects.filter((p) => p.status !== "ANNULE")) budgets[p.budgetCurrency] = (budgets[p.budgetCurrency] ?? 0) + (fromMinor(p.budgetAmount, p.budgetCurrency) ?? 0);
    const act = projects.filter((p) => p.status === "EN_COURS" || p.status === "EN_EVALUATION");
    return void res.json({ role, challengesByStatus: Object.fromEntries(challenges.map((c) => [c.status, c._count])), projects: { active: act.length, finished: projects.filter((p) => p.status === "TERMINE").length, avgProgress: avg(act.map((p) => p.progressPct)), list: act.map((p) => ({ id: p.id, name: p.name, progressPct: p.progressPct })) }, budgetsEngaged: budgets, deliverables: { total: delivs.reduce((a, d) => a + d._count, 0), validated: delivs.find((d) => d.status === "VALIDE")?._count ?? 0 }, satisfaction: { average: avg(exp.map((e) => e.rating)), responses: exp.length, note: "Moyenne des évaluations d'expérience déposées par les étudiants de vos projets." }, activity });
  }
  if (role === "ETUDIANT") {
    const sp = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: uid }, include: { skills: { include: { skill: true } }, applications: { select: { status: true } }, _count: { select: { badgeAwards: true, certifications: true } } } });
    const [projects, invites, cred] = await Promise.all([
      prisma.projectMember.findMany({ where: { userId: uid, projectRole: { in: ["ETUDIANT", "CHEF_PROJET"] } }, include: { project: { select: { id: true, name: true, status: true, progressPct: true } } } }),
      prisma.teamMember.count({ where: { studentId: sp.id, status: "INVITE", team: { status: "EN_VALIDATION" } } }),
      prisma.academicValidation.findMany({ where: { studentId: sp.id, status: "VALIDE" }, select: { credits: true } }),
    ]);
    // Opportunités recommandées : défis publiés, classés par score de correspondance réel
    const published = await prisma.challenge.findMany({ where: { status: "PUBLIE" }, orderBy: { publishedAt: "desc" }, take: 30, select: { id: true, slug: true, title: true, company: { select: { legalName: true } } } });
    const me = (await loadStudentInputs({ onlyIds: [sp.id] }))[0];
    const weights = await loadMatchWeights();
    const recs = me ? await Promise.all(published.map(async (c) => ({ c, score: scoreStudent(me, (await loadChallengeInput(c.id)).input, weights).score }))) : [];
    const cats = ["TECHNIQUE", "METIER", "TRANSVERSALE", "SECTORIELLE"];
    return void res.json({ role, activeProjects: projects.filter((p) => p.project.status === "EN_COURS" || p.project.status === "EN_EVALUATION").map((p) => p.project), completedProjects: projects.filter((p) => p.project.status === "TERMINE").length, applications: Object.fromEntries(Object.entries(sp.applications.reduce<Record<string, number>>((a, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }), {}))), pendingInvitations: invites, skillsCount: sp.skills.length, radar: cats.map((c) => { const l = sp.skills.filter((s) => s.skill.category === c); return { category: c, value: l.length ? Math.round((l.reduce((a, s) => a + LV[s.level], 0) / l.length) * 100) / 100 : 0 }; }), badges: sp._count.badgeAwards, certifications: sp._count.certifications, reliabilityIndex: sp.reliabilityIndex ? Number(sp.reliabilityIndex) : null, credits: cred.reduce((a, v) => a + Number(v.credits ?? 0), 0), recommended: recs.sort((a, b) => b.score - a.score).slice(0, 3).map((r) => ({ id: r.c.id, slug: r.c.slug, title: r.c.title, company: r.c.company.legalName, score: r.score })) });
  }
  if (role === "MENTOR") {
    const pm = await prisma.projectMember.findMany({ where: { userId: uid, projectRole: "MENTOR", leftAt: null }, include: { project: { select: { id: true, name: true, status: true, progressPct: true, lastActivityAt: true } } } });
    const ids = pm.map((p) => p.projectId); const now = new Date();
    const [late, review, rated] = await Promise.all([prisma.task.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, deletedAt: null, parentTaskId: null, status: { not: "TERMINE" }, dueDate: { lt: now } }, _count: true }), prisma.deliverable.count({ where: { projectId: { in: ids }, status: { in: ["SOUMIS", "EN_REVISION"] }, mentorApprovedAt: null } }), prisma.evaluation.findMany({ where: { type: "ETUDIANT_MENTOR", subjectUserId: uid, hidden: false }, select: { rating: true } })]);
    const act = pm.filter((p) => p.project.status === "EN_COURS" || p.project.status === "EN_EVALUATION");
    const alerts = act.filter((p) => late.some((l) => l.projectId === p.projectId) || (p.project.lastActivityAt && now.getTime() - p.project.lastActivityAt.getTime() > 7 * 86400_000)).length;
    return void res.json({ role, supervised: { active: act.length, finished: pm.filter((p) => p.project.status === "TERMINE").length }, avgProgress: avg(act.map((p) => p.project.progressPct)), alertsCount: alerts, deliverablesToReview: review, evaluationsReceived: { average: avg(rated.map((r) => r.rating)), count: rated.length }, projects: act.map((p) => p.project) });
  }
  if (role === "REFERENT_ACADEMIQUE") return void res.json({ role, redirect: "/api/academic/overview" });
  // Administrateur
  const [users, challenges, projects, companies, institutions, queues, exp, evalCount] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where: { status: { not: "ANONYMISE" } }, _count: true }), prisma.challenge.groupBy({ by: ["status"], _count: true }), prisma.project.groupBy({ by: ["status"], _count: true }),
    prisma.company.groupBy({ by: ["kycStatus"], _count: true }), prisma.institution.groupBy({ by: ["status"], _count: true }),
    Promise.all([prisma.company.count({ where: { kycStatus: "EN_VERIFICATION" } }), prisma.challenge.count({ where: { status: "EN_REVISION" } }), prisma.institution.count({ where: { status: "EN_ATTENTE" } }), prisma.academicValidation.count({ where: { status: "EN_ATTENTE" } }), prisma.report.count({ where: { status: "OUVERT" } }), prisma.contactMessage.count({ where: { handledAt: null } })]),
    prisma.evaluation.findMany({ where: { type: "ETUDIANT_EXPERIENCE", hidden: false }, select: { rating: true } }), prisma.evaluation.count(),
  ]);
  const cs = Object.fromEntries(challenges.map((c) => [c.status, c._count])), ps = Object.fromEntries(projects.map((p) => [p.status, p._count]));
  const launched = projects.reduce((a, p) => a + p._count, 0) - (ps.ANNULE ?? 0);
  const published = (cs.PUBLIE ?? 0) + (cs.EN_COURS ?? 0) + (cs.CLOTURE ?? 0);
  return void res.json({
    role, usersByRole: Object.fromEntries(users.map((u) => [u.role, u._count])), challengesByStatus: cs, projectsByStatus: ps, companiesByKyc: Object.fromEntries(companies.map((c) => [c.kycStatus, c._count])), institutionsByStatus: Object.fromEntries(institutions.map((i) => [i.status, i._count])),
    queues: { kyc: queues[0], challenges: queues[1], institutions: queues[2], credits: queues[3], reports: queues[4], contact: queues[5] },
    matchingRate: published ? Math.round(((ps.EN_COURS ?? 0) + (ps.EN_EVALUATION ?? 0) + (ps.TERMINE ?? 0)) / published * 1000) / 10 : null, matchingNote: "Défis ayant abouti à un projet lancé / défis publiés (hors brouillons).",
    completionRate: launched ? Math.round(((ps.TERMINE ?? 0) / launched) * 1000) / 10 : null, completionNote: "Projets terminés / projets lancés.",
    nps: { average: avg(exp.map((e) => e.rating)), responses: exp.length }, evaluations: evalCount,
    revenue: null, revenueNote: "Chiffre d'affaires : non disponible tant que les paiements ne sont pas en service (phase 5).",
  });
});

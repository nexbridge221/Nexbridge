import { Router } from "express";
import { z } from "zod";
import { reportSchema } from "@nexbridge/shared";
import { conflict, forbidden, prisma } from "../../platform/core";
import { authenticate, requireRoles, validateBody } from "../../platform/http";
import { notifyMany } from "../notifications/routes";
import { getAccess, logActivity, memberUserIds, personName, requireMentor } from "./access";

const DAY = 86400_000;

/** Espace de suivi du mentor : vue consolidée de ses projets avec indicateurs de santé. */
export const mentorRouter = Router();
mentorRouter.use(authenticate, requireRoles("MENTOR"));
mentorRouter.get("/projects", async (req, res) => {
  const projects = await prisma.project.findMany({ where: { members: { some: { userId: req.auth!.id, projectRole: "MENTOR", leftAt: null } } }, include: { members: { where: { leftAt: null }, include: { user: { select: { firstName: true, lastName: true } } } } }, orderBy: { lastActivityAt: "desc" } });
  const now = new Date();
  const out = await Promise.all(projects.map(async (p) => {
    const [total, done, late, lateMs, toReview, toValidate, lastReport] = await Promise.all([
      prisma.task.count({ where: { projectId: p.id, deletedAt: null, parentTaskId: null } }), prisma.task.count({ where: { projectId: p.id, deletedAt: null, parentTaskId: null, status: "TERMINE" } }),
      prisma.task.count({ where: { projectId: p.id, deletedAt: null, parentTaskId: null, status: { not: "TERMINE" }, dueDate: { lt: now } } }),
      prisma.milestone.count({ where: { projectId: p.id, status: { not: "VALIDE" }, targetDate: { lt: now } } }),
      prisma.deliverable.count({ where: { projectId: p.id, status: { in: ["SOUMIS", "EN_REVISION"] }, mentorApprovedAt: null } }),
      prisma.milestone.count({ where: { projectId: p.id, status: { not: "VALIDE" }, mentorValidatedAt: null, targetDate: { lte: new Date(now.getTime() + 14 * DAY) } } }),
      prisma.mentorReport.findFirst({ where: { projectId: p.id }, orderBy: { weekStart: "desc" } }),
    ]);
    const inactive = p.status === "EN_COURS" && p.lastActivityAt != null && now.getTime() - p.lastActivityAt.getTime() > 7 * DAY;
    const alerts: string[] = [];
    if (inactive) alerts.push("Aucune activité depuis plus de 7 jours");
    if (lateMs) alerts.push(`${lateMs} jalon(s) dépassé(s)`);
    if (total > 0 && late / total > 0.3) alerts.push(`${late} tâche(s) en retard sur ${total}`);
    else if (late) alerts.push(`${late} tâche(s) en retard`);
    const health = lateMs || (total > 0 && late / total > 0.3) ? "ROUGE" : inactive || late ? "ORANGE" : "VERT";
    return { id: p.id, name: p.name, status: p.status, progressPct: p.progressPct, lastActivityAt: p.lastActivityAt, health, alerts, lateTasks: late, deliverablesToReview: toReview, milestonesToValidate: toValidate, lastReportWeek: lastReport?.weekStart ?? null, team: p.members.filter((m) => m.projectRole === "ETUDIANT" || m.projectRole === "CHEF_PROJET").map((m) => personName(m.user)) };
  }));
  res.json({ projects: out });
});

/** Rapports hebdomadaires (rédigés par le mentor ; visibilité entreprise / référent réglable). */
export const reportsRouter = Router({ mergeParams: true });
reportsRouter.use(authenticate);
const pid = (req: { params: Record<string, string | string[] | undefined> }) => String(req.params.projectId);
reportsRouter.get("/", async (req, res) => {
  const a = await getAccess(req, pid(req));
  if (a.role === "CHEF_PROJET" || a.role === "ETUDIANT") throw forbidden("Les rapports du mentor sont destinés à l'entreprise et à l'établissement.");
  const rows = await prisma.mentorReport.findMany({ where: { projectId: a.project.id, ...(a.role === "CONTACT_ENTREPRISE" ? { visibleToCompany: true } : a.role === "REFERENT" ? { visibleToReferent: true } : {}) }, orderBy: { weekStart: "desc" }, take: 60 });
  res.json({ reports: rows });
});
reportsRouter.post("/", validateBody(reportSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireMentor(a);
  const b = req.body as z.infer<typeof reportSchema>;
  const d = new Date(b.weekStart); const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  if (await prisma.mentorReport.findUnique({ where: { projectId_weekStart: { projectId: a.project.id, weekStart: monday } } })) throw conflict("Un rapport existe déjà pour cette semaine.", "REPORT_EXISTS");
  const r = await prisma.mentorReport.create({ data: { projectId: a.project.id, mentorId: a.userId, weekStart: monday, summary: b.summary, risks: b.risks, nextSteps: b.nextSteps, health: b.health, visibleToCompany: b.visibleToCompany, visibleToReferent: b.visibleToReferent } });
  await logActivity(a.project.id, a.userId, "report.created", "Rapport hebdomadaire du mentor publié", { entityType: "MentorReport", entityId: r.id });
  if (b.visibleToCompany) await notifyMany(await memberUserIds(a.project.id, { roles: ["CONTACT_ENTREPRISE"] }), { type: "project.report", title: "Nouveau rapport hebdomadaire du mentor", body: a.project.name, link: `/app/projets/${a.project.id}/rapports` });
  res.status(201).json({ report: r });
});

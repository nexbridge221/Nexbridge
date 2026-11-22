import { Router } from "express";
import { z } from "zod";
import { authenticate, validateQuery } from "../../platform/http";
import { prisma } from "../../platform/core";
import { fromMinor } from "../challenges/helpers";
import { canSee, getAccess, visibleSet } from "./access";

export const overviewRouter = Router();
overviewRouter.use(authenticate);

const DAY = 24 * 3600_000;
const userSel = { id: true, firstName: true, lastName: true } as const;

/** Mes projets (membre, ou lecture seule pour admin / référent). */
overviewRouter.get("/", async (req, res) => {
  const where = req.auth!.role === "ADMIN" || req.auth!.role === "SUPER_ADMIN" ? {} : req.auth!.role === "REFERENT_ACADEMIQUE"
    ? { members: { some: { user: { studentProfile: { institution: { referents: { some: { userId: req.auth!.id } } } } } } } }
    : { members: { some: { userId: req.auth!.id, leftAt: null } } };
  const rows = await prisma.project.findMany({ where, orderBy: { lastActivityAt: "desc" }, take: 100, include: { challenge: { select: { sector: { select: { name: true } } } }, members: { where: { leftAt: null }, include: { user: { select: userSel } } } } });
  const late = await prisma.task.groupBy({ by: ["projectId"], where: { projectId: { in: rows.map((r) => r.id) }, deletedAt: null, parentTaskId: null, status: { not: "TERMINE" }, dueDate: { lt: new Date() } }, _count: true });
  const lateBy = new Map(late.map((l) => [l.projectId, l._count]));
  res.json({ projects: rows.map((p) => ({ id: p.id, name: p.name, status: p.status, progressPct: p.progressPct, startDate: p.startDate, plannedEndDate: p.plannedEndDate, lastActivityAt: p.lastActivityAt, sector: p.challenge.sector?.name ?? null, lateTasks: lateBy.get(p.id) ?? 0, members: p.members.map((m) => ({ userId: m.userId, role: m.projectRole, name: `${m.user.firstName} ${m.user.lastName}` })) })) });
});

/** Vue générale + synthèse du projet (page d'accueil de NexSpace). */
overviewRouter.get("/:projectId", async (req, res) => {
  const a = await getAccess(req, String(req.params.projectId));
  const pid = a.project.id;
  const now = new Date();
  const [project, members, counts, lateTasks, nextMilestones, nextMeetings, lastMessages, lastDocs, activity, deliverables, lateMilestones] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: pid }, include: { challenge: { select: { id: true, title: true, sector: { select: { name: true } } } }, escrow: true } }),
    prisma.projectMember.findMany({ where: { projectId: pid, leftAt: null }, include: { user: { select: userSel } } }),
    prisma.task.groupBy({ by: ["status"], where: { projectId: pid, deletedAt: null, parentTaskId: null }, _count: true }),
    prisma.task.count({ where: { projectId: pid, deletedAt: null, parentTaskId: null, status: { not: "TERMINE" }, dueDate: { lt: now } } }),
    prisma.milestone.findMany({ where: { projectId: pid, status: { notIn: ["VALIDE"] } }, orderBy: { targetDate: "asc" }, take: 3 }),
    prisma.meeting.findMany({ where: { projectId: pid, startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 3 }),
    prisma.message.findMany({ where: { deletedAt: null, channel: { projectId: pid, type: { not: "DIRECT" } } }, orderBy: { createdAt: "desc" }, take: 5, include: { channel: { select: { name: true } } } }),
    prisma.document.findMany({ where: { projectId: pid, deletedAt: null, visibility: { in: visibleSet(a.role) } }, orderBy: { createdAt: "desc" }, take: 5, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } }),
    prisma.activityEvent.findMany({ where: { projectId: pid }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.deliverable.findMany({ where: { projectId: pid, status: { not: "VALIDE" }, dueDate: { lt: now } } }),
    prisma.milestone.count({ where: { projectId: pid, status: { notIn: ["VALIDE"] }, targetDate: { lt: now } } }),
  ]);
  const by = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>;
  const total = Object.values(by).reduce((x, y) => x + y, 0);
  // Alertes calculées (visibles de tous les membres ; remontent aussi au mentor)
  const alerts: { level: "info" | "attention" | "critique"; text: string }[] = [];
  if (project.lastActivityAt && now.getTime() - project.lastActivityAt.getTime() > 7 * DAY && project.status === "EN_COURS") alerts.push({ level: "attention", text: "Aucune activité depuis plus de 7 jours." });
  if (lateMilestones) alerts.push({ level: "critique", text: `${lateMilestones} jalon(s) dépassé(s) sans validation.` });
  if (total > 0 && lateTasks / total > 0.3) alerts.push({ level: "critique", text: `${lateTasks} tâche(s) en retard sur ${total} (plus de 30 %).` });
  else if (lateTasks > 0) alerts.push({ level: "attention", text: `${lateTasks} tâche(s) en retard.` });
  if (deliverables.length) alerts.push({ level: "attention", text: `${deliverables.length} livrable(s) en retard.` });
  if (!members.some((m) => m.projectRole === "MENTOR")) alerts.push({ level: "info", text: "Aucun mentor n'est encore affecté à ce projet." });
  const health = alerts.some((x) => x.level === "critique") ? "ROUGE" : alerts.some((x) => x.level === "attention") ? "ORANGE" : "VERT";
  const nextDeadline = [...nextMilestones.map((m) => ({ kind: "Jalon", title: m.title, at: m.targetDate })), ...(await prisma.task.findMany({ where: { projectId: pid, deletedAt: null, status: { not: "TERMINE" }, dueDate: { gte: now } }, orderBy: { dueDate: "asc" }, take: 1 })).map((t) => ({ kind: "Tâche", title: t.title, at: t.dueDate! }))].sort((x, y) => x.at.getTime() - y.at.getTime())[0] ?? null;
  const userMap = new Map(members.map((m) => [m.userId, m.user]));
  res.json({
    access: { role: a.role, readOnly: a.readOnly },
    project: { id: project.id, name: project.name, description: project.description, status: project.status, startDate: project.startDate, plannedEndDate: project.plannedEndDate, progressPct: project.progressPct, lastActivityAt: project.lastActivityAt, milestoneRule: project.milestoneRule, challenge: project.challenge, escrowStatus: project.escrow?.status ?? null },
    budget: a.role === "ADMIN" || a.role === "CONTACT_ENTREPRISE" || a.role === "MENTOR" || a.role === "CHEF_PROJET" || a.role === "ETUDIANT" ? { amount: fromMinor(project.budgetAmount, project.budgetCurrency), currency: project.budgetCurrency } : null,
    members: members.map((m) => ({ userId: m.userId, role: m.projectRole, name: `${m.user.firstName} ${m.user.lastName}` })),
    counts: { A_FAIRE: by.A_FAIRE ?? 0, EN_COURS: by.EN_COURS ?? 0, EN_REVISION: by.EN_REVISION ?? 0, TERMINE: by.TERMINE ?? 0, late: lateTasks, total },
    nextDeadline, health, alerts,
    milestones: nextMilestones, meetings: nextMeetings,
    lastMessages: lastMessages.map((m) => ({ id: m.id, body: m.body.slice(0, 140), channel: m.channel.name, author: userMap.get(m.authorId) ? `${userMap.get(m.authorId)!.firstName} ${userMap.get(m.authorId)!.lastName}` : "—", createdAt: m.createdAt })),
    lastDocuments: lastDocs.filter((d) => canSee(a.role, d.visibility)).map((d) => ({ id: d.id, name: d.name, createdAt: d.createdAt, version: d.versions[0]?.versionNo ?? 1 })),
    activity: activity.map((e) => ({ id: e.id, type: e.type, label: e.label, actor: e.actorId && userMap.get(e.actorId) ? `${userMap.get(e.actorId)!.firstName} ${userMap.get(e.actorId)!.lastName}` : "Système", createdAt: e.createdAt })),
  });
});

/** Fil d'activité complet (paginé, filtrable par type). */
overviewRouter.get("/:projectId/activity", async (req, res) => {
  const a = await getAccess(req, String(req.params.projectId));
  const q = validateQuery(z.object({ type: z.string().max(40).optional(), cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(30) }), req.query);
  const rows = await prisma.activityEvent.findMany({ where: { projectId: a.project.id, ...(q.type ? { type: { startsWith: q.type } } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
  const more = rows.length > q.limit; const page = more ? rows.slice(0, q.limit) : rows;
  const users = await prisma.user.findMany({ where: { id: { in: page.map((e) => e.actorId).filter(Boolean) as string[] } }, select: userSel });
  const um = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  res.json({ events: page.map((e) => ({ id: e.id, type: e.type, label: e.label, entityType: e.entityType, entityId: e.entityId, actor: e.actorId ? um.get(e.actorId) ?? "—" : "Système", createdAt: e.createdAt })), nextCursor: more ? page[page.length - 1]!.id : null });
});

/** Calendrier : échéances de tâches, réunions, jalons, livrables (fenêtre de dates). */
overviewRouter.get("/:projectId/calendar", async (req, res) => {
  const a = await getAccess(req, String(req.params.projectId));
  const q = validateQuery(z.object({ from: z.string().refine((v) => !Number.isNaN(Date.parse(v))), to: z.string().refine((v) => !Number.isNaN(Date.parse(v))) }), req.query);
  const from = new Date(q.from), to = new Date(q.to);
  const pid = a.project.id;
  const [tasks, meetings, milestones, deliverables] = await Promise.all([
    prisma.task.findMany({ where: { projectId: pid, deletedAt: null, dueDate: { gte: from, lte: to } }, select: { id: true, title: true, dueDate: true, status: true, priority: true } }),
    prisma.meeting.findMany({ where: { projectId: pid, startsAt: { gte: from, lte: to } }, select: { id: true, title: true, startsAt: true, durationMin: true, type: true } }),
    prisma.milestone.findMany({ where: { projectId: pid, targetDate: { gte: from, lte: to } }, select: { id: true, title: true, targetDate: true, status: true } }),
    prisma.deliverable.findMany({ where: { projectId: pid, dueDate: { gte: from, lte: to } }, select: { id: true, name: true, dueDate: true, status: true } }),
  ]);
  res.json({ events: [
    ...tasks.map((t) => ({ kind: "TASK" as const, id: t.id, title: t.title, at: t.dueDate!, status: t.status, priority: t.priority })),
    ...meetings.map((m) => ({ kind: "MEETING" as const, id: m.id, title: m.title, at: m.startsAt, durationMin: m.durationMin, type: m.type })),
    ...milestones.map((m) => ({ kind: "MILESTONE" as const, id: m.id, title: m.title, at: m.targetDate, status: m.status })),
    ...deliverables.map((d) => ({ kind: "DELIVERABLE" as const, id: d.id, title: d.name, at: d.dueDate!, status: d.status })),
  ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime()) });
});

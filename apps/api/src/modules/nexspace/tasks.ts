import { Router } from "express";
import type { Prisma, Task, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { commentSchema, labelSchema, milestoneSchema, taskCreateSchema, taskMoveSchema, taskUpdateSchema, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_STATUSES } from "@nexbridge/shared";
import { badRequest, forbidden, notFound, prisma } from "../../platform/core";
import { authenticate, requirePermission, validateBody, validateQuery } from "../../platform/http";
import { emitProject } from "../../platform/realtime";
import { notify, notifyMany } from "../notifications/routes";
import { assertMembers, getAccess, isTeam, logActivity, memberUserIds, personName, requireContributor, requireLeadOrMentor, requireTaskWriter, type Access } from "./access";

export const tasksRouter = Router({ mergeParams: true });
tasksRouter.use(authenticate);
const pid = (req: { params: Record<string, string | string[] | undefined> }) => String(req.params.projectId);

const taskInclude = {
  assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
  labels: { include: { label: true } },
  subtasks: { where: { deletedAt: null }, select: { id: true, status: true } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TaskInclude;
type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function serializeTask(t: TaskRow) {
  return {
    id: t.id, title: t.title, description: t.description, status: t.status, priority: t.priority, startDate: t.startDate, dueDate: t.dueDate, position: t.position, milestoneId: t.milestoneId, parentTaskId: t.parentTaskId,
    createdById: t.createdById, completedAt: t.completedAt, updatedAt: t.updatedAt, createdAt: t.createdAt,
    assignees: t.assignees.map((a) => ({ userId: a.userId, name: personName(a.user) })),
    labels: t.labels.map((l) => ({ id: l.label.id, name: l.label.name, color: l.label.color })),
    subtasks: { total: t.subtasks.length, done: t.subtasks.filter((s) => s.status === "TERMINE").length },
    comments: t._count.comments, attachments: t._count.attachments,
  };
}

/** Progression globale = tâches de premier niveau terminées / tâches de premier niveau (calcul serveur, mis en cache). */
export async function recomputeProgress(projectId: string): Promise<number> {
  const [total, done] = await Promise.all([
    prisma.task.count({ where: { projectId, deletedAt: null, parentTaskId: null } }),
    prisma.task.count({ where: { projectId, deletedAt: null, parentTaskId: null, status: "TERMINE" } }),
  ]);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  await prisma.project.update({ where: { id: projectId }, data: { progressPct: pct } });
  return pct;
}

async function loadTask(projectId: string, taskId: string) {
  const t = await prisma.task.findFirst({ where: { id: taskId, projectId, deletedAt: null }, include: taskInclude });
  if (!t) throw notFound("Tâche introuvable");
  return t;
}
async function history(taskId: string, actorId: string, field: string, oldValue: unknown, newValue: unknown) {
  const f = (v: unknown) => (v == null || v === "" ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
  if (f(oldValue) === f(newValue)) return;
  await prisma.taskHistory.create({ data: { taskId, actorId, field, oldValue: f(oldValue), newValue: f(newValue) } });
}
async function nextPosition(projectId: string, status: TaskStatus, parentTaskId: string | null): Promise<number> {
  const last = await prisma.task.findFirst({ where: { projectId, status, parentTaskId, deletedAt: null }, orderBy: { position: "desc" }, select: { position: true } });
  return (last?.position ?? 0) + 1000;
}
async function checkRefs(projectId: string, b: { milestoneId?: string | null; assigneeIds?: string[]; labelIds?: string[] }) {
  if (b.milestoneId && !(await prisma.milestone.findFirst({ where: { id: b.milestoneId, projectId } }))) throw badRequest("Jalon introuvable dans ce projet.");
  if (b.assigneeIds) await assertMembers(projectId, b.assigneeIds);
  if (b.labelIds?.length && (await prisma.label.count({ where: { id: { in: b.labelIds }, projectId } })) !== new Set(b.labelIds).size) throw badRequest("Étiquette introuvable dans ce projet.");
}

/* ---------------- Étiquettes ---------------- */
tasksRouter.get("/labels", async (req, res) => { const a = await getAccess(req, pid(req)); res.json({ labels: await prisma.label.findMany({ where: { projectId: a.project.id }, orderBy: { name: "asc" } }) }); });
tasksRouter.post("/labels", validateBody(labelSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireTaskWriter(a);
  const label = await prisma.label.upsert({ where: { projectId_name: { projectId: a.project.id, name: req.body.name } }, create: { projectId: a.project.id, ...req.body }, update: { color: req.body.color } });
  res.status(201).json({ label });
});

/* ---------------- Liste / filtres ---------------- */
tasksRouter.get("/", async (req, res) => {
  const a = await getAccess(req, pid(req));
  const q = validateQuery(z.object({ assignee: z.string().uuid().optional(), status: z.enum(TASK_STATUSES).optional(), priority: z.enum(["BASSE", "NORMALE", "HAUTE", "URGENTE"]).optional(), due: z.enum(["late", "week", "none"]).optional(), q: z.string().trim().max(80).optional(), milestoneId: z.string().uuid().optional() }), req.query);
  const now = new Date();
  const where: Prisma.TaskWhereInput = {
    projectId: a.project.id, deletedAt: null, parentTaskId: null,
    ...(q.assignee ? { assignees: { some: { userId: q.assignee } } } : {}), ...(q.status ? { status: q.status } : {}), ...(q.priority ? { priority: q.priority } : {}), ...(q.milestoneId ? { milestoneId: q.milestoneId } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }] } : {}),
    ...(q.due === "late" ? { dueDate: { lt: now }, status: { not: "TERMINE" } } : q.due === "week" ? { dueDate: { gte: now, lte: new Date(now.getTime() + 7 * 86400_000) } } : q.due === "none" ? { dueDate: null } : {}),
  };
  const tasks = await prisma.task.findMany({ where, include: taskInclude, orderBy: [{ status: "asc" }, { position: "asc" }], take: 500 });
  res.json({ tasks: tasks.map(serializeTask) });
});

/* ---------------- Création ---------------- */
tasksRouter.post("/", validateBody(taskCreateSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireTaskWriter(a);
  const b = req.body as z.infer<typeof taskCreateSchema>;
  await checkRefs(a.project.id, b);
  if (b.parentTaskId) {
    const parent = await prisma.task.findFirst({ where: { id: b.parentTaskId, projectId: a.project.id, deletedAt: null } });
    if (!parent) throw badRequest("Tâche parente introuvable.");
    if (parent.parentTaskId) throw badRequest("Les sous-tâches ne peuvent pas avoir de sous-tâches (un seul niveau).", "SUBTASK_DEPTH");
  }
  const t = await prisma.task.create({
    data: {
      projectId: a.project.id, title: b.title, description: b.description, status: b.status, priority: b.priority, startDate: b.startDate ? new Date(b.startDate) : null, dueDate: b.dueDate ? new Date(b.dueDate) : null,
      milestoneId: b.milestoneId ?? null, parentTaskId: b.parentTaskId ?? null, createdById: a.userId, completedAt: b.status === "TERMINE" ? new Date() : null, position: await nextPosition(a.project.id, b.status, b.parentTaskId ?? null),
      assignees: { create: [...new Set(b.assigneeIds)].map((userId) => ({ userId })) }, labels: { create: [...new Set(b.labelIds)].map((labelId) => ({ labelId })) },
    },
    include: taskInclude,
  });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } });
  await prisma.taskHistory.create({ data: { taskId: t.id, actorId: a.userId, field: "création", newValue: t.title } });
  await logActivity(a.project.id, a.userId, "task.created", `${personName(me)} a créé la tâche « ${t.title} »`, { entityType: "Task", entityId: t.id });
  if (!b.parentTaskId) await recomputeProgress(a.project.id);
  await notifyMany(b.assigneeIds.filter((u) => u !== a.userId), { type: "project.task", title: "Une tâche vous a été attribuée", body: `« ${t.title} » — ${a.project.name}`, link: `/app/projets/${a.project.id}/taches?tache=${t.id}` });
  emitProject(a.project.id, "task", { id: t.id });
  res.status(201).json({ task: serializeTask(t) });
});

/* ---------------- Détail ---------------- */
tasksRouter.get("/:taskId", async (req, res) => {
  const a = await getAccess(req, pid(req));
  const t = await loadTask(a.project.id, String(req.params.taskId));
  const [subtasks, comments, hist, atts] = await Promise.all([
    prisma.task.findMany({ where: { parentTaskId: t.id, deletedAt: null }, include: taskInclude, orderBy: { position: "asc" } }),
    prisma.taskComment.findMany({ where: { taskId: t.id }, orderBy: { createdAt: "asc" } }),
    prisma.taskHistory.findMany({ where: { taskId: t.id }, orderBy: { at: "desc" }, take: 50 }),
    prisma.taskAttachment.findMany({ where: { taskId: t.id }, include: { document: { include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } } } }),
  ]);
  const uids = [...new Set([...comments.map((c) => c.authorId), ...hist.map((h) => h.actorId)])];
  const users = await prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, firstName: true, lastName: true } });
  const um = new Map(users.map((u) => [u.id, personName(u)]));
  res.json({
    task: serializeTask(t), subtasks: subtasks.map(serializeTask),
    comments: comments.map((c) => ({ id: c.id, body: c.body, author: um.get(c.authorId) ?? "—", authorId: c.authorId, createdAt: c.createdAt, editedAt: c.editedAt })),
    history: hist.map((h) => ({ id: h.id, field: h.field, oldValue: h.oldValue, newValue: h.newValue, actor: um.get(h.actorId) ?? "—", at: h.at })),
    attachments: atts.filter((x) => !x.document.deletedAt).map((x) => ({ id: x.id, documentId: x.documentId, name: x.document.name, version: x.document.versions[0]?.versionNo ?? 1 })),
  });
});

/* ---------------- Modification ---------------- */
tasksRouter.patch("/:taskId", validateBody(taskUpdateSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireTaskWriter(a);
  const t = await loadTask(a.project.id, String(req.params.taskId));
  const b = req.body as z.infer<typeof taskUpdateSchema>;
  await checkRefs(a.project.id, b);
  const data: Prisma.TaskUpdateInput = {};
  if (b.title !== undefined) { await history(t.id, a.userId, "titre", t.title, b.title); data.title = b.title; }
  if (b.description !== undefined) { await history(t.id, a.userId, "description", t.description, b.description); data.description = b.description; }
  if (b.priority !== undefined) { await history(t.id, a.userId, "priorité", TASK_PRIORITY_LABELS[t.priority], TASK_PRIORITY_LABELS[b.priority]); data.priority = b.priority; }
  if (b.startDate !== undefined) { await history(t.id, a.userId, "date de début", t.startDate, b.startDate); data.startDate = b.startDate ? new Date(b.startDate) : null; }
  if (b.dueDate !== undefined) { await history(t.id, a.userId, "échéance", t.dueDate, b.dueDate); data.dueDate = b.dueDate ? new Date(b.dueDate) : null; }
  if (b.milestoneId !== undefined) { await history(t.id, a.userId, "jalon", t.milestoneId, b.milestoneId); data.milestone = b.milestoneId ? { connect: { id: b.milestoneId } } : { disconnect: true }; }
  if (b.status !== undefined && b.status !== t.status) {
    await history(t.id, a.userId, "statut", TASK_STATUS_LABELS[t.status], TASK_STATUS_LABELS[b.status]); data.status = b.status; data.completedAt = b.status === "TERMINE" ? new Date() : null; data.position = await nextPosition(a.project.id, b.status, t.parentTaskId);
  }
  const newAssignees: string[] = [];
  if (b.assigneeIds) {
    const ids = [...new Set(b.assigneeIds)]; const before = new Set(t.assignees.map((x) => x.userId));
    newAssignees.push(...ids.filter((i) => !before.has(i)));
    const names = await prisma.user.findMany({ where: { id: { in: ids } }, select: { firstName: true, lastName: true } });
    await history(t.id, a.userId, "assignés", t.assignees.map((x) => personName(x.user)).join(", "), names.map(personName).join(", "));
    await prisma.taskAssignee.deleteMany({ where: { taskId: t.id } });
    if (ids.length) await prisma.taskAssignee.createMany({ data: ids.map((userId) => ({ taskId: t.id, userId })) });
  }
  if (b.labelIds) { await prisma.taskLabel.deleteMany({ where: { taskId: t.id } }); const ids = [...new Set(b.labelIds)]; if (ids.length) await prisma.taskLabel.createMany({ data: ids.map((labelId) => ({ taskId: t.id, labelId })) }); }
  await prisma.task.update({ where: { id: t.id }, data });
  const fresh = await loadTask(a.project.id, t.id);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } });
  await logActivity(a.project.id, a.userId, b.status && b.status !== t.status ? "task.status" : "task.updated", b.status && b.status !== t.status ? `${personName(me)} a passé « ${fresh.title} » à « ${TASK_STATUS_LABELS[fresh.status]} »` : `${personName(me)} a modifié la tâche « ${fresh.title} »`, { entityType: "Task", entityId: t.id });
  if (!t.parentTaskId) await recomputeProgress(a.project.id);
  await notifyMany(newAssignees.filter((u) => u !== a.userId), { type: "project.task", title: "Une tâche vous a été attribuée", body: `« ${fresh.title} » — ${a.project.name}`, link: `/app/projets/${a.project.id}/taches?tache=${t.id}` });
  if (b.status === "EN_REVISION" && t.status !== "EN_REVISION") await notifyMany(await memberUserIds(a.project.id, { except: a.userId, roles: ["MENTOR", "CHEF_PROJET"] }), { type: "project.task", title: "Une tâche attend votre relecture", body: `« ${fresh.title} »`, link: `/app/projets/${a.project.id}/taches?tache=${t.id}` });
  emitProject(a.project.id, "task", { id: t.id });
  res.json({ task: serializeTask(fresh) });
});

/* ---------------- Déplacement (glisser-déposer) ---------------- */
tasksRouter.post("/:taskId/move", validateBody(taskMoveSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireTaskWriter(a);
  const t = await loadTask(a.project.id, String(req.params.taskId));
  const { status, beforeId, afterId } = req.body as z.infer<typeof taskMoveSchema>;
  const posOf = async (id?: string | null) => (id ? (await prisma.task.findFirst({ where: { id, projectId: a.project.id, deletedAt: null, status, parentTaskId: t.parentTaskId }, select: { position: true } }))?.position ?? null : null);
  const [pa, pb] = await Promise.all([posOf(afterId), posOf(beforeId)]);
  let position: number;
  if (pa != null && pb != null) position = pa === pb ? pa + 0.001 : (pa + pb) / 2;
  else if (pa != null) position = pa + 1000;
  else if (pb != null) position = pb - 1000;
  else position = await nextPosition(a.project.id, status, t.parentTaskId);
  const changed = status !== t.status;
  if (changed) await history(t.id, a.userId, "statut", TASK_STATUS_LABELS[t.status], TASK_STATUS_LABELS[status]);
  await prisma.task.update({ where: { id: t.id }, data: { status, position, completedAt: status === "TERMINE" ? (t.completedAt ?? new Date()) : null } });
  if (changed) {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } });
    await logActivity(a.project.id, a.userId, "task.status", `${personName(me)} a déplacé « ${t.title} » vers « ${TASK_STATUS_LABELS[status]} »`, { entityType: "Task", entityId: t.id });
    if (!t.parentTaskId) await recomputeProgress(a.project.id);
    if (status === "EN_REVISION") await notifyMany(await memberUserIds(a.project.id, { except: a.userId, roles: ["MENTOR", "CHEF_PROJET"] }), { type: "project.task", title: "Une tâche attend votre relecture", body: `« ${t.title} »`, link: `/app/projets/${a.project.id}/taches?tache=${t.id}` });
  }
  emitProject(a.project.id, "task", { id: t.id });
  res.json({ task: serializeTask(await loadTask(a.project.id, t.id)) });
});

/* ---------------- Suppression (confirmation côté interface) ---------------- */
tasksRouter.delete("/:taskId", async (req, res) => {
  const a = await getAccess(req, pid(req)); requireTaskWriter(a);
  const t = await loadTask(a.project.id, String(req.params.taskId));
  if (a.role === "ETUDIANT" && t.createdById !== a.userId) throw forbidden("Seul le chef de projet, le mentor ou l'auteur peut supprimer cette tâche.");
  await prisma.task.updateMany({ where: { OR: [{ id: t.id }, { parentTaskId: t.id }] }, data: { deletedAt: new Date() } });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } });
  await logActivity(a.project.id, a.userId, "task.deleted", `${personName(me)} a supprimé la tâche « ${t.title} »`, { entityType: "Task", entityId: t.id });
  if (!t.parentTaskId) await recomputeProgress(a.project.id);
  emitProject(a.project.id, "task", { id: t.id });
  res.status(204).end();
});

/* ---------------- Commentaires ---------------- */
tasksRouter.post("/:taskId/comments", validateBody(commentSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireContributor(a); // l'entreprise peut commenter
  const t = await loadTask(a.project.id, String(req.params.taskId));
  const c = await prisma.taskComment.create({ data: { taskId: t.id, authorId: a.userId, body: req.body.body } });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } });
  await logActivity(a.project.id, a.userId, "task.comment", `${personName(me)} a commenté « ${t.title} »`, { entityType: "Task", entityId: t.id });
  const targets = [...t.assignees.map((x) => x.userId), t.createdById].filter((u) => u !== a.userId);
  await notifyMany(targets, { type: "project.task", title: "Nouveau commentaire sur une tâche", body: `${personName(me)} : « ${req.body.body.slice(0, 100)} »`, link: `/app/projets/${a.project.id}/taches?tache=${t.id}` });
  emitProject(a.project.id, "task", { id: t.id });
  res.status(201).json({ comment: { id: c.id, body: c.body, author: personName(me), authorId: a.userId, createdAt: c.createdAt, editedAt: null } });
});
tasksRouter.delete("/:taskId/comments/:commentId", async (req, res) => {
  const a = await getAccess(req, pid(req)); requireContributor(a);
  const c = await prisma.taskComment.findFirst({ where: { id: String(req.params.commentId), taskId: String(req.params.taskId), task: { projectId: a.project.id } } });
  if (!c) throw notFound("Commentaire introuvable");
  if (c.authorId !== a.userId && !(a.role === "CHEF_PROJET" || a.role === "MENTOR")) throw forbidden();
  await prisma.taskComment.delete({ where: { id: c.id } });
  res.status(204).end();
});

/* ---------------- Pièces jointes (documents du projet) ---------------- */
tasksRouter.post("/:taskId/attachments", validateBody(z.object({ documentId: z.string().uuid() })), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireTaskWriter(a);
  const t = await loadTask(a.project.id, String(req.params.taskId));
  const doc = await prisma.document.findFirst({ where: { id: req.body.documentId, projectId: a.project.id, deletedAt: null } });
  if (!doc) throw notFound("Document introuvable");
  await prisma.taskAttachment.upsert({ where: { taskId_documentId: { taskId: t.id, documentId: doc.id } }, create: { taskId: t.id, documentId: doc.id, addedById: a.userId }, update: {} });
  await history(t.id, a.userId, "pièce jointe", null, doc.name);
  emitProject(a.project.id, "task", { id: t.id });
  res.status(201).json({ ok: true });
});
tasksRouter.delete("/:taskId/attachments/:attId", async (req, res) => {
  const a = await getAccess(req, pid(req)); requireTaskWriter(a);
  await prisma.taskAttachment.deleteMany({ where: { id: String(req.params.attId), taskId: String(req.params.taskId), task: { projectId: a.project.id } } });
  res.status(204).end();
});

/* =========================== Jalons =========================== */
export const milestonesRouter = Router({ mergeParams: true });
milestonesRouter.use(authenticate);

function effectiveStatus(m: { status: string; targetDate: Date }, tasks: { status: string }[]) {
  if (m.status === "VALIDE") return "VALIDE";
  if (m.targetDate < new Date()) return "MANQUE";
  if (tasks.length > 0 && tasks.every((t) => t.status === "TERMINE")) return "PRET";
  if (tasks.some((t) => t.status !== "A_FAIRE")) return "EN_COURS";
  return "A_VENIR";
}
async function milestoneView(projectId: string, id?: string) {
  const rows = await prisma.milestone.findMany({ where: { projectId, ...(id ? { id } : {}) }, orderBy: { targetDate: "asc" }, include: { tasks: { where: { deletedAt: null, parentTaskId: null }, select: { id: true, status: true } }, deliverables: { select: { id: true, name: true, status: true } } } });
  const owners = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.ownerId).filter(Boolean) as string[] } }, select: { id: true, firstName: true, lastName: true } });
  const om = new Map(owners.map((u) => [u.id, personName(u)]));
  return rows.map((m) => ({ id: m.id, title: m.title, description: m.description, targetDate: m.targetDate, ownerId: m.ownerId, owner: m.ownerId ? om.get(m.ownerId) ?? null : null, status: effectiveStatus(m, m.tasks), validated: m.status === "VALIDE", mentorValidatedAt: m.mentorValidatedAt, companyValidatedAt: m.companyValidatedAt, validatedAt: m.validatedAt, tasks: { total: m.tasks.length, done: m.tasks.filter((t) => t.status === "TERMINE").length }, deliverables: m.deliverables }));
}
milestonesRouter.get("/", async (req, res) => { const a = await getAccess(req, pid(req)); res.json({ milestones: await milestoneView(a.project.id), rule: a.project.milestoneRule }); });
milestonesRouter.post("/", validateBody(milestoneSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireLeadOrMentor(a);
  if (req.body.ownerId) await assertMembers(a.project.id, [req.body.ownerId]);
  const m = await prisma.milestone.create({ data: { projectId: a.project.id, title: req.body.title, description: req.body.description, targetDate: new Date(req.body.targetDate), ownerId: req.body.ownerId ?? null } });
  await logActivity(a.project.id, a.userId, "milestone.created", `Jalon « ${m.title} » créé`, { entityType: "Milestone", entityId: m.id });
  res.status(201).json({ milestone: (await milestoneView(a.project.id, m.id))[0] });
});
milestonesRouter.patch("/:id", validateBody(milestoneSchema.partial()), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireLeadOrMentor(a);
  const m = await prisma.milestone.findFirst({ where: { id: String(req.params.id), projectId: a.project.id } });
  if (!m) throw notFound("Jalon introuvable");
  if (req.body.ownerId) await assertMembers(a.project.id, [req.body.ownerId]);
  await prisma.milestone.update({ where: { id: m.id }, data: { ...(req.body.title ? { title: req.body.title } : {}), ...(req.body.description !== undefined ? { description: req.body.description } : {}), ...(req.body.targetDate ? { targetDate: new Date(req.body.targetDate) } : {}), ...(req.body.ownerId !== undefined ? { ownerId: req.body.ownerId } : {}) } });
  res.json({ milestone: (await milestoneView(a.project.id, m.id))[0] });
});
milestonesRouter.delete("/:id", async (req, res) => {
  const a = await getAccess(req, pid(req)); requireLeadOrMentor(a);
  await prisma.milestone.deleteMany({ where: { id: String(req.params.id), projectId: a.project.id } });
  res.status(204).end();
});
/** Validation selon la règle du projet : MENTOR, ENTREPRISE ou LES_DEUX. Sans mentor affecté, l'entreprise peut valider seule. */
milestonesRouter.post("/:id/validate", requirePermission("project:read:member"), async (req, res) => {
  const a = await getAccess(req, pid(req));
  if (a.readOnly || !(a.role === "MENTOR" || a.role === "CONTACT_ENTREPRISE")) throw forbidden("Seuls le mentor et l'entreprise valident les jalons.", "SPACE_FORBIDDEN");
  const m = await prisma.milestone.findFirst({ where: { id: String(req.params.id), projectId: a.project.id } });
  if (!m) throw notFound("Jalon introuvable");
  if (m.status === "VALIDE") throw badRequest("Ce jalon est déjà validé.", "ALREADY_VALIDATED");
  const hasMentor = (await memberUserIds(a.project.id, { roles: ["MENTOR"] })).length > 0;
  const rule = a.project.milestoneRule;
  const mentorNeeded = rule !== "ENTREPRISE" && hasMentor, companyNeeded = rule !== "MENTOR" || !hasMentor;
  if (a.role === "MENTOR" && !mentorNeeded) throw forbidden("Ce jalon est validé par l'entreprise.");
  if (a.role === "CONTACT_ENTREPRISE" && !companyNeeded) throw forbidden("Ce jalon est validé par le mentor.");
  const data = a.role === "MENTOR" ? { mentorValidatedAt: new Date() } : { companyValidatedAt: new Date() };
  const mentorDone = a.role === "MENTOR" || Boolean(m.mentorValidatedAt), companyDone = a.role === "CONTACT_ENTREPRISE" || Boolean(m.companyValidatedAt);
  const complete = (!mentorNeeded || mentorDone) && (!companyNeeded || companyDone);
  await prisma.milestone.update({ where: { id: m.id }, data: { ...data, ...(complete ? { status: "VALIDE" as const, validatedAt: new Date() } : {}) } });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } });
  await logActivity(a.project.id, a.userId, "milestone.validated", complete ? `Jalon « ${m.title} » validé` : `${personName(me)} a validé le jalon « ${m.title} » (en attente de l'autre partie)`, { entityType: "Milestone", entityId: m.id });
  await notifyMany(await memberUserIds(a.project.id, { except: a.userId }), { type: "project.milestone", title: complete ? "Jalon validé" : "Jalon : première validation", body: m.title, link: `/app/projets/${a.project.id}/jalons` });
  emitProject(a.project.id, "milestone", { id: m.id });
  res.json({ milestone: (await milestoneView(a.project.id, m.id))[0], complete });
});

export type { Access, Task };
void isTeam; void notify;

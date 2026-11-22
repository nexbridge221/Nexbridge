import { Router } from "express";
import { z } from "zod";
import { logger, notFound, prisma } from "../../platform/core";
import { emails, mail } from "../../platform/mail";
import { authenticate, validateQuery } from "../../platform/http";

export const notificationRouter = Router();
notificationRouter.use(authenticate);

/** Crée une notification in-app (utilisée par les autres modules lors des événements métier). */
export async function notify(userId: string, n: { type: string; title: string; body?: string; link?: string; payload?: object; email?: boolean }): Promise<void> {
  const { email, ...data } = n;
  // Catégorie de préférence = premier segment du type (ex. « challenge.approved » → « challenge »).
  const pref = await prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type: n.type.split(".")[0]! } } });
  if (!pref || pref.inApp) await prisma.notification.create({ data: { userId, ...data } });
  if (email && (!pref || pref.email)) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true, status: true } });
    if (user?.emailVerifiedAt && user.status === "ACTIF") {
      try { await mail.send(emails.notice(user.email, n.title, n.body ?? n.title, n.link)); } catch (e) { logger.warn({ err: (e as Error).message }, "Envoi d'e-mail de notification impossible"); }
    }
  }
}

export async function notifyMany(userIds: string[], n: Parameters<typeof notify>[1]): Promise<void> {
  await Promise.all([...new Set(userIds)].map((id) => notify(id, n)));
}

notificationRouter.get("/", async (req, res) => {
  const q = validateQuery(z.object({ unread: z.coerce.boolean().optional(), cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }), req.query);
  const rows = await prisma.notification.findMany({
    where: { userId: req.auth!.id, ...(q.unread ? { readAt: null } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  const unreadCount = await prisma.notification.count({ where: { userId: req.auth!.id, readAt: null } });
  res.json({ notifications: items, nextCursor: hasMore ? items[items.length - 1]!.id : null, unreadCount });
});

notificationRouter.post("/read-all", async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.auth!.id, readAt: null }, data: { readAt: new Date() } });
  res.status(204).end();
});

notificationRouter.post("/:id/read", async (req, res) => {
  const result = await prisma.notification.updateMany({ where: { id: String(req.params.id), userId: req.auth!.id, readAt: null }, data: { readAt: new Date() } });
  if (result.count === 0 && !(await prisma.notification.findFirst({ where: { id: String(req.params.id), userId: req.auth!.id } }))) throw notFound("Notification introuvable");
  res.status(204).end();
});

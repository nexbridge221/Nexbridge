import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { channelCreateSchema, messageSchema, MAX_FILE_BYTES, reactionSchema } from "@nexbridge/shared";
import { badRequest, forbidden, notFound, prisma } from "../../platform/core";
import { authenticate, validateBody, validateQuery } from "../../platform/http";
import { emitProject } from "../../platform/realtime";
import { readFileObject, saveUpload } from "../../platform/storage";
import { notify } from "../notifications/routes";
import { assertMembers, getAccess, memberUserIds, personName, requireContributor, type Access } from "./access";
import { DOC_MIME } from "./documents";

export const messagingRouter = Router({ mergeParams: true });
messagingRouter.use(authenticate);
const pid = (req: { params: Record<string, string | string[] | undefined> }) => String(req.params.projectId);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

/** La messagerie est réservée aux membres du projet (ni l'administrateur ni le référent n'y lisent les échanges). */
async function chatAccess(req: Parameters<typeof getAccess>[0]): Promise<Access> {
  const a = await getAccess(req, pid(req));
  if (!a.isMember) throw forbidden("La messagerie est réservée aux membres du projet.", "CHAT_MEMBERS_ONLY");
  return a;
}

/** Garantit l'existence du canal général et l'inscription de tous les membres actuels. */
export async function ensureGeneralChannel(projectId: string) {
  let ch = await prisma.channel.findFirst({ where: { projectId, type: "GENERAL" } });
  if (!ch) ch = await prisma.channel.create({ data: { projectId, type: "GENERAL", name: "général" } });
  const ids = await memberUserIds(projectId);
  const have = new Set((await prisma.channelMember.findMany({ where: { channelId: ch.id }, select: { userId: true } })).map((m) => m.userId));
  const missing = ids.filter((i) => !have.has(i));
  if (missing.length) await prisma.channelMember.createMany({ data: missing.map((userId) => ({ channelId: ch!.id, userId })), skipDuplicates: true });
  return ch;
}

async function loadChannel(a: Access, id: string) {
  const ch = await prisma.channel.findFirst({ where: { id, projectId: a.project.id } });
  if (!ch) throw notFound("Canal introuvable");
  if (ch.type === "DIRECT" && !(await prisma.channelMember.findFirst({ where: { channelId: ch.id, userId: a.userId } }))) throw notFound("Canal introuvable");
  return ch;
}

messagingRouter.get("/channels", async (req, res) => {
  const a = await chatAccess(req);
  await ensureGeneralChannel(a.project.id);
  const mine = await prisma.channelMember.findMany({ where: { userId: a.userId, channel: { projectId: a.project.id } }, include: { channel: { include: { members: { select: { userId: true } } } } } });
  const thematic = await prisma.channel.findMany({ where: { projectId: a.project.id, type: "THEMATIQUE" } });
  const channels = [...new Map([...mine.map((m) => m.channel), ...thematic].map((c) => [c.id, c])).values()];
  const lastRead = new Map(mine.map((m) => [m.channelId, m.lastReadAt]));
  const unread = await Promise.all(channels.map((c) => prisma.message.count({ where: { channelId: c.id, deletedAt: null, authorId: { not: a.userId }, createdAt: { gt: lastRead.get(c.id) ?? new Date(0) } } })));
  const dmUsers = await prisma.user.findMany({ where: { id: { in: mine.flatMap((m) => (m.channel.type === "DIRECT" ? m.channel.members.map((x) => x.userId) : [])).filter((u) => u !== a.userId) } }, select: { id: true, firstName: true, lastName: true } });
  const um = new Map(dmUsers.map((u) => [u.id, personName(u)]));
  res.json({ channels: channels.map((c, i) => {
    const mem = mine.find((m) => m.channelId === c.id)?.channel.members;
    const other = c.type === "DIRECT" ? mem?.find((x) => x.userId !== a.userId)?.userId : undefined;
    return { id: c.id, type: c.type, name: c.type === "DIRECT" ? (other ? um.get(other) ?? "Message direct" : "Message direct") : c.name, unread: unread[i]!, otherUserId: other ?? null };
  }).sort((x, y) => (x.type === "GENERAL" ? -1 : y.type === "GENERAL" ? 1 : x.name.localeCompare(y.name, "fr"))) });
});

messagingRouter.post("/channels", validateBody(channelCreateSchema), async (req, res) => {
  const a = await chatAccess(req); requireContributor(a);
  const b = req.body as z.infer<typeof channelCreateSchema>;
  if (b.type === "THEMATIQUE") {
    const ch = await prisma.channel.create({ data: { projectId: a.project.id, type: "THEMATIQUE", name: b.name.toLowerCase(), members: { create: (await memberUserIds(a.project.id)).map((userId) => ({ userId })) } } });
    emitProject(a.project.id, "channel", {});
    return void res.status(201).json({ channel: { id: ch.id } });
  }
  if (b.userId === a.userId) throw badRequest("Impossible d'écrire à soi-même.");
  await assertMembers(a.project.id, [b.userId]);
  const dmKey = [a.userId, b.userId].sort().join(":");
  const ch = (await prisma.channel.findUnique({ where: { projectId_dmKey: { projectId: a.project.id, dmKey } } })) ?? (await prisma.channel.create({ data: { projectId: a.project.id, type: "DIRECT", name: "direct", dmKey, members: { create: [{ userId: a.userId }, { userId: b.userId }] } } }));
  res.status(201).json({ channel: { id: ch.id } });
});

async function messageView(a: Access, rows: Awaited<ReturnType<typeof fetchMessages>>) {
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((m) => m.authorId))] } }, select: { id: true, firstName: true, lastName: true } });
  const um = new Map(users.map((u) => [u.id, personName(u)]));
  const files = await prisma.fileObject.findMany({ where: { id: { in: rows.map((m) => m.fileId).filter(Boolean) as string[] } }, select: { id: true, originalName: true, size: true, mime: true } });
  const fm = new Map(files.map((f) => [f.id, f]));
  const replies = await prisma.message.groupBy({ by: ["parentId"], where: { parentId: { in: rows.map((m) => m.id) }, deletedAt: null }, _count: true });
  const rc = new Map(replies.map((r) => [r.parentId, r._count]));
  return rows.map((m) => {
    const grouped = new Map<string, string[]>();
    for (const r of m.reactions) grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.userId]);
    return { id: m.id, channelId: m.channelId, body: m.deletedAt ? "" : m.body, deleted: Boolean(m.deletedAt), author: um.get(m.authorId) ?? "—", authorId: m.authorId, parentId: m.parentId, createdAt: m.createdAt, editedAt: m.editedAt, mentions: m.mentions.map((x) => x.userId), file: m.fileId && !m.deletedAt ? fm.get(m.fileId) ?? null : null, replies: rc.get(m.id) ?? 0, reactions: [...grouped.entries()].map(([emoji, users]) => ({ emoji, count: users.length, mine: users.includes(a.userId) })) };
  });
}
const fetchMessages = (where: object, take: number) => prisma.message.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, include: { mentions: true, reactions: true } });

messagingRouter.get("/channels/:cid/messages", async (req, res) => {
  const a = await chatAccess(req);
  const ch = await loadChannel(a, String(req.params.cid));
  const q = validateQuery(z.object({ cursor: z.string().uuid().optional(), parentId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(30) }), req.query);
  const rows = await prisma.message.findMany({ where: { channelId: ch.id, parentId: q.parentId ?? null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}), include: { mentions: true, reactions: true } });
  const more = rows.length > q.limit; const page = more ? rows.slice(0, q.limit) : rows;
  res.json({ messages: (await messageView(a, page)).reverse(), nextCursor: more ? page[page.length - 1]!.id : null });
});

messagingRouter.post("/channels/:cid/upload", upload.single("file"), async (req, res) => {
  const a = await chatAccess(req); requireContributor(a);
  await loadChannel(a, String(req.params.cid));
  if (!req.file) throw badRequest("Aucun fichier reçu");
  const f = await saveUpload({ ownerId: a.userId, originalName: req.file.originalname, data: req.file.buffer, allowedMime: new Set([...DOC_MIME].filter((m) => m !== "video/mp4")), maxBytes: MAX_FILE_BYTES });
  res.status(201).json({ file: { id: f.id, originalName: f.originalName, size: f.size, mime: f.mime } });
});

messagingRouter.post("/channels/:cid/messages", validateBody(messageSchema), async (req, res) => {
  const a = await chatAccess(req); requireContributor(a);
  const ch = await loadChannel(a, String(req.params.cid));
  const b = req.body as z.infer<typeof messageSchema>;
  const mentions = [...new Set(b.mentions)].filter((u) => u !== a.userId);
  await assertMembers(a.project.id, mentions);
  if (b.parentId && !(await prisma.message.findFirst({ where: { id: b.parentId, channelId: ch.id, parentId: null } }))) throw badRequest("Message d'origine introuvable.");
  if (b.fileId) {
    const f = await prisma.fileObject.findFirst({ where: { id: b.fileId, ownerId: a.userId } });
    if (!f || (await prisma.message.count({ where: { fileId: f.id } }))) throw badRequest("Fichier invalide.");
  }
  const m = await prisma.message.create({ data: { channelId: ch.id, authorId: a.userId, body: b.body, parentId: b.parentId ?? null, fileId: b.fileId ?? null, mentions: { create: mentions.map((userId) => ({ userId })) } }, include: { mentions: true, reactions: true } });
  await prisma.channelMember.updateMany({ where: { channelId: ch.id, userId: a.userId }, data: { lastReadAt: new Date() } });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } });
  await prisma.project.update({ where: { id: a.project.id }, data: { lastActivityAt: new Date() } });
  for (const u of mentions) await notify(u, { type: "message.mention", title: `${personName(me)} vous a mentionné(e)`, body: b.body.slice(0, 120), link: `/app/projets/${a.project.id}/messages?canal=${ch.id}`, email: true });
  if (ch.type === "DIRECT") { const other = (await prisma.channelMember.findMany({ where: { channelId: ch.id } })).find((x) => x.userId !== a.userId); if (other && !mentions.includes(other.userId)) await notify(other.userId, { type: "message.direct", title: `Message de ${personName(me)}`, body: b.body.slice(0, 120), link: `/app/projets/${a.project.id}/messages?canal=${ch.id}` }); }
  emitProject(a.project.id, "message", { channelId: ch.id });
  res.status(201).json({ message: (await messageView(a, [m]))[0] });
});

messagingRouter.patch("/channels/:cid/messages/:mid", validateBody(z.object({ body: z.string().trim().min(1).max(4000) })), async (req, res) => {
  const a = await chatAccess(req); await loadChannel(a, String(req.params.cid));
  const m = await prisma.message.findFirst({ where: { id: String(req.params.mid), channelId: String(req.params.cid), deletedAt: null } });
  if (!m) throw notFound("Message introuvable");
  if (m.authorId !== a.userId) throw forbidden("Vous ne pouvez modifier que vos messages.");
  await prisma.message.update({ where: { id: m.id }, data: { body: req.body.body, editedAt: new Date() } });
  emitProject(a.project.id, "message", { channelId: m.channelId });
  res.json({ ok: true });
});
messagingRouter.delete("/channels/:cid/messages/:mid", async (req, res) => {
  const a = await chatAccess(req); await loadChannel(a, String(req.params.cid));
  const m = await prisma.message.findFirst({ where: { id: String(req.params.mid), channelId: String(req.params.cid), deletedAt: null } });
  if (!m) throw notFound("Message introuvable");
  if (m.authorId !== a.userId && !(a.role === "CHEF_PROJET" || a.role === "MENTOR")) throw forbidden();
  await prisma.message.update({ where: { id: m.id }, data: { deletedAt: new Date() } });
  emitProject(a.project.id, "message", { channelId: m.channelId });
  res.status(204).end();
});
messagingRouter.post("/channels/:cid/messages/:mid/reactions", validateBody(reactionSchema), async (req, res) => {
  const a = await chatAccess(req); requireContributor(a); await loadChannel(a, String(req.params.cid));
  const m = await prisma.message.findFirst({ where: { id: String(req.params.mid), channelId: String(req.params.cid), deletedAt: null } });
  if (!m) throw notFound("Message introuvable");
  const key = { messageId_userId_emoji: { messageId: m.id, userId: a.userId, emoji: req.body.emoji } };
  if (await prisma.messageReaction.findUnique({ where: key })) await prisma.messageReaction.delete({ where: key }); else await prisma.messageReaction.create({ data: { messageId: m.id, userId: a.userId, emoji: req.body.emoji } });
  emitProject(a.project.id, "message", { channelId: m.channelId });
  res.json({ ok: true });
});
messagingRouter.post("/channels/:cid/read", async (req, res) => {
  const a = await chatAccess(req); const ch = await loadChannel(a, String(req.params.cid));
  await prisma.channelMember.upsert({ where: { channelId_userId: { channelId: ch.id, userId: a.userId } }, create: { channelId: ch.id, userId: a.userId }, update: { lastReadAt: new Date() } });
  res.status(204).end();
});
messagingRouter.get("/channels/:cid/messages/:mid/file", async (req, res) => {
  const a = await chatAccess(req); await loadChannel(a, String(req.params.cid));
  const m = await prisma.message.findFirst({ where: { id: String(req.params.mid), channelId: String(req.params.cid), deletedAt: null, fileId: { not: null } } });
  if (!m?.fileId) throw notFound("Fichier introuvable");
  const { file, data } = await readFileObject(m.fileId);
  res.setHeader("Content-Type", file.mime);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(data);
});

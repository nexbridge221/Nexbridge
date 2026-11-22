import { Router } from "express";
import { z } from "zod";
import { meetingSchema, meetingUpdateSchema, rsvpSchema } from "@nexbridge/shared";
import { forbidden, notFound, prisma, randomToken } from "../../platform/core";
import { authenticate, validateBody } from "../../platform/http";
import { emitProject } from "../../platform/realtime";
import { notifyMany } from "../notifications/routes";
import { assertMembers, getAccess, logActivity, memberUserIds, personName, requireContributor } from "./access";

export const meetingsRouter = Router({ mergeParams: true });
meetingsRouter.use(authenticate);
const pid = (req: { params: Record<string, string | string[] | undefined> }) => String(req.params.projectId);

async function view(projectId: string, id?: string) {
  const rows = await prisma.meeting.findMany({ where: { projectId, ...(id ? { id } : {}) }, orderBy: { startsAt: "desc" }, include: { participants: true }, take: 200 });
  const um = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.createdById, ...r.participants.map((p) => p.userId)]))] } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, personName(u)]));
  return rows.map((m) => ({ id: m.id, title: m.title, type: m.type, startsAt: m.startsAt, durationMin: m.durationMin, agenda: m.agenda, description: m.description, videoUrl: m.videoUrl, minutes: m.minutes, createdById: m.createdById, createdBy: um.get(m.createdById) ?? "—", participants: m.participants.map((p) => ({ userId: p.userId, name: um.get(p.userId) ?? "—", rsvp: p.rsvp })) }));
}
const jitsi = () => `https://meet.jit.si/nexbridge-${randomToken(9).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;

meetingsRouter.get("/", async (req, res) => { const a = await getAccess(req, pid(req)); res.json({ meetings: await view(a.project.id) }); });

meetingsRouter.post("/", validateBody(meetingSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireContributor(a);
  const b = req.body as z.infer<typeof meetingSchema>;
  const everyone = await memberUserIds(a.project.id);
  const ids = [...new Set([a.userId, ...(b.participantIds.length ? b.participantIds : everyone)])];
  await assertMembers(a.project.id, ids);
  const m = await prisma.meeting.create({ data: { projectId: a.project.id, title: b.title, type: b.type, startsAt: new Date(b.startsAt), durationMin: b.durationMin, agenda: b.agenda, description: b.description, videoUrl: b.videoUrl ?? (b.generateVideo ? jitsi() : null), createdById: a.userId, participants: { create: ids.map((userId) => ({ userId, rsvp: userId === a.userId ? "ACCEPTE" : "EN_ATTENTE" })) } } });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } });
  await logActivity(a.project.id, a.userId, "meeting.created", `${personName(me)} a planifié la réunion « ${m.title} »`, { entityType: "Meeting", entityId: m.id });
  await notifyMany(ids.filter((u) => u !== a.userId), { type: "project.meeting", title: "Nouvelle réunion", body: `${m.title} — ${m.startsAt.toLocaleString("fr-FR")}`, link: `/app/projets/${a.project.id}/reunions`, email: true });
  emitProject(a.project.id, "meeting", { id: m.id });
  res.status(201).json({ meeting: (await view(a.project.id, m.id))[0] });
});

meetingsRouter.patch("/:id", validateBody(meetingUpdateSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireContributor(a);
  const m = await prisma.meeting.findFirst({ where: { id: String(req.params.id), projectId: a.project.id } });
  if (!m) throw notFound("Réunion introuvable");
  if (m.createdById !== a.userId && !(a.role === "CHEF_PROJET" || a.role === "MENTOR")) throw forbidden("Réservé à l'organisateur, au chef de projet et au mentor.");
  const b = req.body as z.infer<typeof meetingUpdateSchema>;
  await prisma.meeting.update({ where: { id: m.id }, data: { ...(b.title ? { title: b.title } : {}), ...(b.type ? { type: b.type } : {}), ...(b.startsAt ? { startsAt: new Date(b.startsAt) } : {}), ...(b.durationMin ? { durationMin: b.durationMin } : {}), ...(b.agenda !== undefined ? { agenda: b.agenda } : {}), ...(b.description !== undefined ? { description: b.description } : {}), ...(b.videoUrl !== undefined ? { videoUrl: b.videoUrl } : {}), ...(b.minutes !== undefined ? { minutes: b.minutes } : {}) } });
  if (b.minutes !== undefined) await logActivity(a.project.id, a.userId, "meeting.minutes", `Compte rendu ajouté à la réunion « ${m.title} »`, { entityType: "Meeting", entityId: m.id });
  emitProject(a.project.id, "meeting", { id: m.id });
  res.json({ meeting: (await view(a.project.id, m.id))[0] });
});

meetingsRouter.delete("/:id", async (req, res) => {
  const a = await getAccess(req, pid(req)); requireContributor(a);
  const m = await prisma.meeting.findFirst({ where: { id: String(req.params.id), projectId: a.project.id } });
  if (!m) throw notFound("Réunion introuvable");
  if (m.createdById !== a.userId && !(a.role === "CHEF_PROJET" || a.role === "MENTOR")) throw forbidden();
  await prisma.meeting.delete({ where: { id: m.id } });
  emitProject(a.project.id, "meeting", { id: m.id });
  res.status(204).end();
});

meetingsRouter.post("/:id/rsvp", validateBody(rsvpSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireContributor(a);
  const r = await prisma.meetingParticipant.updateMany({ where: { meetingId: String(req.params.id), userId: a.userId, meeting: { projectId: a.project.id } }, data: { rsvp: req.body.rsvp } });
  if (r.count === 0) throw notFound("Invitation introuvable");
  emitProject(a.project.id, "meeting", { id: String(req.params.id) });
  res.json({ ok: true });
});

/** Invitation .ics (calendrier) */
meetingsRouter.get("/:id/ics", async (req, res) => {
  const a = await getAccess(req, pid(req));
  const m = await prisma.meeting.findFirst({ where: { id: String(req.params.id), projectId: a.project.id } });
  if (!m) throw notFound("Réunion introuvable");
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NEXBRIDGE//NexSpace//FR", "BEGIN:VEVENT", `UID:${m.id}@nexbridge`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(m.startsAt)}`, `DTEND:${fmt(new Date(m.startsAt.getTime() + m.durationMin * 60_000))}`, `SUMMARY:${esc(m.title)}`, ...(m.videoUrl ? [`URL:${m.videoUrl}`, `LOCATION:${esc(m.videoUrl)}`] : []), ...(m.agenda ? [`DESCRIPTION:${esc(m.agenda)}`] : []), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="reunion.ics"`);
  res.send(ics);
});

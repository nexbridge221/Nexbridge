import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { DOC_VISIBILITIES, DOCUMENT_MIME_TYPES, documentUpdateSchema, folderSchema, MAX_FILE_BYTES, MAX_VIDEO_BYTES } from "@nexbridge/shared";
import { badRequest, conflict, forbidden, notFound, prisma } from "../../platform/core";
import { authenticate, validateBody } from "../../platform/http";
import { emitProject } from "../../platform/realtime";
import { readFileObject, saveUpload, storage } from "../../platform/storage";
import { canSee, getAccess, logActivity, personName, requireContributor, visibleSet, type Access } from "./access";

export const documentsRouter = Router({ mergeParams: true });
documentsRouter.use(authenticate);
const pid = (req: { params: Record<string, string | string[] | undefined> }) => String(req.params.projectId);

/** Formats autorisés (CDC) : PDF, Word, Excel, PowerPoint, images, MP4, ZIP. « x-cfb » = anciens formats Office (.doc/.xls/.ppt). */
export const DOC_MIME = new Set<string>([...DOCUMENT_MIME_TYPES, "application/x-cfb"]);
export const limitFor = (mime: string) => (mime === "video/mp4" ? MAX_VIDEO_BYTES : MAX_FILE_BYTES);
/** Types affichables dans le navigateur sans risque (aperçu intégré). */
const INLINE_OK = new Set(["application/pdf", "image/png", "image/jpeg", "video/mp4"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_VIDEO_BYTES, files: 1 } });
const KEEP_VERSIONS = 3;

/* ---------------- Dossiers ---------------- */
documentsRouter.get("/folders", async (req, res) => {
  const a = await getAccess(req, pid(req));
  res.json({ folders: await prisma.folder.findMany({ where: { projectId: a.project.id, visibility: { in: visibleSet(a.role) } }, orderBy: { name: "asc" } }) });
});
documentsRouter.post("/folders", validateBody(folderSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireContributor(a);
  if (req.body.parentId && !(await prisma.folder.findFirst({ where: { id: req.body.parentId, projectId: a.project.id } }))) throw badRequest("Dossier parent introuvable.");
  const f = await prisma.folder.create({ data: { projectId: a.project.id, name: req.body.name, parentId: req.body.parentId ?? null, visibility: req.body.visibility } });
  emitProject(a.project.id, "document", {});
  res.status(201).json({ folder: f });
});
documentsRouter.delete("/folders/:id", async (req, res) => {
  const a = await getAccess(req, pid(req)); requireContributor(a);
  const f = await prisma.folder.findFirst({ where: { id: String(req.params.id), projectId: a.project.id }, include: { _count: { select: { children: true, documents: { where: { deletedAt: null } } as never } } } });
  if (!f) throw notFound("Dossier introuvable");
  if (f._count.children || (await prisma.document.count({ where: { folderId: f.id, deletedAt: null } }))) throw conflict("Ce dossier n'est pas vide.", "FOLDER_NOT_EMPTY");
  await prisma.folder.delete({ where: { id: f.id } });
  res.status(204).end();
});

/* ---------------- Documents ---------------- */
async function docView(a: Access, docs: Awaited<ReturnType<typeof loadDocs>>) {
  const fileIds = docs.flatMap((d) => d.versions.map((v) => v.fileId));
  const files = await prisma.fileObject.findMany({ where: { id: { in: fileIds } }, select: { id: true, size: true, mime: true, originalName: true, scanStatus: true } });
  const fm = new Map(files.map((f) => [f.id, f]));
  const users = await prisma.user.findMany({ where: { id: { in: docs.flatMap((d) => d.versions.map((v) => v.uploadedById)) } }, select: { id: true, firstName: true, lastName: true } });
  const um = new Map(users.map((u) => [u.id, personName(u)]));
  return docs.filter((d) => canSee(a.role, d.visibility)).map((d) => {
    const cur = d.versions[0]!; const f = fm.get(cur.fileId);
    return { id: d.id, name: d.name, folderId: d.folderId, visibility: d.visibility, createdById: d.createdById, createdAt: d.createdAt, versionCount: d.versions.length, current: { versionNo: cur.versionNo, size: f?.size ?? 0, mime: f?.mime ?? "", uploadedBy: um.get(cur.uploadedById) ?? "—", createdAt: cur.createdAt, previewable: INLINE_OK.has(f?.mime ?? "") }, versions: d.versions.map((v) => ({ id: v.id, versionNo: v.versionNo, size: fm.get(v.fileId)?.size ?? 0, uploadedBy: um.get(v.uploadedById) ?? "—", createdAt: v.createdAt })) };
  });
}
const loadDocs = (projectId: string, where: object = {}) => prisma.document.findMany({ where: { projectId, deletedAt: null, ...where }, orderBy: { createdAt: "desc" }, take: 300, include: { versions: { orderBy: { versionNo: "desc" } } } });

documentsRouter.get("/", async (req, res) => {
  const a = await getAccess(req, pid(req));
  const folderId = typeof req.query.folderId === "string" ? req.query.folderId : undefined;
  res.json({ documents: await docView(a, await loadDocs(a.project.id, folderId === "root" ? { folderId: null } : folderId ? { folderId } : {})) });
});

/** Dépôt : même nom dans le même dossier = nouvelle version (les 3 dernières sont conservées). */
documentsRouter.post("/", upload.single("file"), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireContributor(a);
  if (!req.file) throw badRequest("Aucun fichier reçu");
  const vis = z.enum(DOC_VISIBILITIES).default("TOUS").parse(req.body?.visibility || "TOUS");
  const folderId = req.body?.folderId ? String(req.body.folderId) : null;
  if (folderId && !(await prisma.folder.findFirst({ where: { id: folderId, projectId: a.project.id } }))) throw badRequest("Dossier introuvable.");
  const name = (String(req.body?.name || req.file.originalname).trim().slice(0, 160)) || "document";
  const file = await saveUpload({ ownerId: a.userId, originalName: req.file.originalname, data: req.file.buffer, allowedMime: DOC_MIME, maxBytes: limitFor });
  let doc = await prisma.document.findFirst({ where: { projectId: a.project.id, folderId, name, deletedAt: null }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } });
  if (doc && !canSee(a.role, doc.visibility)) throw forbidden("Un document de même nom existe dans un espace auquel vous n'avez pas accès.");
  let versionNo = 1;
  if (doc) versionNo = (doc.versions[0]?.versionNo ?? 0) + 1;
  else doc = await prisma.document.create({ data: { projectId: a.project.id, folderId, name, visibility: vis, createdById: a.userId }, include: { versions: true } });
  const version = await prisma.documentVersion.create({ data: { documentId: doc.id, versionNo, fileId: file.id, uploadedById: a.userId } });
  await prisma.document.update({ where: { id: doc.id }, data: { currentVersionId: version.id } });
  // Rétention : on ne garde que les 3 dernières versions (sauf celles liées à un livrable soumis).
  const all = await prisma.documentVersion.findMany({ where: { documentId: doc.id }, orderBy: { versionNo: "desc" }, include: { submissions: { select: { id: true } } } });
  for (const old of all.slice(KEEP_VERSIONS)) {
    if (old.submissions.length) continue;
    const fo = await prisma.fileObject.findUnique({ where: { id: old.fileId } });
    await prisma.documentVersion.delete({ where: { id: old.id } });
    if (fo) { await storage.remove(fo.key).catch(() => undefined); await prisma.fileObject.delete({ where: { id: fo.id } }).catch(() => undefined); }
  }
  const me = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } });
  await logActivity(a.project.id, a.userId, "document.uploaded", versionNo > 1 ? `${personName(me)} a déposé la version ${versionNo} de « ${name} »` : `${personName(me)} a déposé « ${name} »`, { entityType: "Document", entityId: doc.id });
  emitProject(a.project.id, "document", { id: doc.id });
  const view = (await docView(a, await loadDocs(a.project.id, { id: doc.id })))[0];
  res.status(201).json({ document: view });
});

documentsRouter.patch("/:id", validateBody(documentUpdateSchema), async (req, res) => {
  const a = await getAccess(req, pid(req)); requireContributor(a);
  const d = await prisma.document.findFirst({ where: { id: String(req.params.id), projectId: a.project.id, deletedAt: null } });
  if (!d || !canSee(a.role, d.visibility)) throw notFound("Document introuvable");
  if (d.createdById !== a.userId && !(a.role === "CHEF_PROJET" || a.role === "MENTOR")) throw forbidden("Réservé à l'auteur, au chef de projet et au mentor.");
  if (req.body.folderId && !(await prisma.folder.findFirst({ where: { id: req.body.folderId, projectId: a.project.id } }))) throw badRequest("Dossier introuvable.");
  await prisma.document.update({ where: { id: d.id }, data: { ...(req.body.name ? { name: req.body.name } : {}), ...(req.body.folderId !== undefined ? { folderId: req.body.folderId } : {}), ...(req.body.visibility ? { visibility: req.body.visibility } : {}) } });
  emitProject(a.project.id, "document", { id: d.id });
  res.json({ document: (await docView(a, await loadDocs(a.project.id, { id: d.id })))[0] });
});

documentsRouter.delete("/:id", async (req, res) => {
  const a = await getAccess(req, pid(req)); requireContributor(a);
  const d = await prisma.document.findFirst({ where: { id: String(req.params.id), projectId: a.project.id, deletedAt: null } });
  if (!d || !canSee(a.role, d.visibility)) throw notFound("Document introuvable");
  if (d.createdById !== a.userId && !(a.role === "CHEF_PROJET" || a.role === "MENTOR")) throw forbidden("Réservé à l'auteur, au chef de projet et au mentor.");
  await prisma.document.update({ where: { id: d.id }, data: { deletedAt: new Date() } });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { firstName: true, lastName: true } });
  await logActivity(a.project.id, a.userId, "document.deleted", `${personName(me)} a supprimé « ${d.name} »`, { entityType: "Document", entityId: d.id });
  emitProject(a.project.id, "document", { id: d.id });
  res.status(204).end();
});

/** Téléchargement / aperçu : droits revérifiés à chaque requête (aucune URL permanente). */
documentsRouter.get("/:id/download", async (req, res) => {
  const a = await getAccess(req, pid(req));
  const d = await prisma.document.findFirst({ where: { id: String(req.params.id), projectId: a.project.id, deletedAt: null }, include: { versions: { orderBy: { versionNo: "desc" } } } });
  if (!d || !canSee(a.role, d.visibility)) throw notFound("Document introuvable");
  const wanted = req.query.version ? Number(req.query.version) : d.versions[0]?.versionNo;
  const v = d.versions.find((x) => x.versionNo === wanted);
  if (!v) throw notFound("Version introuvable");
  const { file, data } = await readFileObject(v.fileId);
  const inline = req.query.inline === "1" && INLINE_OK.has(file.mime);
  res.setHeader("Content-Type", file.mime);
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(d.name)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
  res.send(data);
});

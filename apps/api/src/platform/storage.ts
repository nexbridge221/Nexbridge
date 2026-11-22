import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from "file-type";
import { config } from "../config";
import { prisma, sha256, badRequest, notFound } from "./core";

/** Formats autorisés pour les pièces justificatives (KYC) et plafonds de taille. */
export const KYC_ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);
export const KYC_MAX_BYTES = 10 * 1024 * 1024;

export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements StorageProvider {
  readonly name = "disque local (développement / staging uniquement)";
  private resolve(key: string): string {
    const full = path.resolve(config.storage.localDir, key);
    if (!full.startsWith(path.resolve(config.storage.localDir) + path.sep)) throw new Error("Chemin de stockage invalide");
    return full;
  }
  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data, { mode: 0o600 });
  }
  async get(key: string): Promise<Buffer> {
    return fs.readFileSync(this.resolve(key));
  }
  async remove(key: string): Promise<void> {
    fs.rmSync(this.resolve(key), { force: true });
  }
}

/** Stockage compatible S3 (AWS S3, Cloudflare R2, MinIO…). Les objets restent privés : tout accès passe par l'API (droits revérifiés). */
class S3Storage implements StorageProvider {
  readonly name = "S3 (compatible)";
  private client: S3Client;
  private bucket: string;
  constructor() {
    const c = config.storage.s3;
    if (!c.bucket || !c.region || !c.accessKeyId || !c.secretAccessKey) throw new Error("STORAGE_DRIVER=s3 : S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY sont obligatoires.");
    this.bucket = c.bucket;
    this.client = new S3Client({ region: c.region, endpoint: c.endpoint || undefined, forcePathStyle: Boolean(c.endpoint), credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } });
  }
  async put(key: string, data: Buffer): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ServerSideEncryption: config.storage.s3.endpoint ? undefined : "AES256" }));
  }
  async get(key: string): Promise<Buffer> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
export const storage: StorageProvider = config.storage.driver === "s3" ? new S3Storage() : new LocalStorage();

/**
 * Enregistre un fichier après contrôle du type MIME RÉEL (lu dans le contenu, pas l'extension),
 * de la taille et attribution d'un nom de stockage aléatoire.
 * Antivirus : non configuré → scanStatus = NON_ANALYSE (affiché comme tel aux administrateurs).
 */
export async function saveUpload(opts: { ownerId: string; originalName: string; data: Buffer; allowedMime: Set<string>; maxBytes: number | ((mime: string) => number) }) {
  if (opts.data.length === 0) throw badRequest("Fichier vide");
  const detected = await fileTypeFromBuffer(opts.data);
  const mime = detected?.mime;
  if (!mime || !opts.allowedMime.has(mime)) {
    throw badRequest("Format de fichier non autorisé", "FILE_TYPE_NOT_ALLOWED");
  }
  const limit = typeof opts.maxBytes === "number" ? opts.maxBytes : opts.maxBytes(mime);
  if (opts.data.length > limit) throw badRequest(`Fichier trop volumineux (maximum ${Math.round(limit / 1024 / 1024)} Mo pour ce type)`, "FILE_TOO_LARGE");
  const key = `${new Date().getUTCFullYear()}/${randomUUID()}.${detected!.ext}`;
  await storage.put(key, opts.data);
  const safeName = path.basename(opts.originalName).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120);
  return prisma.fileObject.create({
    data: {
      ownerId: opts.ownerId,
      key,
      originalName: safeName || "fichier",
      mime,
      size: opts.data.length,
      sha256: sha256(opts.data),
      scanStatus: "NON_ANALYSE",
    },
  });
}

export async function readFileObject(id: string) {
  const file = await prisma.fileObject.findUnique({ where: { id } });
  if (!file) throw notFound("Fichier introuvable");
  if (file.scanStatus === "INFECTE") throw badRequest("Fichier bloqué (menace détectée)", "FILE_INFECTED");
  return { file, data: await storage.get(file.key) };
}

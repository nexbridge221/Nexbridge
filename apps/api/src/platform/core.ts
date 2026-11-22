import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { pino } from "pino";
import { config } from "../config";

/* ---------------- Journalisation (aucune donnée sensible) ---------------- */
export const logger = pino({
  level: config.isTest ? "silent" : config.isProd ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.newPassword",
      "*.currentPassword",
      "*.token",
      "*.totp",
      "*.code",
      "*.ninea",
      "*.rccm",
      "email",
      "*.email",
    ],
    censor: "[masqué]",
  },
});

/* ---------------- Base de données ---------------- */
export const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });

/* ---------------- Redis (optionnel : blacklist de tokens, limites) ---------------- */
let redisClient: Redis | null = null;
let redisDown = false;
export function getRedis(): Redis | null {
  if (!config.redisUrl || redisDown) return null;
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    redisClient.on("error", (e: Error) => {
      if (!redisDown) logger.warn({ err: e.message }, "Redis indisponible — fonctionnalités dégradées (blacklist de tokens)");
      redisDown = true;
    });
    redisClient.connect().catch(() => undefined);
  }
  return redisClient;
}

/* ---------------- Cryptographie ---------------- */
export const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

/** Chiffrement AES-256-GCM : sortie `v1.iv.tag.cipher` (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.encryptionKey, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}
export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Format chiffré invalide");
  const decipher = createDecipheriv("aes-256-gcm", config.encryptionKey, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
export const hashIp = (ip: string | undefined): string | undefined =>
  ip ? sha256(`${ip}:${config.encryptionKey.toString("hex").slice(0, 16)}`).slice(0, 32) : undefined;

/* ---------------- Erreurs HTTP ---------------- */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const badRequest = (m: string, code?: string, details?: unknown) => new HttpError(400, m, code, details);
export const unauthorized = (m = "Authentification requise", code = "UNAUTHENTICATED") => new HttpError(401, m, code);
export const forbidden = (m = "Accès refusé", code = "FORBIDDEN") => new HttpError(403, m, code);
export const notFound = (m = "Ressource introuvable") => new HttpError(404, m, "NOT_FOUND");
export const conflict = (m: string, code = "CONFLICT") => new HttpError(409, m, code);

/* ---------------- Slugs ---------------- */
export function slugify(input: string): string {
  return (
    input
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "x"
  );
}

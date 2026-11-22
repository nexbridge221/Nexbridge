import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { can, type Permission } from "@nexbridge/shared";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { config } from "../config";
import { HttpError, forbidden, getRedis, hashIp, logger, prisma, unauthorized } from "./core";

export interface AuthUser {
  id: string;
  role: Role;
  emailVerified: boolean;
  jti: string;
  exp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

/* ---------------- Access tokens (JWT RS256, 15 min) ---------------- */
export function signAccessToken(user: { id: string; role: Role; emailVerifiedAt: Date | null }, jti: string): string {
  return jwt.sign({ role: user.role, ev: Boolean(user.emailVerifiedAt) }, config.jwt.privateKey, {
    algorithm: "RS256",
    subject: user.id,
    expiresIn: config.jwt.accessTtlSeconds,
    issuer: config.jwt.issuer,
    jwtid: jti,
  });
}

const BLACKLIST_PREFIX = "nb:jwt:revoked:";
export async function revokeAccessToken(jti: string, exp: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const ttl = Math.max(1, exp - Math.floor(Date.now() / 1000));
  await redis.set(BLACKLIST_PREFIX + jti, "1", "EX", ttl).catch(() => undefined);
}

/* ---------------- Authentification ---------------- */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), config.jwt.publicKey, { algorithms: ["RS256"], issuer: config.jwt.issuer }) as jwt.JwtPayload;
  } catch {
    throw unauthorized("Session expirée ou invalide", "TOKEN_INVALID");
  }
  if (!payload.sub || !payload.jti || !payload.role) throw unauthorized("Jeton invalide", "TOKEN_INVALID");

  const redis = getRedis();
  if (redis) {
    const revoked = await redis.get(BLACKLIST_PREFIX + payload.jti).catch(() => null);
    if (revoked) throw unauthorized("Session fermée", "TOKEN_REVOKED");
  }
  // Source de vérité : l'état actuel de l'utilisateur (suspension, changement de rôle immédiats).
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, status: true, emailVerifiedAt: true } });
  if (!user || user.status === "ANONYMISE") throw unauthorized("Compte introuvable", "TOKEN_INVALID");
  if (user.status === "SUSPENDU") throw forbidden("Ce compte est suspendu", "ACCOUNT_SUSPENDED");

  req.auth = { id: user.id, role: user.role, emailVerified: Boolean(user.emailVerifiedAt), jti: payload.jti, exp: payload.exp ?? 0 };
  next();
};

/** Exige une permission du rôle (matrice partagée avec l'interface). */
export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) throw unauthorized();
    if (!can(req.auth.role, permission)) throw forbidden("Votre rôle ne permet pas cette action", "ROLE_FORBIDDEN");
    next();
  };

export const requireRoles =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) throw unauthorized();
    if (!roles.includes(req.auth.role)) throw forbidden("Votre rôle ne permet pas cette action", "ROLE_FORBIDDEN");
    next();
  };

/** Exige une adresse e-mail vérifiée (décision I8 : accès complet après vérification). */
export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw unauthorized();
  if (!req.auth.emailVerified) throw forbidden("Confirmez votre adresse e-mail pour utiliser cette fonctionnalité", "EMAIL_NOT_VERIFIED");
  next();
};

/* ---------------- Validation Zod ---------------- */
export const validateBody =
  <S extends ZodTypeAny>(schema: S): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) throw zodToHttp(result.error);
    req.body = result.data as z.infer<S>;
    next();
  };

export function validateQuery<S extends ZodTypeAny>(schema: S, query: unknown): z.infer<S> {
  const result = schema.safeParse(query);
  if (!result.success) throw zodToHttp(result.error);
  return result.data;
}

function zodToHttp(error: ZodError): HttpError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return new HttpError(400, "Données invalides", "VALIDATION_ERROR", fields);
}

/* ---------------- Limitation de débit ---------------- */
export const limiter = (opts: { windowMs: number; limit: number; message?: string }) =>
  rateLimit({
    windowMs: opts.windowMs,
    limit: config.isTest ? 10_000 : opts.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: opts.message ?? "Trop de requêtes. Réessayez dans quelques instants." } });
    },
  });

/* ---------------- Journal d'audit ---------------- */
export async function audit(
  req: Request | undefined,
  action: string,
  opts: { actorId?: string | null; entityType?: string; entityId?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: opts.actorId ?? req?.auth?.id ?? null,
        action,
        entityType: opts.entityType,
        entityId: opts.entityId,
        metadata: (opts.metadata as object | undefined) ?? undefined,
        ipHash: hashIp(req?.ip),
      },
    });
  } catch (e) {
    logger.error({ err: (e as Error).message, action }, "Échec de l'écriture du journal d'audit");
  }
}

/* ---------------- Gestion d'erreurs ---------------- */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route introuvable" } });
};

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code ?? "ERROR", message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    const e = zodToHttp(err);
    res.status(400).json({ error: { code: e.code, message: e.message, details: e.details } });
    return;
  }
  const anyErr = err as { code?: string; type?: string; status?: number };
  if (anyErr?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "BAD_JSON", message: "Corps de requête invalide" } });
    return;
  }
  if (anyErr?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Requête trop volumineuse" } });
    return;
  }
  if (anyErr?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "Fichier trop volumineux" } });
    return;
  }
  logger.error({ err }, "Erreur non gérée");
  res.status(500).json({ error: { code: "INTERNAL", message: "Une erreur est survenue. Réessayez plus tard." } });
};

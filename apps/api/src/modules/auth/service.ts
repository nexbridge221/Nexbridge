import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { randomUUID } from "node:crypto";
import type { Prisma, Role, User } from "@prisma/client";
import type { LoginInput, RegisterInput } from "@nexbridge/shared";
import { config } from "../../config";
import { badRequest, conflict, decrypt, encrypt, forbidden, hashIp, prisma, randomToken, sha256, slugify, unauthorized, HttpError } from "../../platform/core";
import { mail, emails } from "../../platform/mail";
import { revokeAccessToken, signAccessToken } from "../../platform/http";

export const CONSENT_VERSION = "2026-11";
const BCRYPT_COST = 12;
const VERIFY_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 3600 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 30 * 60 * 1000;

// Hash factice : on compare toujours un mot de passe, même si le compte n'existe pas (anti-énumération par temps de réponse).
const DUMMY_HASH = bcrypt.hashSync("nexbridge-dummy-password", BCRYPT_COST);

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

/* ---------------- Sérialisation ---------------- */
export async function serializeUser(user: User) {
  let onboardingDone = true;
  if (user.role === "ETUDIANT") {
    onboardingDone = Boolean((await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { onboardingDone: true } }))?.onboardingDone);
  } else if (user.role === "MENTOR") {
    onboardingDone = Boolean((await prisma.mentorProfile.findUnique({ where: { userId: user.id }, select: { onboardingDone: true } }))?.onboardingDone);
  } else if (user.role === "REFERENT_ACADEMIQUE") {
    onboardingDone = Boolean((await prisma.referentProfile.findUnique({ where: { userId: user.id }, select: { onboardingDone: true } }))?.onboardingDone);
  } else if (user.role === "ENTREPRISE") {
    const m = await prisma.companyMember.findFirst({ where: { userId: user.id }, include: { company: { select: { sector: true, country: true } } } });
    onboardingDone = Boolean(m?.company.sector && m.company.country);
  }
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    twoFactorEnabled: user.twoFactorEnabled,
    locale: user.locale,
    onboardingDone,
    isDemo: user.isDemo,
  };
}

/* ---------------- Jetons e-mail ---------------- */
async function createEmailToken(userId: string, type: "VERIFICATION" | "RESET", ttlMs: number): Promise<string> {
  const raw = randomToken(32);
  await prisma.emailToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }); // invalide les anciens
  await prisma.emailToken.create({ data: { userId, type, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMs) } });
  return raw;
}

async function consumeEmailToken(raw: string, type: "VERIFICATION" | "RESET") {
  const token = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!token || token.type !== type || token.usedAt || token.expiresAt < new Date()) {
    throw badRequest("Lien invalide ou expiré", "TOKEN_INVALID");
  }
  const res = await prisma.emailToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
  if (res.count !== 1) throw badRequest("Lien invalide ou expiré", "TOKEN_INVALID");
  return token;
}

/* ---------------- Inscription ---------------- */
export async function register(input: RegisterInput, meta: SessionMeta): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    // Réponse identique côté API : on n'indique pas que le compte existe (anti-énumération).
    await mail.send(emails.accountExists(existing.email, existing.firstName));
    return;
  }
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role as Role,
        firstName: input.firstName,
        lastName: input.lastName,
        isDemo: false,
        consents: {
          create: [
            { type: "CGU", version: CONSENT_VERSION },
            { type: "CONFIDENTIALITE", version: CONSENT_VERSION },
          ],
        },
      },
    });
    await createRoleRecords(tx, u, input);
    await tx.auditLog.create({ data: { actorId: u.id, action: "auth.register", entityType: "User", entityId: u.id, metadata: { role: u.role }, ipHash: hashIp(meta.ip) } });
    return u;
  });
  const token = await createEmailToken(user.id, "VERIFICATION", VERIFY_TTL_MS);
  await mail.send(emails.verification(user.email, user.firstName, token));
}

async function createRoleRecords(tx: Prisma.TransactionClient, user: User, input: RegisterInput): Promise<void> {
  switch (user.role) {
    case "ETUDIANT":
      await tx.studentProfile.create({ data: { userId: user.id, slug: `${slugify(`${user.firstName}-${user.lastName}`)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x")}` } });
      break;
    case "MENTOR":
      await tx.mentorProfile.create({ data: { userId: user.id } });
      break;
    case "ENTREPRISE": {
      const company = await tx.company.create({ data: { legalName: input.organizationName! } });
      await tx.companyMember.create({ data: { userId: user.id, companyId: company.id, isOwner: true, contactRole: "AUTRE" } });
      break;
    }
    case "REFERENT_ACADEMIQUE": {
      const name = input.institutionName!.trim();
      const institution =
        (await tx.institution.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) ??
        (await tx.institution.create({ data: { name } })); // EN_ATTENTE : validé ensuite par un administrateur
      await tx.referentProfile.create({ data: { userId: user.id, institutionId: institution.id } });
      break;
    }
    default:
      throw badRequest("Rôle non autorisé à l'inscription");
  }
}

/* ---------------- Vérification e-mail ---------------- */
export async function verifyEmail(raw: string): Promise<void> {
  const token = await consumeEmailToken(raw, "VERIFICATION");
  await prisma.user.updateMany({
    where: { id: token.userId, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date(), status: "ACTIF" },
  });
}

export async function resendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.emailVerifiedAt) return;
  const token = await createEmailToken(user.id, "VERIFICATION", VERIFY_TTL_MS);
  await mail.send(emails.verification(user.email, user.firstName, token));
}

/* ---------------- Sessions ---------------- */
async function issueSession(user: User, meta: SessionMeta, familyId: string = randomUUID()) {
  const raw = randomToken(48);
  const row = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(raw),
      familyId,
      expiresAt: new Date(Date.now() + config.jwt.refreshTtlSeconds * 1000),
      userAgent: meta.userAgent?.slice(0, 250),
      ipHash: hashIp(meta.ip),
    },
  });
  const accessToken = signAccessToken(user, randomUUID());
  return { accessToken, refreshToken: raw, refreshId: row.id, expiresIn: config.jwt.accessTtlSeconds };
}

/** Connexion via un fournisseur OAuth : réservée aux comptes existants, e-mail vérifié par le fournisseur, sans 2FA (le 2FA impose la connexion par mot de passe). */
export async function loginWithProvider(email: string, meta: SessionMeta): Promise<{ ok: true; user: User; accessToken: string; refreshToken: string } | { ok: false; reason: "NO_ACCOUNT" | "SUSPENDED" | "TWO_FACTOR" }> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.status === "ANONYMISE") return { ok: false, reason: "NO_ACCOUNT" };
  if (user.status === "SUSPENDU") return { ok: false, reason: "SUSPENDED" };
  if (user.twoFactorEnabled) return { ok: false, reason: "TWO_FACTOR" };
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null, ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date(), status: user.status === "EN_ATTENTE_EMAIL" ? "ACTIF" : user.status }) } });
  const session = await issueSession(updated, meta);
  return { ok: true, user: updated, accessToken: session.accessToken, refreshToken: session.refreshToken };
}

export async function login(input: LoginInput, meta: SessionMeta) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await bcrypt.compare(input.password, hash);

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw new HttpError(429, "Trop de tentatives. Compte temporairement bloqué, réessayez dans 30 minutes.", "ACCOUNT_LOCKED");
  }
  if (!user || !user.passwordHash || !passwordOk) {
    if (user) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: failed >= MAX_FAILED_LOGINS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: failed },
      });
    }
    throw unauthorized("E-mail ou mot de passe incorrect", "INVALID_CREDENTIALS");
  }
  if (user.status === "SUSPENDU") throw forbidden("Ce compte est suspendu", "ACCOUNT_SUSPENDED");
  if (user.status === "ANONYMISE") throw unauthorized("E-mail ou mot de passe incorrect", "INVALID_CREDENTIALS");

  if (user.twoFactorEnabled) {
    if (!input.totp) throw unauthorized("Code de vérification requis", "TOTP_REQUIRED");
    const secret = decrypt(user.twoFactorSecret!);
    if (!authenticator.check(input.totp, secret)) {
      throw unauthorized("Code de vérification incorrect", "TOTP_INVALID");
    }
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const session = await issueSession(user, meta);
  return { user, ...session };
}

/** Rotation du refresh token avec détection de réutilisation : un jeton déjà utilisé révoque toute la famille. */
export async function refresh(raw: string | undefined, meta: SessionMeta) {
  if (!raw) throw unauthorized("Session expirée", "NO_REFRESH");
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
  if (!token) throw unauthorized("Session expirée", "NO_REFRESH");
  if (token.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { familyId: token.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw unauthorized("Session expirée", "REFRESH_REUSED");
  }
  if (token.expiresAt < new Date() || token.user.status === "SUSPENDU" || token.user.status === "ANONYMISE") {
    throw unauthorized("Session expirée", "NO_REFRESH");
  }
  const next = await issueSession(token.user, meta, token.familyId);
  await prisma.refreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date(), replacedById: next.refreshId } });
  return { user: token.user, ...next };
}

export async function logout(raw: string | undefined, access?: { jti: string; exp: number }): Promise<void> {
  if (raw) {
    const token = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (token) await prisma.refreshToken.updateMany({ where: { familyId: token.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  if (access) await revokeAccessToken(access.jti, access.exp);
}

/* ---------------- Mot de passe ---------------- */
export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status === "ANONYMISE" || user.status === "SUSPENDU") return; // réponse identique dans tous les cas
  const token = await createEmailToken(user.id, "RESET", RESET_TTL_MS);
  await mail.send(emails.passwordReset(user.email, user.firstName, token));
}

export async function resetPassword(raw: string, password: string): Promise<void> {
  const token = await consumeEmailToken(raw, "RESET");
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash, failedLogins: 0, lockedUntil: null, emailVerifiedAt: new Date(), status: "ACTIF" },
    }),
    // Toutes les sessions existantes sont révoquées.
    prisma.refreshToken.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) {
    throw badRequest("Mot de passe actuel incorrect", "INVALID_CREDENTIALS");
  }
  const passwordHash = await bcrypt.hash(next, BCRYPT_COST);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

/* ---------------- 2FA (TOTP) ---------------- */
export async function twoFactorSetup(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.twoFactorEnabled) throw conflict("L'authentification à deux facteurs est déjà activée", "TOTP_ALREADY_ENABLED");
  const secret = authenticator.generateSecret();
  await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: encrypt(secret) } });
  return { secret, otpauthUrl: authenticator.keyuri(user.email, "NEXBRIDGE", secret) };
}

export async function twoFactorEnable(userId: string, code: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorSecret) throw badRequest("Lancez d'abord la configuration", "TOTP_NOT_SETUP");
  if (!authenticator.check(code, decrypt(user.twoFactorSecret))) throw badRequest("Code incorrect", "TOTP_INVALID");
  await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
}

export async function twoFactorDisable(userId: string, password: string, code: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorEnabled || !user.twoFactorSecret) throw badRequest("L'authentification à deux facteurs n'est pas activée");
  if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) throw badRequest("Mot de passe incorrect", "INVALID_CREDENTIALS");
  if (!authenticator.check(code, decrypt(user.twoFactorSecret))) throw badRequest("Code incorrect", "TOTP_INVALID");
  await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
}

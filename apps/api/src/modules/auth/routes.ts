import { oauthRoutes } from "./oauth";
import { Router, type Request, type Response } from "express";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  totpCodeSchema,
  verifyEmailSchema,
} from "@nexbridge/shared";
import { z } from "zod";
import { config } from "../../config";
import { forbidden, prisma } from "../../platform/core";
import { audit, authenticate, limiter, requireVerifiedEmail, validateBody } from "../../platform/http";
import * as svc from "./service";

export const authRouter = Router();

const REFRESH_COOKIE = "nb_refresh";
const authLimiter = limiter({ windowMs: 60_000, limit: 30 });
const sensitiveLimiter = limiter({ windowMs: 15 * 60_000, limit: 10, message: "Trop de demandes. Réessayez dans quelques minutes." });

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: config.jwt.refreshTtlSeconds * 1000,
  });
}
const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, { path: "/api/auth", httpOnly: true, secure: config.cookieSecure, sameSite: "strict" });

/** Protection CSRF des routes qui s'appuient sur le cookie : en-tête personnalisé exigé (non forgeable depuis un autre site). */
function requireCsrfHeader(req: Request): void {
  if (req.get("x-requested-with") !== "nexbridge") throw forbidden("Requête refusée", "CSRF");
}
const meta = (req: Request) => ({ userAgent: req.get("user-agent") ?? undefined, ip: req.ip });

authRouter.use(authLimiter);

authRouter.get("/providers", (_req, res) => {
  res.json({ google: config.oauth.google, linkedin: config.oauth.linkedin });
});

oauthRoutes(authRouter, setRefreshCookie);

authRouter.post("/register", sensitiveLimiter, validateBody(registerSchema), async (req, res) => {
  await svc.register(req.body, meta(req));
  // Réponse identique que l'e-mail existe déjà ou non.
  res.status(202).json({ message: "Si cette adresse est valide, un e-mail de confirmation vient d'être envoyé." });
});

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const result = await svc.login(req.body, meta(req));
  setRefreshCookie(res, result.refreshToken);
  await audit(req, "auth.login", { actorId: result.user.id, entityType: "User", entityId: result.user.id });
  res.json({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: await svc.serializeUser(result.user) });
});

authRouter.post("/refresh", async (req, res) => {
  requireCsrfHeader(req);
  try {
    const result = await svc.refresh(req.cookies?.[REFRESH_COOKIE], meta(req));
    setRefreshCookie(res, result.refreshToken);
    res.json({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: await svc.serializeUser(result.user) });
  } catch (e) {
    clearRefreshCookie(res);
    throw e;
  }
});

authRouter.post("/logout", async (req, res) => {
  requireCsrfHeader(req);
  let access: { jti: string; exp: number } | undefined;
  // Le jeton d'accès (s'il est présent et valide) est mis sur liste noire.
  if (req.headers.authorization) {
    try {
      await authenticate(req, res, () => undefined);
      if (req.auth) access = { jti: req.auth.jti, exp: req.auth.exp };
    } catch {
      /* jeton déjà expiré : rien à révoquer */
    }
  }
  await svc.logout(req.cookies?.[REFRESH_COOKIE], access);
  clearRefreshCookie(res);
  if (req.auth) await audit(req, "auth.logout");
  res.status(204).end();
});

authRouter.post("/verify-email", validateBody(verifyEmailSchema), async (req, res) => {
  await svc.verifyEmail(req.body.token);
  res.json({ message: "Adresse e-mail confirmée." });
});

authRouter.post("/resend-verification", sensitiveLimiter, authenticate, async (req, res) => {
  await svc.resendVerification(req.auth!.id);
  res.status(202).json({ message: "Si votre adresse n'est pas encore confirmée, un nouvel e-mail vient d'être envoyé." });
});

authRouter.post("/forgot-password", sensitiveLimiter, validateBody(forgotPasswordSchema), async (req, res) => {
  await svc.forgotPassword(req.body.email);
  res.status(202).json({ message: "Si un compte correspond à cette adresse, un e-mail vient d'être envoyé." });
});

authRouter.post("/reset-password", sensitiveLimiter, validateBody(resetPasswordSchema), async (req, res) => {
  await svc.resetPassword(req.body.token, req.body.password);
  await audit(req, "auth.password_reset");
  res.json({ message: "Mot de passe mis à jour. Vous pouvez vous connecter." });
});

authRouter.post("/change-password", authenticate, validateBody(changePasswordSchema), async (req, res) => {
  await svc.changePassword(req.auth!.id, req.body.currentPassword, req.body.newPassword);
  clearRefreshCookie(res);
  await audit(req, "auth.password_changed");
  res.json({ message: "Mot de passe modifié. Reconnectez-vous." });
});

authRouter.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id } });
  res.json({ user: await svc.serializeUser(user) });
});

/* ---- 2FA ---- */
authRouter.post("/2fa/setup", authenticate, requireVerifiedEmail, async (req, res) => {
  res.json(await svc.twoFactorSetup(req.auth!.id));
});
authRouter.post("/2fa/enable", authenticate, validateBody(totpCodeSchema), async (req, res) => {
  await svc.twoFactorEnable(req.auth!.id, req.body.code);
  await audit(req, "auth.2fa_enabled");
  res.json({ message: "Authentification à deux facteurs activée." });
});
authRouter.post(
  "/2fa/disable",
  authenticate,
  validateBody(z.object({ password: z.string().min(1), code: z.string().regex(/^\d{6}$/) })),
  async (req, res) => {
    await svc.twoFactorDisable(req.auth!.id, req.body.password, req.body.code);
    await audit(req, "auth.2fa_disabled");
    res.json({ message: "Authentification à deux facteurs désactivée." });
  },
);

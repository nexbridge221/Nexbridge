import { createHash } from "node:crypto";
import { Router } from "express";
import { config } from "../../config";
import { logger, randomToken, safeEqual } from "../../platform/core";
import { audit } from "../../platform/http";
import * as svc from "./service";

type Provider = "google" | "linkedin";
const P = {
  google: { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", userinfo: "https://openidconnect.googleapis.com/v1/userinfo", scope: "openid email profile" },
  linkedin: { auth: "https://www.linkedin.com/oauth/v2/authorization", token: "https://www.linkedin.com/oauth/v2/accessToken", userinfo: "https://api.linkedin.com/v2/userinfo", scope: "openid profile email" },
} as const;

const COOKIE = "nb_oauth";
const redirectUri = (p: Provider) => `${config.appUrl}/api/auth/oauth/${p}/callback`;
const back = (reason: string) => `${config.appUrl}/connexion?oauth=${reason}`;
const b64url = (b: Buffer) => b.toString("base64url");

/**
 * Connexion Google / LinkedIn (OpenID Connect, code d'autorisation + PKCE + état anti-CSRF).
 * ATTENTION : non testé contre les vrais fournisseurs (aucun identifiant disponible en développement) ;
 * à valider avec de vrais identifiants avant toute mise en production.
 */
export function oauthRoutes(router: Router, setRefreshCookie: (res: import("express").Response, token: string) => void): void {
  router.get("/oauth/:provider", (req, res) => {
    const provider = req.params.provider as Provider;
    if (provider !== "google" && provider !== "linkedin") return void res.status(404).json({ error: { code: "NOT_FOUND", message: "Fournisseur inconnu" } });
    if (!config.oauth[provider]) return void res.redirect(back("non-configure"));
    const state = randomToken(24), verifier = randomToken(48);
    res.cookie(COOKIE, `${provider}.${state}.${verifier}`, { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/api/auth/oauth", maxAge: 10 * 60_000 });
    const q = new URLSearchParams({ response_type: "code", client_id: config.oauthCreds[provider].id!, redirect_uri: redirectUri(provider), scope: P[provider].scope, state, code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256" });
    res.redirect(`${P[provider].auth}?${q}`);
  });

  router.get("/oauth/:provider/callback", async (req, res) => {
    const provider = req.params.provider as Provider;
    if ((provider !== "google" && provider !== "linkedin") || !config.oauth[provider]) return void res.redirect(back("non-configure"));
    const [cp, state, verifier] = String(req.cookies?.[COOKIE] ?? "").split(".");
    res.clearCookie(COOKIE, { path: "/api/auth/oauth" });
    if (req.query.error || cp !== provider || !state || !safeEqual(String(req.query.state ?? ""), state) || typeof req.query.code !== "string") return void res.redirect(back("refuse"));
    try {
      const creds = config.oauthCreds[provider];
      const tr = await fetch(P[provider].token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: req.query.code, redirect_uri: redirectUri(provider), client_id: creds.id!, client_secret: creds.secret!, code_verifier: verifier! }) });
      if (!tr.ok) throw new Error(`token ${tr.status}`);
      const { access_token } = (await tr.json()) as { access_token: string };
      const ur = await fetch(P[provider].userinfo, { headers: { Authorization: `Bearer ${access_token}` } });
      if (!ur.ok) throw new Error(`userinfo ${ur.status}`);
      const info = (await ur.json()) as { email?: string; email_verified?: boolean | string };
      if (!info.email || !(info.email_verified === true || info.email_verified === "true")) return void res.redirect(back("email-non-verifie"));
      const r = await svc.loginWithProvider(info.email, { userAgent: req.get("user-agent") ?? undefined, ip: req.ip });
      if (!r.ok) return void res.redirect(back(r.reason === "NO_ACCOUNT" ? "pas-de-compte" : r.reason === "SUSPENDED" ? "suspendu" : "double-facteur"));
      setRefreshCookie(res, r.refreshToken);
      await audit(req, "auth.login", { actorId: r.user.id, entityType: "User", entityId: r.user.id, metadata: { via: provider } });
      res.redirect(`${config.appUrl}/app/dashboard`);
    } catch (e) {
      logger.error({ err: (e as Error).message, provider }, "Échec de la connexion OAuth");
      res.redirect(back("erreur"));
    }
  });
}

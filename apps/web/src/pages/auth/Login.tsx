import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { homePathForRole, loginSchema, type LoginInput } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "./authHelpers";

export function OAuthButtons() {
  const { t } = useTranslation("auth");
  const { data } = useQuery({ queryKey: ["oauth-providers"], queryFn: () => api<{ google: boolean; linkedin: boolean }>("/auth/providers", { auth: false }), staleTime: 10 * 60_000 });
  const reason = new URLSearchParams(window.location.search).get("oauth");
  const [msg, setMsg] = useState<string | null>(reason ? ({ "pas-de-compte": "Aucun compte NEXBRIDGE n'existe pour cette adresse : inscrivez-vous d'abord.", "double-facteur": "Ce compte utilise la double authentification : connectez-vous avec votre mot de passe.", suspendu: "Ce compte est suspendu.", "email-non-verifie": "Le fournisseur n'a pas confirmé votre adresse e-mail.", refuse: "Connexion annulée ou refusée.", "non-configure": "Connexion sociale non configurée.", erreur: "La connexion a échoué. Réessayez ou utilisez votre mot de passe." } as Record<string, string>)[reason] ?? "La connexion a échoué." : null);
  const go = async (p: "google" | "linkedin") => {
    if (!data?.[p]) { setMsg("Connexion sociale non configurée : les identifiants du fournisseur n'ont pas été fournis."); return; }
    window.location.href = `/api/auth/oauth/${p}`;
  };
  const items: { k: "google" | "linkedin"; label: string }[] = [{ k: "google", label: t("login.google") }, { k: "linkedin", label: t("login.linkedin") }];
  return (
    <div className="space-y-3">
      {items.map((i) => {
        const configured = data?.[i.k] ?? false;
        return (
          <Button key={i.k} type="button" variant="secondary" className="w-full" onClick={() => go(i.k)} aria-disabled={!configured}>
            {i.label}{!configured && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{t("login.notConfigured")}</span>}
          </Button>
        );
      })}
      {msg && <Alert tone="info">{msg}</Alert>}
    </div>
  );
}

export default function Login() {
  const { t } = useTranslation("auth");
  usePageTitle(t("login.title"));
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuth((s) => s.login);
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const from = (location.state as { from?: string } | null)?.from;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const user = await login({ ...values, totp: values.totp || undefined });
      navigate(from && from.startsWith("/app") ? from : homePathForRole(user.role), { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === "TOTP_REQUIRED") { setNeedTotp(true); return; }
      setError(errorMessage(e));
    }
  });

  return (
    <>
      <h1 className="text-3xl">{t("login.title")}</h1>
      <p className="mt-2 text-muted">{t("login.subtitle")}</p>
      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label={t("login.email")} error={errors.email?.message}>{(p) => <Input {...p} type="email" autoComplete="username" autoFocus {...register("email")} />}</Field>
        <Field label={t("login.password")} error={errors.password?.message}>{(p) => <Input {...p} type="password" autoComplete="current-password" {...register("password")} />}</Field>
        {needTotp && <Field label={t("login.totp")} help={t("login.totpHelp")} error={errors.totp?.message}>{(p) => <Input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus {...register("totp")} />}</Field>}
        <div className="flex justify-end"><Link to="/mot-de-passe-oublie" className="text-sm font-semibold text-nexus hover:underline">{t("login.forgot")}</Link></div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{t("login.submit")}</Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-sm text-muted"><span className="h-px flex-1 bg-line" />{t("login.or")}<span className="h-px flex-1 bg-line" /></div>
      <OAuthButtons />
      <p className="mt-8 text-sm text-muted">{t("login.noAccount")} <Link to="/inscription" className="font-semibold text-nexus hover:underline">{t("login.join")}</Link></p>
    </>
  );
}

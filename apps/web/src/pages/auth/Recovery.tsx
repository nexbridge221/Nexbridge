import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { forgotPasswordSchema, passwordSchema } from "@nexbridge/shared";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import { errorMessage, fieldErrors } from "./authHelpers";

export function ForgotPassword() {
  const { t } = useTranslation("auth");
  usePageTitle(t("forgot.title"));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(forgotPasswordSchema) });
  const onSubmit = handleSubmit(async (v) => { setError(null); try { await api("/auth/forgot-password", { method: "POST", body: v, auth: false }); setSent(true); } catch (e) { setError(errorMessage(e)); } });
  return (
    <>
      <h1 className="text-3xl">{t("forgot.title")}</h1>
      <p className="mt-2 text-muted">{t("forgot.subtitle")}</p>
      {sent ? <Alert tone="success" className="mt-6">{t("forgot.sent")}</Alert> : (
        <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label={t("login.email")} error={errors.email?.message}>{(p) => <Input {...p} type="email" autoComplete="email" autoFocus {...register("email")} />}</Field>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{t("forgot.submit")}</Button>
        </form>
      )}
      <p className="mt-8 text-sm"><Link to="/connexion" className="font-semibold text-nexus hover:underline">← {t("forgot.back")}</Link></p>
    </>
  );
}

export function ResetPassword() {
  const { t } = useTranslation("auth");
  const [sp] = useSearchParams();
  const token = sp.get("token") ?? "";
  const invitation = sp.get("invitation") === "1";
  usePageTitle(t(invitation ? "reset.invitationTitle" : "reset.title"));
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<{ password: string }>({ resolver: zodResolver(z.object({ password: passwordSchema })) });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try { await api("/auth/reset-password", { method: "POST", body: { token, password: v.password }, auth: false }); setDone(true); }
    catch (e) { const f = fieldErrors(e); if (f?.password) setFieldError("password", { message: f.password }); else setError(errorMessage(e)); }
  });
  if (!token) return <Alert tone="error">{t("reset.missing")}</Alert>;
  if (done) return <><Alert tone="success">{t("reset.done")}</Alert><Button asChild size="lg" className="mt-6 w-full"><Link to="/connexion">{t("login.submit")}</Link></Button></>;
  return (
    <>
      <h1 className="text-3xl">{t(invitation ? "reset.invitationTitle" : "reset.title")}</h1>
      <p className="mt-2 text-muted">{t("reset.subtitle")}</p>
      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label={t("register.password")} help={t("register.passwordHelp")} error={errors.password?.message}>{(p) => <Input {...p} type="password" autoComplete="new-password" autoFocus {...register("password")} />}</Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{t("reset.submit")}</Button>
      </form>
    </>
  );
}

export function VerifyEmail() {
  const { t } = useTranslation("auth");
  usePageTitle(t("verify.title"));
  const [sp] = useSearchParams();
  const token = sp.get("token");
  const [state, setState] = useState<"loading" | "ok" | "ko">(token ? "loading" : "ko");
  const ran = useRef(false);
  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // évite le double appel du mode strict (le jeton est à usage unique)
    api("/auth/verify-email", { method: "POST", body: { token }, auth: false }).then(() => setState("ok"), () => setState("ko"));
  }, [token]);
  return (
    <div className="text-center">
      <h1 className="text-3xl">{t("verify.title")}</h1>
      <div className="mt-8" aria-live="polite">
        {state === "loading" && <p className="flex items-center justify-center gap-3 text-muted"><Spinner />{t("verify.loading")}</p>}
        {state === "ok" && <><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" aria-hidden /><p className="mt-4 text-lg">{t("verify.ok")}</p></>}
        {state === "ko" && <><XCircle className="mx-auto h-14 w-14 text-red-600" aria-hidden /><p className="mt-4 text-lg">{t("verify.ko")}</p></>}
      </div>
      {state !== "loading" && <Button asChild size="lg" className="mt-8"><Link to="/connexion">{t("verify.login")}</Link></Button>}
    </div>
  );
}

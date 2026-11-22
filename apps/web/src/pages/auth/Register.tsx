import { zodResolver } from "@hookform/resolvers/zod";
import { Briefcase, GraduationCap, Landmark, MailCheck, UserRound, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { registerSchema, SELF_REGISTRATION_ROLES, type RegisterInput, type SelfRegistrationRole } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { errorMessage, fieldErrors } from "./authHelpers";
import { OAuthButtons } from "./Login";

const roleIcon: Record<SelfRegistrationRole, { Icon: LucideIcon; cls: string }> = {
  ENTREPRISE: { Icon: Briefcase, cls: "bg-blue-50 text-nexus" },
  ETUDIANT: { Icon: GraduationCap, cls: "bg-violet-50 text-impact-text" },
  MENTOR: { Icon: UserRound, cls: "bg-amber-50 text-amber-text" },
  REFERENT_ACADEMIQUE: { Icon: Landmark, cls: "bg-teal-50 text-collab-text" },
};

export default function Register() {
  const { t } = useTranslation("auth");
  usePageTitle(t("register.title"));
  const [sp] = useSearchParams();
  const initial = SELF_REGISTRATION_ROLES.find((r) => r === sp.get("role"));
  const [role, setRole] = useState<SelfRegistrationRole | null>(initial ?? null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema), values: role ? ({ role } as RegisterInput) : undefined, resetOptions: { keepDirtyValues: true } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try { await api("/auth/register", { method: "POST", body: { ...values, role }, auth: false }); setSent(true); }
    catch (e) {
      const f = fieldErrors(e);
      if (f) { for (const [k, m] of Object.entries(f)) setFieldError(k as keyof RegisterInput, { message: m }); } else setError(errorMessage(e));
    }
  });

  if (sent) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-nexus"><MailCheck className="h-8 w-8" aria-hidden /></span>
        <h1 className="text-3xl">{t("register.sentTitle")}</h1>
        <p className="mt-3 text-muted">{t("register.sentBody")}</p>
        <Button asChild size="lg" className="mt-8"><Link to="/connexion">{t("register.sentCta")}</Link></Button>
      </div>
    );
  }

  if (!role) {
    return (
      <>
        <h1 className="text-3xl">{t("register.title")}</h1>
        <p className="mt-2 text-muted">{t("register.subtitle")}</p>
        <fieldset className="mt-8 grid gap-3"><legend className="mb-2 text-sm font-semibold text-night">{t("register.chooseRole")}</legend>
          {SELF_REGISTRATION_ROLES.map((r) => {
            const { Icon, cls } = roleIcon[r];
            return (
              <button key={r} type="button" onClick={() => setRole(r)} className="flex items-center gap-4 rounded-lg border border-line bg-white p-4 text-left shadow-sm transition hover:border-nexus hover:shadow-card">
                <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-md", cls)}><Icon className="h-6 w-6" aria-hidden /></span>
                <span><span className="block font-bold text-night">{t(`register.roles.${r}.title`)}</span><span className="block text-sm text-muted">{t(`register.roles.${r}.desc`)}</span></span>
              </button>
            );
          })}
        </fieldset>
        <p className="mt-8 text-sm text-muted">{t("register.haveAccount")} <Link to="/connexion" className="font-semibold text-nexus hover:underline">{t("register.login")}</Link></p>
      </>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setRole(null)} className="mb-4 text-sm font-semibold text-nexus hover:underline">← {t("register.changeRole")}</button>
      <h1 className="text-3xl">{t(`register.roles.${role}.title`)}</h1>
      <p className="mt-2 text-muted">{t("register.details")}</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("register.firstName")} error={errors.firstName?.message}>{(p) => <Input {...p} autoComplete="given-name" {...register("firstName")} />}</Field>
          <Field label={t("register.lastName")} error={errors.lastName?.message}>{(p) => <Input {...p} autoComplete="family-name" {...register("lastName")} />}</Field>
        </div>
        {role === "ENTREPRISE" && <Field label={t("register.organization")} error={errors.organizationName?.message}>{(p) => <Input {...p} autoComplete="organization" {...register("organizationName")} />}</Field>}
        {role === "REFERENT_ACADEMIQUE" && <Field label={t("register.institution")} error={errors.institutionName?.message}>{(p) => <Input {...p} {...register("institutionName")} />}</Field>}
        <Field label={t("register.email")} error={errors.email?.message}>{(p) => <Input {...p} type="email" autoComplete="email" {...register("email")} />}</Field>
        <Field label={t("register.password")} help={t("register.passwordHelp")} error={errors.password?.message}>{(p) => <Input {...p} type="password" autoComplete="new-password" {...register("password")} />}</Field>
        <Checkbox label={<>J'accepte les <Link to="/cgu" target="_blank" className="font-semibold text-nexus underline">conditions générales d'utilisation</Link> et la <Link to="/confidentialite" target="_blank" className="font-semibold text-nexus underline">politique de confidentialité</Link>.</>} error={errors.acceptTerms?.message} {...register("acceptTerms")} />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{t("register.submit")}</Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-sm text-muted"><span className="h-px flex-1 bg-line" />{t("login.or")}<span className="h-px flex-1 bg-line" /></div>
      <OAuthButtons />
      <p className="mt-8 text-sm text-muted">{t("register.haveAccount")} <Link to="/connexion" className="font-semibold text-nexus hover:underline">{t("register.login")}</Link></p>
    </>
  );
}

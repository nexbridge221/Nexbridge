import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { updateAccountSchema } from "@nexbridge/shared";
import { CompanySection, MentorSection, ReferentSection, StudentAbout, StudentAcademic, StudentAvailability, StudentSkills } from "@/components/profile/Sections";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card, CardBody, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useAuth } from "@/stores/auth";

export default function Profile() {
  const { t } = useTranslation("app");
  usePageTitle(t("profile.title"));
  const user = useAuth((s) => s.user)!;
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const reload = useAuth((s) => s.reload);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(updateAccountSchema) });
  useEffect(() => { if (me) reset({ firstName: me.user.firstName, lastName: me.user.lastName, phone: me.phone ?? "" }); }, [me, reset]);
  const onSubmit = handleSubmit(async (v) => {
    try { await api("/me/account", { method: "PATCH", body: v }); await qc.invalidateQueries({ queryKey: ["me"] }); await reload(); toast.success(t("profile.saved")); }
    catch (e) { if (e instanceof ApiError && e.fields) for (const [k, m] of Object.entries(e.fields)) setError(k as never, { message: m }); else toast.error("Enregistrement impossible."); }
  });
  const after = async () => { await reload(); };
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl">{t("profile.title")}</h1>
      {isLoading && <Skeleton className="h-64" />}
      {me && (<>
        <Card><CardBody>
          <h2 className="text-xl">{t("profile.account")}</h2>
          <form onSubmit={onSubmit} noValidate className="mt-5 space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label={t("profile.firstName")} error={errors.firstName?.message}>{(p) => <Input {...p} autoComplete="given-name" {...register("firstName")} />}</Field>
              <Field label={t("profile.lastName")} error={errors.lastName?.message}>{(p) => <Input {...p} autoComplete="family-name" {...register("lastName")} />}</Field>
              <Field label={t("profile.email")} help="L'adresse e-mail ne peut pas être modifiée pour l'instant.">{(p) => <Input {...p} value={me.user.email} disabled readOnly />}</Field>
              <Field label={t("profile.phone")} optional error={errors.phone?.message}>{(p) => <Input {...p} type="tel" autoComplete="tel" {...register("phone")} />}</Field>
            </div>
            <Button type="submit" loading={isSubmitting}>Enregistrer</Button>
          </form>
        </CardBody></Card>
        {user.role === "ETUDIANT" && (<><StudentAcademic onSaved={after} /><StudentAvailability onSaved={after} /><StudentSkills onSaved={after} /><StudentAbout onSaved={after} /></>)}
        {user.role === "MENTOR" && <MentorSection onSaved={after} />}
        {user.role === "REFERENT_ACADEMIQUE" && <ReferentSection onSaved={after} />}
        {user.role === "ENTREPRISE" && <CompanySection onSaved={after} />}
      </>)}
    </div>
  );
}

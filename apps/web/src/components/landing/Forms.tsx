import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { contactMessageSchema, newsletterSchema, type ContactMessageInput, type NewsletterInput } from "@nexbridge/shared";
import { Section } from "./Section";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api";

/** Reporte les erreurs de validation du serveur sur les champs correspondants. */
function applyServerErrors(e: unknown, setError: (name: never, o: { message: string }) => void): string | null {
  if (e instanceof ApiError) {
    if (e.fields) { for (const [k, m] of Object.entries(e.fields)) setError(k as never, { message: m }); return null; }
    return e.message;
  }
  return "Une erreur est survenue. Réessayez.";
}

export function ContactForm() {
  const { t } = useTranslation("landing");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, reset, formState: { errors, isSubmitting } } = useForm<ContactMessageInput>({ resolver: zodResolver(contactMessageSchema), defaultValues: { website: "" } });
  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try { await api("/public/contact", { method: "POST", body: values, auth: false }); setDone(true); reset(); }
    catch (e) { setError(applyServerErrors(e, setFieldError)); }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5 rounded-xl border border-line bg-white p-5 shadow-card sm:p-8">
      {done && <Alert tone="success">{t("contact.success")}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t("contact.name")} error={errors.name?.message}>{(p) => <Input {...p} autoComplete="name" {...register("name")} />}</Field>
        <Field label={t("contact.email")} error={errors.email?.message}>{(p) => <Input {...p} type="email" autoComplete="email" {...register("email")} />}</Field>
      </div>
      <Field label={t("contact.organization")} error={errors.organization?.message} optional={false}>{(p) => <Input {...p} autoComplete="organization" {...register("organization")} />}</Field>
      <Field label={t("contact.subject")} error={errors.subject?.message}>{(p) => <Input {...p} {...register("subject")} />}</Field>
      <Field label={t("contact.message")} error={errors.message?.message}>{(p) => <Textarea {...p} rows={5} {...register("message")} />}</Field>
      {/* Champ piège anti-spam : invisible pour les humains */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden><label>Ne pas remplir<input tabIndex={-1} autoComplete="off" {...register("website")} /></label></div>
      <Checkbox label={t("contact.consent")} error={errors.consent?.message} {...register("consent")} />
      <div><Button type="submit" size="lg" loading={isSubmitting}><Send className="h-4 w-4" aria-hidden />{t("contact.submit")}</Button></div>
    </form>
  );
}

export function ContactSection() {
  const { t } = useTranslation("landing");
  return (
    <Section id="contact" tone="light" eyebrow={t("contact.eyebrow")} title={t("contact.title")} subtitle={t("contact.subtitle")}>
      <div className="mx-auto max-w-3xl"><ContactForm /></div>
    </Section>
  );
}

export function NewsletterForm({ dark = false }: { dark?: boolean }) {
  const { t } = useTranslation("landing");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, reset, formState: { errors, isSubmitting } } = useForm<NewsletterInput>({ resolver: zodResolver(newsletterSchema), defaultValues: { website: "" } });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try { await api("/public/newsletter", { method: "POST", body: v, auth: false }); setDone(true); reset(); }
    catch (e) { setError(applyServerErrors(e, setFieldError)); }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {done && <Alert tone="success">{t("newsletter.success")}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Field label={t("newsletter.email")} error={errors.email?.message}>{(p) => <Input {...p} type="email" autoComplete="email" placeholder="vous@exemple.com" {...register("email")} />}</Field>
        </div>
        <Button type="submit" size="lg" className="sm:mt-[26px]" loading={isSubmitting}>{t("newsletter.submit")}</Button>
      </div>
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden><label>Ne pas remplir<input tabIndex={-1} autoComplete="off" {...register("website")} /></label></div>
      <Checkbox label={t("newsletter.consent")} error={errors.consent?.message} className={dark ? "" : ""} {...register("consent")} />
    </form>
  );
}

export function NewsletterSection() {
  const { t } = useTranslation("landing");
  return (
    <Section id="newsletter" tone="white">
      <div className="mx-auto grid grid-cols-1 max-w-5xl items-center gap-8 rounded-xl border border-line bg-cloud p-6 sm:p-10 lg:grid-cols-2">
        <div><h2 className="text-2xl sm:text-3xl">{t("newsletter.title")}</h2><p className="mt-3 text-muted">{t("newsletter.subtitle")}</p></div>
        <NewsletterForm />
      </div>
    </Section>
  );
}

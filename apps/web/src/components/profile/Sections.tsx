import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  AVAILABILITY_LABELS, AVAILABILITIES, COMPANY_SIZE_LABELS, COMPANY_SIZES, SKILL_CATEGORY_LABELS, SKILL_LEVEL_LABELS, SKILL_LEVELS, STUDY_LEVEL_LABELS, STUDY_LEVELS,
  companyProfileSchema, mentorProfileSchema, referentProfileSchema, studentProfileSchema, type SkillLevel,
} from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card, CardBody } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useMe, type Me } from "@/lib/me";
import { useSectors, useSkills } from "@/lib/queries";

/** Chaque section est autonome (formulaire + enregistrement) : réutilisée dans l'onboarding ET dans la page profil. */
export interface SectionProps { onSaved?: () => void; submitLabel?: string; embedded?: boolean }

function SectionCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (<Card><CardBody><h2 className="text-xl">{title}</h2>{description && <p className="mt-1 text-sm text-muted">{description}</p>}<div className="mt-5">{children}</div></CardBody></Card>);
}

function useSave(path: string, method: "PUT" | "PATCH" = "PUT", onSaved?: () => void) {
  const qc = useQueryClient();
  return async (body: unknown, setError?: (k: string, m: string) => void): Promise<boolean> => {
    try {
      await api(path, { method, body });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Modifications enregistrées.");
      onSaved?.();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.fields && setError) for (const [k, m] of Object.entries(e.fields)) setError(k, m);
      else toast.error(e instanceof ApiError ? e.message : "Enregistrement impossible.");
      return false;
    }
  };
}

/* ======================= ÉTUDIANT ======================= */
export function StudentAcademic({ onSaved, submitLabel = "Enregistrer", embedded }: SectionProps) {
  const { t } = useTranslation("app");
  const { data: me } = useMe();
  const save = useSave("/me/student-profile", "PUT", onSaved);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(studentProfileSchema.pick({ institutionName: true, programName: true, studyLevel: true })) });
  useEffect(() => { if (me?.profile) reset({ institutionName: me.profile.institution?.name ?? "", programName: me.profile.program?.name ?? "", studyLevel: (me.profile.studyLevel as never) ?? undefined }); }, [me, reset]);
  const body = (
    <form onSubmit={handleSubmit((v) => save(v, (k, m) => setError(k as never, { message: m })))} noValidate className="space-y-5">
      <Field label={t("profile.student.institution")} error={errors.institutionName?.message}>{(p) => <Input {...p} list="nb-institutions" autoComplete="off" {...register("institutionName")} />}</Field>
      <InstitutionList />
      <Field label={t("profile.student.program")} error={errors.programName?.message}>{(p) => <Input {...p} {...register("programName")} />}</Field>
      <Field label={t("profile.student.level")} error={errors.studyLevel?.message}>{(p) => <Select {...p} {...register("studyLevel")}><option value="">Sélectionner…</option>{STUDY_LEVELS.map((l) => <option key={l} value={l}>{STUDY_LEVEL_LABELS[l]}</option>)}</Select>}</Field>
      <Button type="submit" loading={isSubmitting}>{submitLabel}</Button>
    </form>
  );
  return embedded ? body : <SectionCard title={t("profile.student.section")}>{body}</SectionCard>;
}

function InstitutionList() {
  const [opts, setOpts] = useState<string[]>([]);
  useEffect(() => { api<{ institutions: { name: string }[] }>("/public/institutions", { auth: false }).then((r) => setOpts(r.institutions.map((i) => i.name)), () => undefined); }, []);
  return <datalist id="nb-institutions">{opts.map((o) => <option key={o} value={o} />)}</datalist>;
}

export function StudentAvailability({ onSaved, submitLabel = "Enregistrer", embedded }: SectionProps) {
  const { t } = useTranslation("app");
  const { data: me } = useMe();
  const save = useSave("/me/student-profile", "PUT", onSaved);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(studentProfileSchema.pick({ availability: true, availabilityNotes: true, city: true, country: true })) });
  useEffect(() => { if (me?.profile) reset({ availability: (me.profile.availability as never) ?? undefined, availabilityNotes: me.profile.availabilityNotes ?? "", city: me.profile.city ?? "", country: me.profile.country ?? "" }); }, [me, reset]);
  const body = (
    <form onSubmit={handleSubmit((v) => save(v, (k, m) => setError(k as never, { message: m })))} noValidate className="space-y-5">
      <Field label={t("profile.student.availability")} error={errors.availability?.message}>{(p) => <Select {...p} {...register("availability")}><option value="">Sélectionner…</option>{AVAILABILITIES.map((a) => <option key={a} value={a}>{AVAILABILITY_LABELS[a]}</option>)}</Select>}</Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t("profile.student.city")} error={errors.city?.message}>{(p) => <Input {...p} autoComplete="address-level2" {...register("city")} />}</Field>
        <Field label={t("profile.student.country")} error={errors.country?.message}>{(p) => <Input {...p} autoComplete="country-name" {...register("country")} />}</Field>
      </div>
      <Field label={t("profile.student.availabilityNotes")} optional error={errors.availabilityNotes?.message}>{(p) => <Textarea {...p} rows={3} {...register("availabilityNotes")} />}</Field>
      <Button type="submit" loading={isSubmitting}>{submitLabel}</Button>
    </form>
  );
  return embedded ? body : <SectionCard title="Disponibilités et localisation">{body}</SectionCard>;
}

export function StudentSkills({ onSaved, submitLabel = "Enregistrer", embedded }: SectionProps) {
  const { t } = useTranslation("app");
  const { data: me } = useMe();
  const { data: catalog } = useSkills();
  const [rows, setRows] = useState<{ skillId: string; level: SkillLevel; locked: boolean }[]>([]);
  const [pick, setPick] = useState("");
  const [saving, setSaving] = useState(false);
  const save = useSave("/me/student-skills", "PUT", onSaved);
  useEffect(() => { if (me?.profile?.skills) setRows(me.profile.skills.map((s) => ({ skillId: s.skillId, level: s.level as SkillLevel, locked: s.source !== "DECLARE" }))); }, [me]);
  const byId = new Map(catalog?.skills.map((s) => [s.id, s]) ?? []);
  const available = (catalog?.skills ?? []).filter((s) => !rows.some((r) => r.skillId === s.id));
  const grouped = (Object.keys(SKILL_CATEGORY_LABELS) as (keyof typeof SKILL_CATEGORY_LABELS)[]).map((cat) => ({ cat, items: available.filter((s) => s.category === cat) })).filter((g) => g.items.length);
  const body = (
    <div className="space-y-5">
      <p className="text-sm text-muted">{t("profile.student.skillsHelp")}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1"><Field label={t("profile.student.addSkill")}>{(p) => <Select {...p} value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choisir une compétence…</option>{grouped.map((g) => <optgroup key={g.cat} label={SKILL_CATEGORY_LABELS[g.cat]}>{g.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}</Select>}</Field></div>
        <Button type="button" variant="secondary" className="sm:mt-[26px]" disabled={!pick} onClick={() => { setRows((r) => [...r, { skillId: pick, level: "PRATICIEN", locked: false }]); setPick(""); }}><Plus className="h-4 w-4" aria-hidden />Ajouter</Button>
      </div>
      {rows.length === 0 ? <Alert tone="info">Aucune compétence ajoutée pour l'instant.</Alert> : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {rows.map((r, i) => (
            <li key={r.skillId} className="flex flex-wrap items-center gap-3 p-3">
              <span className="min-w-0 flex-1 font-semibold text-night">{byId.get(r.skillId)?.name ?? "Compétence"}{r.locked && <span className="ml-2 text-xs font-medium text-collab-text">validée par un projet</span>}</span>
              <label className="sr-only" htmlFor={`lvl-${r.skillId}`}>Niveau</label>
              <Select id={`lvl-${r.skillId}`} className="w-44" value={r.level} disabled={r.locked} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, level: e.target.value as SkillLevel } : y)))}>{SKILL_LEVELS.map((l) => <option key={l} value={l}>{SKILL_LEVEL_LABELS[l]}</option>)}</Select>
              <Button type="button" variant="ghost" size="sm" disabled={r.locked} aria-label={`Retirer ${byId.get(r.skillId)?.name ?? ""}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" aria-hidden /></Button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" loading={saving} onClick={async () => { setSaving(true); await save({ skills: rows.map(({ skillId, level }) => ({ skillId, level })) }); setSaving(false); }}>{submitLabel}</Button>
    </div>
  );
  return embedded ? body : <SectionCard title={t("profile.student.skills")}>{body}</SectionCard>;
}

export function StudentAbout({ onSaved, submitLabel = "Enregistrer", embedded }: SectionProps) {
  const { t } = useTranslation("app");
  const { data: me } = useMe();
  const { data: sectors } = useSectors();
  const save = useSave("/me/student-profile", "PUT", onSaved);
  const { register, handleSubmit, reset, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(studentProfileSchema.pick({ bio: true, sectorPreferences: true, isPortfolioPublic: true })) });
  useEffect(() => { if (me?.profile) reset({ bio: me.profile.bio ?? "", sectorPreferences: me.profile.sectorPreferences ?? [], isPortfolioPublic: Boolean(me.profile.isPortfolioPublic) }); }, [me, reset]);
  const selected = watch("sectorPreferences") ?? [];
  const body = (
    <form onSubmit={handleSubmit((v) => save(v, (k, m) => setError(k as never, { message: m })))} noValidate className="space-y-5">
      <Field label={t("profile.student.bio")} optional error={errors.bio?.message}>{(p) => <Textarea {...p} rows={5} maxLength={1500} {...register("bio")} />}</Field>
      <fieldset><legend className="mb-2 text-sm font-semibold text-night">{t("profile.student.sectors")}</legend>
        <div className="flex flex-wrap gap-2">{sectors?.sectors.map((s) => { const on = selected.includes(s.name); return (<button key={s.id} type="button" aria-pressed={on} onClick={() => setValue("sectorPreferences", on ? selected.filter((x) => x !== s.name) : [...selected, s.name].slice(0, 10), { shouldDirty: true })} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${on ? "border-nexus bg-nexus text-white" : "border-slate-300 bg-white text-ink hover:border-nexus"}`}>{s.name}</button>); })}</div>
      </fieldset>
      <div className="rounded-md border border-line bg-cloud p-4"><Checkbox label={<><strong>{t("profile.student.portfolioPublic")}</strong><span className="block text-[13px] text-muted">{t("profile.student.portfolioPublicHelp")}</span></>} {...register("isPortfolioPublic")} /></div>
      <Button type="submit" loading={isSubmitting}>{submitLabel}</Button>
    </form>
  );
  return embedded ? body : <SectionCard title="Présentation et confidentialité">{body}</SectionCard>;
}

/* ======================= MENTOR ======================= */
export function MentorSection({ onSaved, submitLabel = "Enregistrer", embedded, part = "all" }: SectionProps & { part?: "pro" | "expertise" | "availability" | "all" }) {
  const { t } = useTranslation("app");
  const { data: me } = useMe();
  const { data: sectors } = useSectors();
  const save = useSave("/me/mentor-profile", "PUT", onSaved);
  const { register, handleSubmit, reset, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(mentorProfileSchema) });
  useEffect(() => { if (me?.profile) reset({ bio: me.profile.bio ?? "", yearsExperience: me.profile.yearsExperience ?? undefined, indicativeHourlyRate: me.profile.indicativeHourlyRate ?? undefined, maxConcurrentProjects: me.profile.maxConcurrentProjects ?? 3, expertiseSectors: me.profile.expertiseSectors ?? [], certifications: me.profile.certifications ?? [] }); }, [me, reset]);
  const selected = watch("expertiseSectors") ?? [];
  const certs = watch("certifications") ?? [];
  const show = (p: string) => part === "all" || part === p;
  const body = (
    <form onSubmit={handleSubmit((v) => save(v, (k, m) => setError(k as never, { message: m })))} noValidate className="space-y-5">
      {show("pro") && (<>
        <Field label={t("profile.mentor.bio")} error={errors.bio?.message}>{(p) => <Textarea {...p} rows={5} maxLength={1500} {...register("bio")} />}</Field>
        <Field label={t("profile.mentor.years")} error={errors.yearsExperience?.message}>{(p) => <Input {...p} type="number" min={0} max={60} {...register("yearsExperience", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })} />}</Field>
        <Field label={t("profile.mentor.certifications")} optional help="Séparées par des virgules.">{(p) => <Input {...p} value={certs.join(", ")} onChange={(e) => setValue("certifications", e.target.value.split(",").map((x) => x.trim()).filter(Boolean), { shouldDirty: true })} />}</Field>
      </>)}
      {show("expertise") && (
        <fieldset><legend className="mb-2 text-sm font-semibold text-night">{t("profile.mentor.sectors")}</legend>
          <div className="flex flex-wrap gap-2">{sectors?.sectors.map((s) => { const on = selected.includes(s.name); return (<button key={s.id} type="button" aria-pressed={on} onClick={() => setValue("expertiseSectors", on ? selected.filter((x) => x !== s.name) : [...selected, s.name].slice(0, 15), { shouldDirty: true })} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${on ? "border-nexus bg-nexus text-white" : "border-slate-300 bg-white text-ink hover:border-nexus"}`}>{s.name}</button>); })}</div>
          {errors.expertiseSectors?.message && <p role="alert" className="mt-1 text-[13px] text-red-700">{errors.expertiseSectors.message}</p>}
        </fieldset>
      )}
      {show("availability") && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t("profile.mentor.max")} error={errors.maxConcurrentProjects?.message}>{(p) => <Input {...p} type="number" min={1} max={10} {...register("maxConcurrentProjects", { valueAsNumber: true })} />}</Field>
          <Field label={t("profile.mentor.rate")} optional error={errors.indicativeHourlyRate?.message}>{(p) => <Input {...p} type="number" min={0} {...register("indicativeHourlyRate", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })} />}</Field>
        </div>
      )}
      <Button type="submit" loading={isSubmitting}>{submitLabel}</Button>
    </form>
  );
  return embedded ? body : <SectionCard title={t("profile.mentor.section")}>{body}</SectionCard>;
}

/* ======================= RÉFÉRENT ======================= */
export function ReferentSection({ onSaved, submitLabel = "Enregistrer", embedded }: SectionProps) {
  const { t } = useTranslation("app");
  const { data: me } = useMe();
  const save = useSave("/me/referent-profile", "PUT", onSaved);
  const { register, handleSubmit, reset, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(referentProfileSchema) });
  useEffect(() => { if (me?.profile) reset({ jobTitle: me.profile.jobTitle ?? "", programs: me.profile.programs ?? [] }); }, [me, reset]);
  const programs = watch("programs") ?? [];
  const inst = (me?.profile as { institution?: { name: string; status: string } } | null)?.institution;
  const body = (
    <form onSubmit={handleSubmit((v) => save(v, (k, m) => setError(k as never, { message: m })))} noValidate className="space-y-5">
      {inst && <Alert tone={inst.status === "VALIDE" ? "success" : "warning"} title={`${t("profile.referent.institution")} : ${inst.name}`}>{inst.status === "VALIDE" ? t("profile.referent.validated") : t("profile.referent.pending")}</Alert>}
      <Field label={t("profile.referent.jobTitle")} optional error={errors.jobTitle?.message}>{(p) => <Input {...p} {...register("jobTitle")} />}</Field>
      <Field label={t("profile.referent.programs")} optional help="Séparées par des virgules.">{(p) => <Input {...p} value={programs.join(", ")} onChange={(e) => setValue("programs", e.target.value.split(",").map((x) => x.trim()).filter(Boolean), { shouldDirty: true })} />}</Field>
      <Button type="submit" loading={isSubmitting}>{submitLabel}</Button>
    </form>
  );
  return embedded ? body : <SectionCard title={t("profile.referent.section")}>{body}</SectionCard>;
}

/* ======================= ENTREPRISE ======================= */
export function CompanySection({ onSaved, submitLabel = "Enregistrer", embedded }: SectionProps) {
  const { t } = useTranslation("app");
  const { data: me } = useMe();
  const save = useSave("/company", "PUT", onSaved);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(companyProfileSchema) });
  useEffect(() => { const c = me?.company; if (c) reset({ legalName: c.legalName, sector: c.sector ?? "", size: (c.size as never) ?? undefined, country: c.country ?? "", city: c.city ?? "", description: c.description ?? "", website: c.website ?? "" }); }, [me, reset]);
  const { data: sectors } = useSectors();
  const body = (
    <form onSubmit={handleSubmit((v) => save(v, (k, m) => setError(k as never, { message: m })))} noValidate className="space-y-5">
      <Field label={t("profile.company.legalName")} error={errors.legalName?.message}>{(p) => <Input {...p} {...register("legalName")} />}</Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t("profile.company.sector")} error={errors.sector?.message}>{(p) => <Select {...p} {...register("sector")}><option value="">Sélectionner…</option>{sectors?.sectors.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</Select>}</Field>
        <Field label={t("profile.company.size")} error={errors.size?.message}>{(p) => <Select {...p} {...register("size")}><option value="">Sélectionner…</option>{COMPANY_SIZES.map((s) => <option key={s} value={s}>{COMPANY_SIZE_LABELS[s]}</option>)}</Select>}</Field>
        <Field label={t("profile.company.country")} error={errors.country?.message}>{(p) => <Input {...p} autoComplete="country-name" {...register("country")} />}</Field>
        <Field label={t("profile.company.city")} error={errors.city?.message}>{(p) => <Input {...p} autoComplete="address-level2" {...register("city")} />}</Field>
      </div>
      <Field label={t("profile.company.description")} optional error={errors.description?.message}>{(p) => <Textarea {...p} rows={4} maxLength={2000} {...register("description")} />}</Field>
      <Field label={t("profile.company.website")} optional error={errors.website?.message}>{(p) => <Input {...p} type="url" placeholder="https://" {...register("website")} />}</Field>
      <Button type="submit" loading={isSubmitting}>{submitLabel}</Button>
    </form>
  );
  return embedded ? body : <SectionCard title={t("profile.company.section")}>{body}</SectionCard>;
}

export type { Me };

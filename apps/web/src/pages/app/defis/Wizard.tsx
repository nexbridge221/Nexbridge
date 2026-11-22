import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { DELIVERABLE_FORMAT_LABELS, DELIVERABLE_FORMATS, SKILL_CATEGORY_LABELS, SKILL_LEVEL_LABELS, SKILL_LEVELS, STUDY_LEVEL_LABELS, STUDY_LEVELS, type DeliverableFormat, type SkillLevel } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card, CardBody, Progress, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import type { ChallengeDraft } from "@/lib/challenges";
import { cn } from "@/lib/cn";
import { useSectors, useSkills } from "@/lib/queries";

interface F {
  title: string; context: string; sectorId: string; keywords: string; objectives: string; deliverables: { title: string; format: DeliverableFormat; description: string }[];
  teamSize: number; skills: { skillId: string; minLevel: SkillLevel; weight: number }[]; minStudyLevel: string; desiredStart: string; durationWeeks: string; milestones: { title: string; targetWeek: string }[];
  budgetAmount: string; budgetCurrency: "XOF" | "EUR"; budgetPublic: boolean; paymentTerms: string;
}
const fromDraft = (c: ChallengeDraft): F => ({
  title: c.title, context: c.context, sectorId: c.sectorId ?? "", keywords: c.keywords.join(", "), objectives: c.objectives ?? "",
  deliverables: c.deliverables.map((d) => ({ title: d.title, format: d.format, description: d.description ?? "" })), teamSize: c.teamSize,
  skills: c.skills.map((s) => ({ skillId: s.skillId, minLevel: s.minLevel, weight: s.weight })), minStudyLevel: c.minStudyLevel ?? "", desiredStart: c.desiredStart ? c.desiredStart.slice(0, 10) : "",
  durationWeeks: c.durationWeeks ? String(c.durationWeeks) : "", milestones: c.milestones.map((m) => ({ title: m.title, targetWeek: String(m.targetWeek) })),
  budgetAmount: c.budgetAmount != null ? String(c.budgetAmount) : "", budgetCurrency: c.budgetCurrency, budgetPublic: c.budgetPublic, paymentTerms: c.paymentTerms ?? "",
});
const num = (s: string) => { const n = Number(s.replace(",", ".")); return s.trim() !== "" && Number.isFinite(n) ? n : null; };
const toPayload = (f: F) => ({
  title: f.title, context: f.context, sectorId: f.sectorId || null, keywords: f.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 10), objectives: f.objectives,
  deliverables: f.deliverables.filter((d) => d.title.trim()).map((d) => ({ title: d.title.trim(), format: d.format, description: d.description.trim() || undefined })),
  teamSize: f.teamSize, skills: f.skills.map((s) => ({ ...s })), minStudyLevel: f.minStudyLevel || null, desiredStart: f.desiredStart || null,
  durationWeeks: num(f.durationWeeks) != null ? Math.round(num(f.durationWeeks)!) : null,
  milestones: f.milestones.filter((m) => m.title.trim() && num(m.targetWeek) != null).map((m) => ({ title: m.title.trim(), targetWeek: Math.round(num(m.targetWeek)!) })),
  budgetAmount: num(f.budgetAmount), budgetCurrency: f.budgetCurrency, budgetPublic: false, paymentTerms: f.paymentTerms.trim() || null,
});
const STEPS = ["Contexte", "Périmètre", "Équipe", "Calendrier", "Budget et envoi"];
const FIELD_STEP: Record<string, number> = { title: 0, context: 0, sectorId: 0, objectives: 1, deliverables: 1, teamSize: 2, skills: 2, durationWeeks: 3, milestones: 3, budgetAmount: 4, budgetCurrency: 4 };

export default function ChallengeWizard() {
  const { id = "" } = useParams();
  usePageTitle("Assistant NexBrief");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["challenge-draft", id], queryFn: () => api<{ challenge: ChallengeDraft }>(`/challenges/${id}`), staleTime: Infinity, retry: false });
  const sectors = useSectors(), skills = useSkills();
  const [f, setF] = useState<F | null>(null);
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const status = data?.challenge.status;
  const loaded = useRef(false);
  useEffect(() => { if (data && !loaded.current) { setF(fromDraft(data.challenge)); loaded.current = true; } }, [data]);

  const set = useCallback((patch: Partial<F>) => { setF((p) => (p ? { ...p, ...patch } : p)); setDirty(true); }, []);
  const save = useCallback(async (): Promise<boolean> => {
    if (!f) return false;
    setSaving(true); setSaveError(null);
    try { await api(`/challenges/${id}`, { method: "PUT", body: toPayload(f) }); setSavedAt(new Date()); setDirty(false); void qc.invalidateQueries({ queryKey: ["my-challenges"] }); return true; }
    catch (e) { const msg = e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] : e.message) : "Enregistrement impossible"; setSaveError(msg ?? "Enregistrement impossible"); return false; }
    finally { setSaving(false); }
  }, [f, id, qc]);
  useEffect(() => { if (!dirty) return; const t = setTimeout(() => void save(), 1200); return () => clearTimeout(t); }, [f, dirty, save]);

  const refreshCheck = useCallback(async () => { try { const r = await api<{ ready: boolean; errors: Record<string, string> }>(`/challenges/${id}/check`); setProblems(r.errors); } catch { /* ignoré */ } }, [id]);
  useEffect(() => { if (step === 4 && !dirty && !saving) void refreshCheck(); }, [step, dirty, saving, refreshCheck]);

  const go = async (n: number) => { if (dirty) await save(); setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const submit = async () => {
    setSubmitting(true);
    try {
      if (dirty && !(await save())) return;
      await api(`/challenges/${id}/submit`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["my-challenges"] });
      toast.success("Défi soumis : il sera relu par l'équipe NEXBRIDGE avant publication.");
      navigate(`/app/defis/${id}`, { replace: true });
    } catch (e) { if (e instanceof ApiError && e.fields) setProblems(e.fields); else toast.error(e instanceof ApiError ? e.message : "Soumission impossible."); }
    finally { setSubmitting(false); }
  };
  const withdraw = async () => { await api(`/challenges/${id}/withdraw`, { method: "POST" }); loaded.current = false; await qc.invalidateQueries({ queryKey: ["challenge-draft", id] }); window.location.reload(); };

  if (error instanceof ApiError && error.status === 404) return <Alert tone="error">Ce défi est introuvable.</Alert>;
  if (isLoading || !f || !data) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64" /></div>;
  if (status && status !== "BROUILLON" && status !== "EN_REVISION") return <Navigate to={`/app/defis/${id}`} replace />;

  const skillById = new Map(skills.data?.skills.map((s) => [s.id, s]) ?? []);
  const availableSkills = (skills.data?.skills ?? []).filter((s) => !f.skills.some((x) => x.skillId === s.id));
  const grouped = (Object.keys(SKILL_CATEGORY_LABELS) as (keyof typeof SKILL_CATEGORY_LABELS)[]).map((cat) => ({ cat, items: availableSkills.filter((s) => s.category === cat) })).filter((g) => g.items.length);
  const problemKeys = Object.keys(problems);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl sm:text-3xl">Assistant NexBrief</h1><p className="text-sm text-muted" aria-live="polite">{saving ? "Enregistrement…" : saveError ? <span className="text-red-700">{saveError}</span> : savedAt ? `Brouillon enregistré à ${savedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Enregistrement automatique activé"}</p></div>
        <Button variant="secondary" onClick={async () => { await save(); navigate("/app/defis"); }}><Save className="h-4 w-4" aria-hidden />Enregistrer et quitter</Button>
      </div>
      {status === "EN_REVISION" && <Alert tone="info" title="Défi en cours de révision" action={<Button size="sm" variant="secondary" onClick={withdraw}>Retirer de la validation</Button>}>Vos modifications sont possibles tant que le défi n'est pas publié.</Alert>}
      {data.challenge.rejectionReason && status === "BROUILLON" && <Alert tone="error" title="Modifications demandées par l'équipe NEXBRIDGE">{data.challenge.rejectionReason}</Alert>}

      <nav aria-label="Étapes de l'assistant"><ol className="grid grid-cols-5 gap-1.5">{STEPS.map((s, i) => (
        <li key={s}><button onClick={() => void go(i)} aria-current={step === i ? "step" : undefined} className={cn("flex w-full flex-col items-center gap-1 rounded-md px-1 py-2 text-center text-[11px] font-semibold sm:text-xs", step === i ? "bg-nexus text-white" : i < step ? "bg-blue-50 text-nexus" : "bg-white text-muted ring-1 ring-line")}><span className="text-base font-extrabold">{i < step ? <Check className="mx-auto h-4 w-4" aria-hidden /> : i + 1}</span>{s}</button></li>))}</ol></nav>
      <Progress value={((step + 1) / STEPS.length) * 100} label="Progression de l'assistant" />

      <Card><CardBody className="space-y-5">
        {step === 0 && (<>
          <h2 className="text-xl">1. Contexte</h2>
          <Field label="Titre du défi" help="Formulez le résultat attendu (10 caractères minimum).">{(p) => <Input {...p} maxLength={150} value={f.title} onChange={(e) => set({ title: e.target.value })} />}</Field>
          <Field label="Description de la problématique" help={`${f.context.length} / 5000 caractères — 80 minimum. Décrivez le contexte, le problème, ses conséquences et ce qui a déjà été tenté.`}>{(p) => <Textarea {...p} rows={9} maxLength={5000} value={f.context} onChange={(e) => set({ context: e.target.value })} />}</Field>
          <Field label="Secteur d'activité">{(p) => <Select {...p} value={f.sectorId} onChange={(e) => set({ sectorId: e.target.value })}><option value="">Sélectionner…</option>{sectors.data?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
          <Field label="Mots-clés" optional help="Séparés par des virgules (10 maximum). Ils améliorent la recherche.">{(p) => <Input {...p} value={f.keywords} onChange={(e) => set({ keywords: e.target.value })} />}</Field>
        </>)}
        {step === 1 && (<>
          <h2 className="text-xl">2. Périmètre</h2>
          <Field label="Objectifs" help="Quels résultats concrets attendez-vous ? Comment saurez-vous que le défi est réussi ?">{(p) => <Textarea {...p} rows={6} maxLength={3000} value={f.objectives} onChange={(e) => set({ objectives: e.target.value })} />}</Field>
          <fieldset><legend className="mb-2 text-sm font-semibold text-night">Livrables attendus</legend>
            <ul className="space-y-3">{f.deliverables.map((d, i) => (
              <li key={i} className="grid grid-cols-1 gap-3 rounded-md border border-line p-3 sm:grid-cols-[1fr_170px_auto]">
                <Field label="Livrable">{(p) => <Input {...p} value={d.title} onChange={(e) => set({ deliverables: f.deliverables.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />}</Field>
                <Field label="Format">{(p) => <Select {...p} value={d.format} onChange={(e) => set({ deliverables: f.deliverables.map((x, j) => (j === i ? { ...x, format: e.target.value as DeliverableFormat } : x)) })}>{DELIVERABLE_FORMATS.map((k) => <option key={k} value={k}>{DELIVERABLE_FORMAT_LABELS[k]}</option>)}</Select>}</Field>
                <Button type="button" variant="ghost" className="self-end" aria-label={`Supprimer le livrable ${i + 1}`} onClick={() => set({ deliverables: f.deliverables.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" aria-hidden /></Button>
              </li>))}</ul>
            {f.deliverables.length < 10 && <Button type="button" variant="secondary" className="mt-3" onClick={() => set({ deliverables: [...f.deliverables, { title: "", format: "RAPPORT", description: "" }] })}><Plus className="h-4 w-4" aria-hidden />Ajouter un livrable</Button>}
          </fieldset>
        </>)}
        {step === 2 && (<>
          <h2 className="text-xl">3. Équipe</h2>
          <Field label="Nombre d'étudiants souhaité" help="Entre 2 et 8.">{(p) => <Input {...p} type="number" min={2} max={8} value={f.teamSize} onChange={(e) => set({ teamSize: Math.max(2, Math.min(8, Number(e.target.value) || 2)) })} />}</Field>
          <Field label="Niveau d'études minimal" optional>{(p) => <Select {...p} value={f.minStudyLevel} onChange={(e) => set({ minStudyLevel: e.target.value })}><option value="">Aucun minimum</option>{STUDY_LEVELS.filter((l) => l !== "AUTRE").map((l) => <option key={l} value={l}>{STUDY_LEVEL_LABELS[l]}</option>)}</Select>}</Field>
          <fieldset><legend className="mb-1 text-sm font-semibold text-night">Compétences requises</legend><p className="mb-3 text-[13px] text-muted">Elles pilotent le matching. Le « poids » indique l'importance (1 à 5).</p>
            <div className="mb-3"><label htmlFor="add-skill" className="sr-only">Ajouter une compétence</label><Select id="add-skill" value="" onChange={(e) => e.target.value && set({ skills: [...f.skills, { skillId: e.target.value, minLevel: "PRATICIEN" as SkillLevel, weight: 1 }].slice(0, 12) })}><option value="">+ Ajouter une compétence…</option>{grouped.map((g) => <optgroup key={g.cat} label={SKILL_CATEGORY_LABELS[g.cat]}>{g.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}</Select></div>
            {f.skills.length === 0 ? <p className="rounded-md bg-cloud p-3 text-sm text-muted">Aucune compétence sélectionnée.</p> : (
              <ul className="divide-y divide-line rounded-md border border-line">{f.skills.map((s, i) => (
                <li key={s.skillId} className="flex flex-wrap items-center gap-3 p-3">
                  <span className="min-w-0 flex-1 font-semibold text-night">{skillById.get(s.skillId)?.name ?? "Compétence"}</span>
                  <label className="sr-only" htmlFor={`lv-${i}`}>Niveau minimal</label><Select id={`lv-${i}`} className="w-40" value={s.minLevel} onChange={(e) => set({ skills: f.skills.map((x, j) => (j === i ? { ...x, minLevel: e.target.value as SkillLevel } : x)) })}>{SKILL_LEVELS.map((l) => <option key={l} value={l}>{SKILL_LEVEL_LABELS[l]}</option>)}</Select>
                  <label className="sr-only" htmlFor={`w-${i}`}>Poids</label><Select id={`w-${i}`} className="w-24" value={s.weight} onChange={(e) => set({ skills: f.skills.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })}>{[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>Poids {w}</option>)}</Select>
                  <Button type="button" variant="ghost" size="sm" aria-label="Retirer" onClick={() => set({ skills: f.skills.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                </li>))}</ul>)}
          </fieldset>
        </>)}
        {step === 3 && (<>
          <h2 className="text-xl">4. Calendrier</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Date de début souhaitée" optional>{(p) => <Input {...p} type="date" value={f.desiredStart} onChange={(e) => set({ desiredStart: e.target.value })} />}</Field>
            <Field label="Durée du projet (semaines)" help="1 à 52.">{(p) => <Input {...p} type="number" min={1} max={52} value={f.durationWeeks} onChange={(e) => set({ durationWeeks: e.target.value })} />}</Field>
          </div>
          <fieldset><legend className="mb-2 text-sm font-semibold text-night">Jalons intermédiaires</legend>
            <ul className="space-y-3">{f.milestones.map((m, i) => (
              <li key={i} className="grid grid-cols-1 gap-3 rounded-md border border-line p-3 sm:grid-cols-[1fr_150px_auto]">
                <Field label="Jalon">{(p) => <Input {...p} value={m.title} onChange={(e) => set({ milestones: f.milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />}</Field>
                <Field label="Semaine cible">{(p) => <Input {...p} type="number" min={1} max={52} value={m.targetWeek} onChange={(e) => set({ milestones: f.milestones.map((x, j) => (j === i ? { ...x, targetWeek: e.target.value } : x)) })} />}</Field>
                <Button type="button" variant="ghost" className="self-end" aria-label={`Supprimer le jalon ${i + 1}`} onClick={() => set({ milestones: f.milestones.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" aria-hidden /></Button>
              </li>))}</ul>
            {f.milestones.length < 12 && <Button type="button" variant="secondary" className="mt-3" onClick={() => set({ milestones: [...f.milestones, { title: "", targetWeek: "" }] })}><Plus className="h-4 w-4" aria-hidden />Ajouter un jalon</Button>}
          </fieldset>
        </>)}
        {step === 4 && (<>
          <h2 className="text-xl">5. Budget et envoi</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_140px]">
            <Field label="Budget alloué" help="Montant total du projet, commission NEXBRIDGE comprise.">{(p) => <Input {...p} inputMode="decimal" value={f.budgetAmount} onChange={(e) => set({ budgetAmount: e.target.value })} />}</Field>
            <Field label="Devise">{(p) => <Select {...p} value={f.budgetCurrency} onChange={(e) => set({ budgetCurrency: e.target.value as "XOF" | "EUR" })}><option value="XOF">FCFA</option><option value="EUR">EUR</option></Select>}</Field>
          </div>
          <p className="text-sm text-muted">Le budget reste confidentiel : il n'est jamais affiché sur le site public ni aux étudiants.</p>
          <Field label="Modalités de paiement souhaitées" optional help="Les paiements en ligne seront activés avec la phase 5 : aucune transaction n'est effectuée à ce stade.">{(p) => <Textarea {...p} rows={3} maxLength={500} value={f.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} />}</Field>
          <div className="rounded-md border border-line bg-cloud p-4" aria-live="polite">
            <h3 className="text-base">Vérification avant envoi</h3>
            {problemKeys.length === 0 ? <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-800"><Check className="h-4 w-4" aria-hidden />Votre brief est complet et peut être soumis.</p> : (
              <ul className="mt-2 space-y-1.5 text-sm">{problemKeys.map((k) => <li key={k} className="flex items-start gap-2 text-red-800"><span aria-hidden>•</span><span>{problems[k]} {FIELD_STEP[k] !== undefined && FIELD_STEP[k] !== 4 && <button className="font-semibold underline" onClick={() => void go(FIELD_STEP[k]!)}>Corriger (étape {FIELD_STEP[k]! + 1})</button>}</span></li>)}</ul>)}
          </div>
          <p className="text-sm text-muted">Après l'envoi, l'équipe NEXBRIDGE relit votre brief (clarté, budget, compétences, livrables) avant publication. Vous êtes prévenu à chaque changement de statut.</p>
          <Button size="lg" onClick={submit} loading={submitting} disabled={status === "EN_REVISION"}>{status === "EN_REVISION" ? "Déjà soumis" : "Soumettre pour validation"}</Button>
        </>)}
      </CardBody></Card>
      <div className="flex justify-between"><Button variant="secondary" disabled={step === 0} onClick={() => void go(step - 1)}>← Précédent</Button>{step < 4 ? <Button onClick={() => void go(step + 1)}>Suivant →</Button> : <Button asChild variant="ghost"><Link to="/app/defis">Mes défis</Link></Button>}</div>
    </div>
  );
}

import { useMutation, useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, Download, GraduationCap, Lock } from "lucide-react";
import { useState } from "react";
import { EVALUATION_TYPE_LABELS, SKILL_LEVEL_LABELS, SKILL_LEVELS, type SkillLevel } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, Progress, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { Stars } from "@/components/charts";
import { api, ApiError, getAccessToken } from "@/lib/api";
import { useSkills } from "@/lib/queries";
import { useSpace } from "./ProjectLayout";
import { useSpaceInvalidate } from "./TaskPanel";

interface Todo { type: keyof typeof EVALUATION_TYPE_LABELS; label: string; subjectUserId: string | null; subjectName: string | null; done: boolean; optional: boolean; rating?: number }
interface State { status: string; canClose: boolean; deliverablesPending: number; progress: { required: number; done: number; missing: { type: string; subjectName: string | null }[] }; todo: Todo[]; academic: { student: string; status: string; credits: number | null }[]; attestationId: string | null }
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");

export default function Evaluation() {
  const { id, overview } = useSpace();
  const refresh = useSpaceInvalidate(id);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["space", id, "evaluation"], queryFn: () => api<State>(`/projects/${id}/evaluations/todo`) });
  const skills = useSkills();
  const [confirm, setConfirm] = useState(false);
  const [form, setForm] = useState<Todo | null>(null);
  const [rating, setRating] = useState(0); const [comment, setComment] = useState(""); const [adopted, setAdopted] = useState(false);
  const [sk, setSk] = useState<{ skillId: string; demonstrated: SkillLevel }[]>([]);
  const close = useMutation({ mutationFn: () => api(`/projects/${id}/close`, { method: "POST" }), onSuccess: async () => { setConfirm(false); toast.success("Projet clôturé : la phase d'évaluation est ouverte."); await Promise.all([refetch(), refresh()]); }, onError: (e) => toast.error(err(e)) });
  const submit = useMutation({
    mutationFn: () => api<{ finalized: boolean }>(`/projects/${id}/evaluations`, { method: "POST", body: { type: form!.type, subjectUserId: form!.subjectUserId, rating, comment: comment || undefined, skills: sk, adopted: form!.type === "ENTREPRISE_PROJET" ? adopted : undefined } }),
    onSuccess: async (r) => { setForm(null); toast.success(r.finalized ? "Évaluation enregistrée : le projet est terminé, badges et attestations sont attribués !" : "Évaluation enregistrée."); await Promise.all([refetch(), refresh()]); }, onError: (e) => toast.error(err(e)),
  });
  const open = (t: Todo) => { setForm(t); setRating(0); setComment(""); setAdopted(false); setSk([]); };
  const download = async () => { const res = await fetch(`/api/attestations/${data!.attestationId}/download`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: "include" }); if (!res.ok) return toast.error("Téléchargement impossible."); const u = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = u; a.download = "attestation-nexbridge.pdf"; a.click(); URL.revokeObjectURL(u); };
  if (isLoading || !data) return <Skeleton className="h-64" />;
  const needsSkills = form && (form.type === "ENTREPRISE_ETUDIANT" || form.type === "MENTOR_ETUDIANT");
  return (
    <div className="space-y-5">
      {data.status === "EN_COURS" && (
        <Card><CardBody>
          <h2 className="flex items-center gap-2 text-lg"><Lock className="h-5 w-5 text-nexus" aria-hidden />Clôture du projet</h2>
          <p className="mt-2 text-sm text-muted">La clôture ouvre la phase d'évaluation (entreprise, mentor, étudiants). Quand tout est déposé et, le cas échéant, validé par l'établissement, le projet est terminé : badges, compétences et attestations sont attribués.</p>
          {data.deliverablesPending > 0 && <Alert tone="warning" className="mt-3">{data.deliverablesPending} livrable(s) officiel(s) doivent d'abord être validés.</Alert>}
          {data.canClose ? <Button className="mt-4" onClick={() => setConfirm(true)}>Clôturer le projet</Button> : data.deliverablesPending === 0 && <p className="mt-3 text-sm text-muted">Seuls l'entreprise et le mentor peuvent clôturer le projet.</p>}
        </CardBody></Card>)}
      {data.status !== "EN_COURS" && (
        <Card><CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg">Avancement des évaluations</h2><Badge tone={data.status === "TERMINE" ? "green" : "amber"}>{data.status === "TERMINE" ? "Projet terminé" : "Évaluation en cours"}</Badge></div>
          <div className="mt-3 flex items-center gap-3"><Progress value={data.progress.required ? (data.progress.done / data.progress.required) * 100 : 0} label="Évaluations obligatoires déposées" className="max-w-sm" /><span className="text-sm font-bold text-night">{data.progress.done}/{data.progress.required}</span></div>
          {data.status === "EN_EVALUATION" && data.progress.missing.length > 0 && <p className="mt-2 text-xs text-muted">En attente : {data.progress.missing.map((m) => `${EVALUATION_TYPE_LABELS[m.type as keyof typeof EVALUATION_TYPE_LABELS]}${m.subjectName ? ` (${m.subjectName})` : ""}`).join(" · ")}</p>}
          {data.academic.length > 0 && <div className="mt-4"><h3 className="flex items-center gap-2 text-sm font-bold"><GraduationCap className="h-4 w-4 text-collab-text" aria-hidden />Validation académique</h3><ul className="mt-1.5 space-y-1 text-sm">{data.academic.map((a) => <li key={a.student} className="flex justify-between gap-3"><span>{a.student}</span><Badge tone={a.status === "VALIDE" ? "green" : a.status === "REFUSE" ? "red" : "amber"}>{a.status === "VALIDE" ? `Validé · ${a.credits ?? 0} crédit(s)` : a.status === "REFUSE" ? "Refusé" : "En attente du référent"}</Badge></li>)}</ul></div>}
          {data.status === "TERMINE" && <Alert tone="success" className="mt-4" title="Projet terminé">Les badges, compétences et indices de fiabilité ont été mis à jour. {overview.access.role === "ETUDIANT" || overview.access.role === "CHEF_PROJET" ? "Retrouvez-les dans NexBadge." : ""}{data.attestationId && <Button size="sm" className="ml-3" onClick={download}><Download className="h-4 w-4" aria-hidden />Mon attestation (PDF)</Button>}</Alert>}
        </CardBody></Card>)}
      {data.todo.length > 0 && data.status === "EN_EVALUATION" && (
        <section aria-labelledby="todo-h"><h2 id="todo-h" className="mb-2 text-lg">Vos évaluations</h2>
          <ul className="space-y-2.5">{data.todo.map((t) => (
            <li key={`${t.type}${t.subjectUserId}`}><Card><CardBody className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1"><p className="font-semibold text-night">{t.label}{t.subjectName ? ` — ${t.subjectName}` : ""}</p>{t.optional && <p className="text-xs text-muted">Facultative</p>}</div>
              {t.done ? <span className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden />Déposée <Stars value={t.rating ?? 0} label="Note" /></span> : <Button size="sm" onClick={() => open(t)}>Évaluer</Button>}
            </CardBody></Card></li>))}</ul></section>)}
      {data.todo.length === 0 && data.status === "EN_EVALUATION" && <Alert tone="info">Aucune évaluation à déposer pour votre rôle sur ce projet.</Alert>}
      <Modal open={confirm} onOpenChange={setConfirm} title="Clôturer ce projet ?" description="Tous les livrables sont validés. La phase d'évaluation s'ouvre pour toute l'équipe ; cette action est définitive."><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setConfirm(false)}>Annuler</Button><Button loading={close.isPending} onClick={() => close.mutate()}><Award className="h-4 w-4" aria-hidden />Clôturer</Button></div></Modal>
      <Modal open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)} title={form ? `${form.label}${form.subjectName ? ` — ${form.subjectName}` : ""}` : ""}>
        {form && <form className="max-h-[70dvh] space-y-4 overflow-y-auto pr-1" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
          <div><p className="mb-1 text-sm font-semibold text-night">Note globale</p><Stars value={rating} onChange={setRating} label="Note globale" /></div>
          <Field label="Commentaire" optional help={form.type === "PAIR" ? "Votre avis restera anonyme pour la personne évaluée." : undefined}>{(p) => <Textarea {...p} rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
          {form.type === "ENTREPRISE_PROJET" && <Checkbox label="Un livrable a été adopté par notre organisation (badge « Innovateur » pour l'équipe)" checked={adopted} onChange={(e) => setAdopted(e.target.checked)} />}
          {needsSkills && (<fieldset><legend className="mb-1 text-sm font-semibold text-night">Compétences démontrées <span className="font-normal text-muted">(elles alimentent les badges)</span></legend>
            <ul className="space-y-2">{sk.map((s, i) => <li key={i} className="flex gap-2"><Select aria-label="Compétence" value={s.skillId} onChange={(e) => setSk(sk.map((x, j) => (j === i ? { ...x, skillId: e.target.value } : x)))}>{skills.data?.skills.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Select><Select aria-label="Niveau démontré" className="!w-40" value={s.demonstrated} onChange={(e) => setSk(sk.map((x, j) => (j === i ? { ...x, demonstrated: e.target.value as SkillLevel } : x)))}>{SKILL_LEVELS.map((l) => <option key={l} value={l}>{SKILL_LEVEL_LABELS[l]}</option>)}</Select><Button type="button" variant="ghost" size="sm" onClick={() => setSk(sk.filter((_, j) => j !== i))} aria-label="Retirer">✕</Button></li>)}</ul>
            {sk.length < 12 && skills.data && <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setSk([...sk, { skillId: skills.data!.skills.find((k) => !sk.some((x) => x.skillId === k.id))!.id, demonstrated: "PRATICIEN" }])}>+ Ajouter une compétence</Button>}</fieldset>)}
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setForm(null)}>Annuler</Button><Button type="submit" loading={submit.isPending} disabled={rating === 0}>Enregistrer l'évaluation</Button></div>
        </form>}
      </Modal>
    </div>
  );
}

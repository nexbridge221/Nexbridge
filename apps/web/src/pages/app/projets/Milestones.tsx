import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Flag, Plus } from "lucide-react";
import { useState } from "react";
import { MILESTONE_STATUS_LABELS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, EmptyState, Progress, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { fmtDay } from "@/lib/dates";
import { isLeadOrMentor } from "@/lib/space";
import { useSpace } from "./ProjectLayout";
import { useSpaceInvalidate } from "./TaskPanel";

interface M { id: string; title: string; description: string | null; targetDate: string; owner: string | null; status: keyof typeof MILESTONE_STATUS_LABELS; validated: boolean; mentorValidatedAt: string | null; companyValidatedAt: string | null; tasks: { total: number; done: number }; deliverables: { id: string; name: string; status: string }[] }
const tone = { A_VENIR: "neutral", EN_COURS: "blue", PRET: "violet", VALIDE: "green", MANQUE: "red" } as const;
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");

export default function Milestones() {
  const { id, overview } = useSpace();
  const refresh = useSpaceInvalidate(id);
  const { data, isLoading } = useQuery({ queryKey: ["space", id, "milestones"], queryFn: () => api<{ milestones: M[]; rule: string }>(`/projects/${id}/milestones`) });
  const manage = isLeadOrMentor(overview.access.role, overview.access.readOnly);
  const role = overview.access.role; const ro = overview.access.readOnly;
  const hasMentor = overview.members.some((m) => m.role === "MENTOR");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", targetDate: "", ownerId: "" });
  const create = useMutation({ mutationFn: () => api(`/projects/${id}/milestones`, { method: "POST", body: { title: f.title, description: f.description || undefined, targetDate: f.targetDate, ownerId: f.ownerId || null } }), onSuccess: async () => { setOpen(false); setF({ title: "", description: "", targetDate: "", ownerId: "" }); await refresh(); toast.success("Jalon créé."); }, onError: (e) => toast.error(err(e)) });
  const validate = useMutation({ mutationFn: (mid: string) => api<{ complete: boolean }>(`/projects/${id}/milestones/${mid}/validate`, { method: "POST" }), onSuccess: async (r) => { toast.success(r.complete ? "Jalon validé." : "Votre validation est enregistrée ; l'autre partie doit encore valider."); await refresh(); }, onError: (e) => toast.error(err(e)) });
  const rule = data?.rule;
  const mentorNeeded = rule !== "ENTREPRISE" && hasMentor, companyNeeded = rule !== "MENTOR" || !hasMentor;
  const canValidate = (m: M) => !ro && !m.validated && ((role === "MENTOR" && mentorNeeded && !m.mentorValidatedAt) || (role === "CONTACT_ENTREPRISE" && companyNeeded && !m.companyValidatedAt));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">Règle de validation : <strong className="text-night">{!hasMentor && rule !== "ENTREPRISE" ? "entreprise (aucun mentor affecté)" : rule === "LES_DEUX" ? "mentor et entreprise" : rule === "MENTOR" ? "mentor" : "entreprise"}</strong></p>{manage && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Nouveau jalon</Button>}</div>
      {isLoading && <Skeleton className="h-40" />}
      {data?.milestones.length === 0 && <EmptyState icon={<Flag className="h-6 w-6" />} title="Aucun jalon">Les jalons découpent le projet en grandes étapes. {manage ? "Créez le premier." : "Le chef de projet ou le mentor peut en créer."}</EmptyState>}
      <ul className="space-y-3">{data?.milestones.map((m) => (
        <li key={m.id}><Card><CardBody>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg">{m.validated && <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />}{m.title}</h2><p className="text-sm text-muted">Échéance {fmtDay(m.targetDate)}{m.owner ? ` · responsable ${m.owner}` : ""}</p></div><Badge tone={tone[m.status]}>{MILESTONE_STATUS_LABELS[m.status]}</Badge></div>
          {m.description && <p className="mt-2 text-sm text-ink">{m.description}</p>}
          <div className="mt-3 flex items-center gap-3"><Progress value={m.tasks.total ? (m.tasks.done / m.tasks.total) * 100 : 0} label={`Avancement du jalon ${m.title}`} className="max-w-xs" /><span className="text-xs text-muted">{m.tasks.done}/{m.tasks.total} tâches</span></div>
          {m.deliverables.length > 0 && <p className="mt-2 text-sm text-muted">Livrable(s) : {m.deliverables.map((d) => d.name).join(", ")}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">{mentorNeeded && <span>Mentor : {m.mentorValidatedAt ? "✔ validé" : "en attente"}</span>}{companyNeeded && <span>Entreprise : {m.companyValidatedAt ? "✔ validé" : "en attente"}</span>}{canValidate(m) && <Button size="sm" onClick={() => validate.mutate(m.id)} loading={validate.isPending && validate.variables === m.id}>Valider ce jalon</Button>}</div>
        </CardBody></Card></li>))}</ul>
      <Modal open={open} onOpenChange={setOpen} title="Nouveau jalon">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label="Titre">{(p) => <Input {...p} autoFocus maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
          <Field label="Description" optional>{(p) => <Textarea {...p} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Date cible">{(p) => <Input {...p} type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} />}</Field><Field label="Responsable" optional>{(p) => <Select {...p} value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}><option value="">—</option>{overview.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</Select>}</Field></div>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={create.isPending} disabled={!f.title.trim() || !f.targetDate}>Créer</Button></div>
        </form>
      </Modal>
      <Alert tone="info">Un jalon passe automatiquement en « Prêt pour validation » quand toutes ses tâches sont terminées, et en « Manqué » si sa date est dépassée sans validation.</Alert>
    </div>
  );
}

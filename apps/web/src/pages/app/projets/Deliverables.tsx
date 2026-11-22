import { useMutation, useQuery } from "@tanstack/react-query";
import { PackageCheck, Plus } from "lucide-react";
import { useState } from "react";
import { DELIVERABLE_STATUS_LABELS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { fmtDateTime, fmtDay } from "@/lib/dates";
import { useSpace } from "./ProjectLayout";
import { useSpaceInvalidate } from "./TaskPanel";

type St = keyof typeof DELIVERABLE_STATUS_LABELS;
interface Rev { id: string; role: string; decision: string; comment: string | null; reviewer: string; createdAt: string }
interface D { id: string; name: string; description: string | null; expectedFormat: string | null; dueDate: string | null; owner: string | null; status: St; late: boolean; mentorApprovedAt: string | null; submissions: { id: string; versionNo: number; note: string | null; submittedAt: string; submittedBy: string; documentName: string; reviews: Rev[] }[] }
const tone: Record<St, "neutral" | "amber" | "blue" | "violet" | "red" | "green"> = { A_PRODUIRE: "neutral", EN_PREPARATION: "blue", SOUMIS: "amber", EN_REVISION: "violet", A_CORRIGER: "red", VALIDE: "green" };
const STEPS: St[] = ["A_PRODUIRE", "EN_PREPARATION", "SOUMIS", "EN_REVISION", "VALIDE"];
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");

export default function Deliverables() {
  const { id, overview } = useSpace();
  const refresh = useSpaceInvalidate(id);
  const role = overview.access.role, ro = overview.access.readOnly;
  const hasMentor = overview.members.some((m) => m.role === "MENTOR");
  const team = !ro && (role === "CHEF_PROJET" || role === "ETUDIANT");
  const { data, isLoading } = useQuery({ queryKey: ["space", id, "deliverables"], queryFn: () => api<{ deliverables: D[] }>(`/projects/${id}/deliverables`) });
  const docs = useQuery({ queryKey: ["space", id, "documents", "all"], queryFn: () => api<{ documents: { id: string; name: string; visibility: string }[] }>(`/projects/${id}/documents`), enabled: team });
  const [create, setCreate] = useState(false);
  const [f, setF] = useState({ name: "", description: "", dueDate: "" });
  const [submitFor, setSubmitFor] = useState<D | null>(null);
  const [docId, setDocId] = useState(""); const [note, setNote] = useState("");
  const [review, setReview] = useState<{ d: D; decision: "CORRECTION" | "COMMENTAIRE" } | null>(null);
  const [comment, setComment] = useState("");
  const run = (m: () => Promise<unknown>, ok?: string) => async () => { try { await m(); if (ok) toast.success(ok); await refresh(); await qcInv(); } catch (e) { toast.error(err(e)); } };
  const qcInv = async () => { await refresh(); };
  const add = useMutation({ mutationFn: () => api(`/projects/${id}/deliverables`, { method: "POST", body: { name: f.name, description: f.description || undefined, dueDate: f.dueDate || null } }), onSuccess: async () => { setCreate(false); setF({ name: "", description: "", dueDate: "" }); await refresh(); }, onError: (e) => toast.error(err(e)) });
  const rev = (d: D, decision: string, c?: string) => run(() => api(`/projects/${id}/deliverables/${d.id}/review`, { method: "POST", body: { decision, comment: c } }), decision === "VALIDE" ? "Livrable validé." : "Relecture enregistrée.")();
  const canCreate = !ro && (role === "CHEF_PROJET" || role === "MENTOR" || role === "CONTACT_ENTREPRISE");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">Le mentor relit et approuve chaque livrable avant sa transmission à l'entreprise, qui le valide.</p>{canCreate && <Button onClick={() => setCreate(true)}><Plus className="h-4 w-4" aria-hidden />Nouveau livrable</Button>}</div>
      {isLoading && <Skeleton className="h-40" />}
      {data?.deliverables.length === 0 && <EmptyState icon={<PackageCheck className="h-6 w-6" />} title="Aucun livrable officiel" />}
      {data?.deliverables.map((d) => { const last = d.submissions[0]; const idx = STEPS.indexOf(d.status === "A_CORRIGER" ? "EN_PREPARATION" : d.status); return (
        <Card key={d.id}><CardBody>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg">{d.name}</h2><p className="text-sm text-muted">{[d.expectedFormat, d.dueDate ? `échéance ${fmtDay(d.dueDate)}` : null, d.owner ? `responsable ${d.owner}` : null].filter(Boolean).join(" · ")}</p></div><div className="flex gap-2">{d.late && <Badge tone="red">En retard</Badge>}<Badge tone={tone[d.status]}>{DELIVERABLE_STATUS_LABELS[d.status]}</Badge></div></div>
          {d.description && <p className="mt-2 text-sm">{d.description}</p>}
          <ol className="mt-4 flex flex-wrap gap-1.5 text-[11px] font-semibold" aria-label="Progression du livrable">{STEPS.map((s, i) => <li key={s} className={`rounded-full px-2.5 py-1 ${i <= idx ? "bg-nexus text-white" : "bg-slate-100 text-muted"}`}>{DELIVERABLE_STATUS_LABELS[s]}</li>)}</ol>
          {d.status === "EN_REVISION" && d.mentorApprovedAt && <p className="mt-3 text-sm font-semibold text-emerald-800">✔ Approuvé par le mentor — en attente de validation par l'entreprise.</p>}
          {last && <div className="mt-4 rounded-md bg-cloud p-3 text-sm"><p className="font-semibold text-night">Version {last.versionNo} — « {last.documentName} » · {last.submittedBy}, {fmtDateTime(last.submittedAt)}</p>{last.note && <p className="text-muted">{last.note}</p>}
            {last.reviews.map((r) => <p key={r.id} className="mt-1.5 text-xs"><strong className="text-night">{r.reviewer}</strong> ({r.role === "MENTOR" ? "mentor" : "entreprise"}) : <span className="font-semibold">{r.decision === "CORRECTION" ? "corrections demandées" : r.decision === "APPROUVE" ? "approuvé" : r.decision === "VALIDE" ? "validé" : "commentaire"}</span>{r.comment ? ` — ${r.comment}` : ""}</p>)}</div>}
          <div className="mt-4 flex flex-wrap gap-2">
            {team && d.status === "A_PRODUIRE" && <Button size="sm" variant="secondary" onClick={run(() => api(`/projects/${id}/deliverables/${d.id}/start`, { method: "POST" }))}>Commencer</Button>}
            {team && ["A_PRODUIRE", "EN_PREPARATION", "A_CORRIGER"].includes(d.status) && <Button size="sm" onClick={() => { setSubmitFor(d); setDocId(""); setNote(""); }}>{d.status === "A_CORRIGER" ? "Soumettre une nouvelle version" : "Soumettre"}</Button>}
            {!ro && role === "MENTOR" && ["SOUMIS", "EN_REVISION"].includes(d.status) && <><Button size="sm" onClick={() => rev(d, "APPROUVE")}>Approuver</Button><Button size="sm" variant="secondary" onClick={() => { setReview({ d, decision: "CORRECTION" }); setComment(""); }}>Demander des corrections</Button><Button size="sm" variant="ghost" onClick={() => { setReview({ d, decision: "COMMENTAIRE" }); setComment(""); }}>Commenter</Button></>}
            {!ro && role === "CONTACT_ENTREPRISE" && ["SOUMIS", "EN_REVISION"].includes(d.status) && (d.mentorApprovedAt || !hasMentor) && <><Button size="sm" onClick={() => rev(d, "VALIDE")}>Valider le livrable</Button><Button size="sm" variant="secondary" onClick={() => { setReview({ d, decision: "CORRECTION" }); setComment(""); }}>Demander des corrections</Button></>}
            {!ro && role === "CONTACT_ENTREPRISE" && ["SOUMIS", "EN_REVISION"].includes(d.status) && hasMentor && !d.mentorApprovedAt && <p className="text-xs text-muted">En attente de l'approbation du mentor.</p>}
          </div>
        </CardBody></Card>); })}
      <Modal open={create} onOpenChange={setCreate} title="Nouveau livrable"><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}><Field label="Nom">{(p) => <Input {...p} autoFocus maxLength={160} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field><Field label="Description" optional>{(p) => <Textarea {...p} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field><Field label="Date limite" optional>{(p) => <Input {...p} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />}</Field><div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setCreate(false)}>Annuler</Button><Button type="submit" loading={add.isPending} disabled={!f.name.trim()}>Créer</Button></div></form></Modal>
      <Modal open={Boolean(submitFor)} onOpenChange={(o) => !o && setSubmitFor(null)} title={`Soumettre « ${submitFor?.name ?? ""} »`} description="Choisissez le document de la bibliothèque (visible par le mentor et l'entreprise). Sa version actuelle est transmise.">
        <div className="space-y-4"><Field label="Document">{(p) => <Select {...p} value={docId} onChange={(e) => setDocId(e.target.value)}><option value="">Choisir…</option>{docs.data?.documents.filter((x) => x.visibility !== "EQUIPE_SEULE").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>{docs.data && docs.data.documents.filter((x) => x.visibility !== "EQUIPE_SEULE").length === 0 && <Alert tone="warning">Déposez d'abord un document visible par tous (ou « équipe et mentor ») dans la bibliothèque.</Alert>}<Field label="Note" optional>{(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setSubmitFor(null)}>Annuler</Button><Button disabled={!docId} onClick={async () => { await run(() => api(`/projects/${id}/deliverables/${submitFor!.id}/submit`, { method: "POST", body: { documentId: docId, note: note || undefined } }), "Livrable soumis.")(); setSubmitFor(null); }}>Soumettre</Button></div></div>
      </Modal>
      <Modal open={Boolean(review)} onOpenChange={(o) => !o && setReview(null)} title={review?.decision === "CORRECTION" ? "Demander des corrections" : "Commenter"}><div className="space-y-4"><Field label="Commentaire (obligatoire)">{(p) => <Textarea {...p} rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setReview(null)}>Annuler</Button><Button disabled={!comment.trim()} onClick={async () => { await rev(review!.d, review!.decision, comment); setReview(null); }}>Envoyer</Button></div></div></Modal>
    </div>
  );
}

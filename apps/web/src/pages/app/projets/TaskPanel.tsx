import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Paperclip, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, type TaskPriorityCode, type TaskStatusCode } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { fmtDateTime, isoDay } from "@/lib/dates";
import { canContribute, canWriteTasks, type TaskT } from "@/lib/space";
import { useSpace } from "./ProjectLayout";

interface Detail { task: TaskT; subtasks: TaskT[]; comments: { id: string; body: string; author: string; authorId: string; createdAt: string }[]; history: { id: string; field: string; oldValue: string | null; newValue: string | null; actor: string; at: string }[]; attachments: { id: string; documentId: string; name: string; version: number }[] }
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");

export function useSpaceInvalidate(id: string) {
  const qc = useQueryClient();
  return () => Promise.all(["tasks", "task", "overview", "milestones", "calendar", "activity"].map((k) => qc.invalidateQueries({ queryKey: ["space", id, k] })));
}

export default function TaskPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { id, overview } = useSpace();
  const { access, members } = overview;
  const write = canWriteTasks(access.role, access.readOnly), comment = canContribute(access.role, access.readOnly);
  const refresh = useSpaceInvalidate(id);
  const { data, isLoading, error } = useQuery({ queryKey: ["space", id, "task", taskId], queryFn: () => api<Detail>(`/projects/${id}/tasks/${taskId}`), retry: false });
  const milestones = useQuery({ queryKey: ["space", id, "milestones"], queryFn: () => api<{ milestones: { id: string; title: string }[] }>(`/projects/${id}/milestones`) });
  const labels = useQuery({ queryKey: ["space", id, "labels"], queryFn: () => api<{ labels: { id: string; name: string; color: string }[] }>(`/projects/${id}/tasks/labels`) });
  const docs = useQuery({ queryKey: ["space", id, "documents", "all"], queryFn: () => api<{ documents: { id: string; name: string }[] }>(`/projects/${id}/documents`), enabled: write });
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [newSub, setNewSub] = useState(""); const [newComment, setNewComment] = useState(""); const [newLabel, setNewLabel] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => { if (data) { setTitle(data.task.title); setDesc(data.task.description ?? ""); } }, [data?.task.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = data?.task;
  const afterChange = async () => { await Promise.all([refresh(), useQueryClientInvalidateDetail()]); };
  const qc = useQueryClient();
  const useQueryClientInvalidateDetail = () => qc.invalidateQueries({ queryKey: ["space", id, "task", taskId] });
  const patch = useMutation({ mutationFn: (b: object) => api(`/projects/${id}/tasks/${taskId}`, { method: "PATCH", body: b }), onSuccess: afterChange, onError: (e) => toast.error(err(e)) });
  const addSub = useMutation({ mutationFn: () => api(`/projects/${id}/tasks`, { method: "POST", body: { title: newSub, parentTaskId: taskId } }), onSuccess: async () => { setNewSub(""); await afterChange(); }, onError: (e) => toast.error(err(e)) });
  const toggleSub = useMutation({ mutationFn: (s: TaskT) => api(`/projects/${id}/tasks/${s.id}`, { method: "PATCH", body: { status: s.status === "TERMINE" ? "A_FAIRE" : "TERMINE" } }), onSuccess: afterChange });
  const addComment = useMutation({ mutationFn: () => api(`/projects/${id}/tasks/${taskId}/comments`, { method: "POST", body: { body: newComment } }), onSuccess: async () => { setNewComment(""); await afterChange(); }, onError: (e) => toast.error(err(e)) });
  const del = useMutation({ mutationFn: () => api(`/projects/${id}/tasks/${taskId}`, { method: "DELETE" }), onSuccess: async () => { toast.success("Tâche supprimée."); await refresh(); onClose(); }, onError: (e) => toast.error(err(e)) });
  const attach = useMutation({ mutationFn: (documentId: string) => api(`/projects/${id}/tasks/${taskId}/attachments`, { method: "POST", body: { documentId } }), onSuccess: afterChange, onError: (e) => toast.error(err(e)) });
  const detach = useMutation({ mutationFn: (attId: string) => api(`/projects/${id}/tasks/${taskId}/attachments/${attId}`, { method: "DELETE" }), onSuccess: afterChange });
  const makeLabel = useMutation({ mutationFn: () => api(`/projects/${id}/tasks/labels`, { method: "POST", body: { name: newLabel } }), onSuccess: async () => { setNewLabel(""); await qc.invalidateQueries({ queryKey: ["space", id, "labels"] }); } });
  const eligible = members.filter((m) => m.role !== "CONTACT_ENTREPRISE" || true);

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t?.title ?? "Tâche"} description={t ? `${TASK_STATUS_LABELS[t.status]} · modifiée ${fmtDateTime(t.updatedAt)}` : undefined}>
      {isLoading && <Skeleton className="h-64" />}
      {error && <Alert tone="error">Cette tâche est introuvable (elle a peut-être été supprimée).</Alert>}
      {data && t && (
        <div className="max-h-[70dvh] space-y-5 overflow-y-auto pr-1">
          {!write && <Alert tone="info">{access.readOnly ? "Lecture seule." : "Vous pouvez commenter cette tâche ; seuls l'équipe et le mentor la modifient."}</Alert>}
          <Field label="Titre">{(p) => <Input {...p} value={title} disabled={!write} maxLength={160} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== t.title && patch.mutate({ title })} />}</Field>
          <Field label="Description">{(p) => <Textarea {...p} rows={4} value={desc} disabled={!write} maxLength={5000} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (t.description ?? "") && patch.mutate({ description: desc })} />}</Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Statut">{(p) => <Select {...p} value={t.status} disabled={!write} onChange={(e) => patch.mutate({ status: e.target.value as TaskStatusCode })}>{TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}</Select>}</Field>
            <Field label="Priorité">{(p) => <Select {...p} value={t.priority} disabled={!write} onChange={(e) => patch.mutate({ priority: e.target.value as TaskPriorityCode })}>{TASK_PRIORITIES.map((s) => <option key={s} value={s}>{TASK_PRIORITY_LABELS[s]}</option>)}</Select>}</Field>
            <Field label="Date de début" optional>{(p) => <Input {...p} type="date" disabled={!write} value={t.startDate ? isoDay(new Date(t.startDate)) : ""} onChange={(e) => patch.mutate({ startDate: e.target.value || null })} />}</Field>
            <Field label="Échéance" optional>{(p) => <Input {...p} type="date" disabled={!write} value={t.dueDate ? isoDay(new Date(t.dueDate)) : ""} onChange={(e) => patch.mutate({ dueDate: e.target.value || null })} />}</Field>
            <Field label="Jalon" optional>{(p) => <Select {...p} value={t.milestoneId ?? ""} disabled={!write} onChange={(e) => patch.mutate({ milestoneId: e.target.value || null })}><option value="">Aucun</option>{milestones.data?.milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select>}</Field>
          </div>
          <fieldset><legend className="mb-1.5 text-sm font-semibold text-night">Responsables</legend>
            <div className="flex flex-wrap gap-2">{eligible.map((m) => { const on = t.assignees.some((a) => a.userId === m.userId); return <button key={m.userId} type="button" disabled={!write} aria-pressed={on} onClick={() => patch.mutate({ assigneeIds: on ? t.assignees.filter((a) => a.userId !== m.userId).map((a) => a.userId) : [...t.assignees.map((a) => a.userId), m.userId] })} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${on ? "border-nexus bg-nexus text-white" : "border-slate-300 bg-white text-ink hover:border-nexus"} disabled:opacity-60`}>{m.name}</button>; })}</div></fieldset>
          <fieldset><legend className="mb-1.5 text-sm font-semibold text-night">Étiquettes</legend>
            <div className="flex flex-wrap items-center gap-2">{labels.data?.labels.map((l) => { const on = t.labels.some((x) => x.id === l.id); return <button key={l.id} type="button" disabled={!write} aria-pressed={on} onClick={() => patch.mutate({ labelIds: on ? t.labels.filter((x) => x.id !== l.id).map((x) => x.id) : [...t.labels.map((x) => x.id), l.id] })} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? "text-white" : "bg-white text-ink"}`} style={on ? { background: l.color, borderColor: l.color } : { borderColor: l.color }}>{l.name}</button>; })}
              {write && <span className="flex items-center gap-1"><label className="sr-only" htmlFor="new-label">Nouvelle étiquette</label><Input id="new-label" className="h-8 w-36 !py-1 text-xs" placeholder="Nouvelle étiquette" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newLabel.trim()) { e.preventDefault(); makeLabel.mutate(); } }} /></span>}</div></fieldset>

          {!t.parentTaskId && (<section><h3 className="mb-2 text-base">Sous-tâches {t.subtasks.total > 0 && <span className="text-sm font-normal text-muted">({t.subtasks.done}/{t.subtasks.total})</span>}</h3>
            <ul className="space-y-1.5">{data.subtasks.map((s) => <li key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-nexus" checked={s.status === "TERMINE"} disabled={!write} onChange={() => toggleSub.mutate(s)} aria-label={`Terminer ${s.title}`} /><span className={s.status === "TERMINE" ? "text-muted line-through" : ""}>{s.title}</span></li>)}</ul>
            {write && <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newSub.trim()) addSub.mutate(); }}><label className="sr-only" htmlFor="new-sub">Nouvelle sous-tâche</label><Input id="new-sub" value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Ajouter une sous-tâche" /><Button type="submit" variant="secondary" disabled={!newSub.trim()} loading={addSub.isPending}><Plus className="h-4 w-4" aria-hidden /><span className="sr-only">Ajouter</span></Button></form>}</section>)}

          <section><h3 className="mb-2 text-base">Pièces jointes</h3>
            <ul className="space-y-1.5 text-sm">{data.attachments.map((a) => <li key={a.id} className="flex items-center gap-2"><Paperclip className="h-4 w-4 text-muted" aria-hidden /><span className="flex-1 truncate">{a.name} <span className="text-xs text-muted">v{a.version}</span></span>{write && <Button size="sm" variant="ghost" aria-label={`Retirer ${a.name}`} onClick={() => detach.mutate(a.id)}><Trash2 className="h-4 w-4" aria-hidden /></Button>}</li>)}{data.attachments.length === 0 && <li className="text-muted">Aucune pièce jointe.</li>}</ul>
            {write && (docs.data?.documents.length ?? 0) > 0 && <div className="mt-2"><label className="sr-only" htmlFor="att">Joindre un document</label><Select id="att" value="" onChange={(e) => e.target.value && attach.mutate(e.target.value)}><option value="">+ Joindre un document de la bibliothèque…</option>{docs.data!.documents.filter((d) => !data.attachments.some((a) => a.documentId === d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></div>}</section>

          <section><h3 className="mb-2 text-base">Commentaires ({data.comments.length})</h3>
            <ul className="space-y-3">{data.comments.map((c) => <li key={c.id} className="rounded-md bg-cloud p-3 text-sm"><p className="font-semibold text-night">{c.author} <span className="text-xs font-normal text-muted">{fmtDateTime(c.createdAt)}</span></p><p className="mt-1 whitespace-pre-line">{c.body}</p></li>)}</ul>
            {comment && <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (newComment.trim()) addComment.mutate(); }}><label className="sr-only" htmlFor="new-comment">Votre commentaire</label><Textarea id="new-comment" rows={2} value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Ajouter un commentaire…" maxLength={2000} /><Button type="submit" variant="secondary" disabled={!newComment.trim()} loading={addComment.isPending}>Commenter</Button></form>}</section>

          <section><h3 className="mb-2 text-base">Historique des modifications</h3>
            <ol className="space-y-1.5 text-xs text-muted">{data.history.map((h) => <li key={h.id}><strong className="text-night">{h.actor}</strong> · {h.field}{h.field !== "création" && <> : {h.oldValue ?? "∅"} → <span className="text-night">{h.newValue ?? "∅"}</span></>}<span className="ml-1">({fmtDateTime(h.at)})</span></li>)}</ol></section>

          {write && <div className="border-t border-line pt-4"><Button variant="ghost" className="text-red-700" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4" aria-hidden />Supprimer la tâche</Button></div>}
          <Modal open={confirmDel} onOpenChange={setConfirmDel} title="Supprimer cette tâche ?" description={`« ${t.title} »${t.subtasks.total ? ` et ses ${t.subtasks.total} sous-tâche(s)` : ""} seront supprimées.`}>
            <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setConfirmDel(false)}>Annuler</Button><Button variant="danger" loading={del.isPending} onClick={() => del.mutate()}>Supprimer</Button></div>
          </Modal>
        </div>
      )}
      <div className="mt-4 flex justify-end"><Badge>{patch.isPending ? "Enregistrement…" : <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" aria-hidden />Enregistré automatiquement</span>}</Badge></div>
    </Modal>
  );
}

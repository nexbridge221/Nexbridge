import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";

const STATUS: Record<string, string> = { PLANIFIE: "Planifié", EN_COURS: "En cours", EN_EVALUATION: "En évaluation", EN_PAUSE: "En pause", TERMINE: "Terminé", ANNULE: "Annulé" };

export default function AdminProjects() {
  usePageTitle("Gestion des projets");
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["admin-projects"], queryFn: () => api<{ projects: { id: string; name: string; description: string | null; startDate: string | null; plannedEndDate: string | null; challengeTitle: string; status: string; createdAt: string; sector: string | null; members: { userId: string; role: string; name: string }[] }[] }>("/admin/projects") });
  const mentors = useQuery({ queryKey: ["admin-mentors"], queryFn: () => api<{ mentors: { userId: string; name: string; sectors: string[]; max: number; active: number }[] }>("/admin/mentors") });
  const [pick, setPick] = useState<Record<string, string>>({});
  type P = NonNullable<typeof projects.data>["projects"][number];
  const failure = (e: unknown) => toast.error(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Action impossible.");
  const [edit, setEdit] = useState<{ p: P; name: string; description: string; status: string; startDate: string; plannedEndDate: string; reason: string } | null>(null);
  const [del, setDel] = useState<P | null>(null);
  const day = (d: string | null) => (d ? d.slice(0, 10) : "");
  const locked = (st: string) => st === "EN_EVALUATION" || st === "TERMINE";
  const save = useMutation({
    mutationFn: () => api(`/admin/projects/${edit!.p.id}`, { method: "PATCH", body: { name: edit!.name.trim(), description: edit!.description.trim() || null, ...(edit!.status !== edit!.p.status ? { status: edit!.status } : {}), startDate: edit!.startDate || null, plannedEndDate: edit!.plannedEndDate || null, ...(edit!.reason.trim() ? { reason: edit!.reason.trim() } : {}) } }),
    onSuccess: async () => { toast.success("Projet mis à jour."); setEdit(null); await qc.invalidateQueries({ queryKey: ["admin-projects"] }); }, onError: failure,
  });
  const remove = useMutation({ mutationFn: () => api(`/admin/projects/${del!.id}`, { method: "DELETE" }), onSuccess: async () => { toast.success("Projet supprimé."); setDel(null); await qc.invalidateQueries({ queryKey: ["admin-projects"] }); }, onError: (e) => { setDel(null); failure(e); } });
  const assign = useMutation({ mutationFn: (v: { projectId: string; mentorUserId: string }) => api(`/admin/projects/${v.projectId}/mentor`, { method: "POST", body: { mentorUserId: v.mentorUserId } }), onSuccess: async () => { toast.success("Mentor affecté."); await qc.invalidateQueries({ queryKey: ["admin-projects"] }); await qc.invalidateQueries({ queryKey: ["admin-mentors"] }); await qc.invalidateQueries({ queryKey: ["admin-overview"] }); }, onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action impossible.") });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl">Gestion des projets</h1>
      {projects.isLoading && <Skeleton className="h-32" />}
      {projects.data?.projects.length === 0 && <EmptyState icon={<FolderKanban className="h-6 w-6" />} title="Aucun projet lancé">Un projet est créé automatiquement quand une équipe est validée.</EmptyState>}
      {projects.data?.projects.map((p) => {
        const mentor = p.members.find((m) => m.role === "MENTOR");
        return (
          <Card key={p.id}><CardBody>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg">{p.name}</h2><p className="text-sm text-muted">{p.sector ?? "—"} · lancé le {formatDate(p.createdAt)}</p></div><Badge tone="blue">{STATUS[p.status] ?? p.status}</Badge></div>
            <p className="mt-3 text-sm text-muted">Équipe : {p.members.filter((m) => m.role === "ETUDIANT" || m.role === "CHEF_PROJET").map((m) => m.name).join(", ")}</p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="w-72"><label htmlFor={`m-${p.id}`} className="mb-1 block text-sm font-semibold text-night">{mentor ? `Mentor : ${mentor.name}` : "Affecter un mentor"}</label>
                <Select id={`m-${p.id}`} value={pick[p.id] ?? ""} onChange={(e) => setPick({ ...pick, [p.id]: e.target.value })}><option value="">Choisir…</option>{mentors.data?.mentors.map((m) => <option key={m.userId} value={m.userId} disabled={m.active >= m.max}>{m.name} — {m.active}/{m.max} projets{m.sectors.length ? ` (${m.sectors.slice(0, 2).join(", ")})` : ""}</option>)}</Select></div>
              <Button disabled={!pick[p.id]} loading={assign.isPending && assign.variables?.projectId === p.id} onClick={() => assign.mutate({ projectId: p.id, mentorUserId: pick[p.id]! })}>{mentor ? "Remplacer" : "Affecter"}</Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <Button size="sm" variant="secondary" onClick={() => setEdit({ p, name: p.name, description: p.description ?? "", status: p.status, startDate: day(p.startDate), plannedEndDate: day(p.plannedEndDate), reason: "" })}><Pencil className="h-4 w-4" aria-hidden />Modifier</Button>
              <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setDel(p)}><Trash2 className="h-4 w-4" aria-hidden />Supprimer</Button>
            </div>
          </CardBody></Card>);
      })}
      <Modal open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} title="Modifier le projet" description={edit ? `Défi d'origine : ${edit.p.challengeTitle}` : undefined}>
        {edit && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Nom du projet">{(p) => <Input {...p} autoFocus maxLength={160} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />}</Field>
          <Field label="Description" optional>{(p) => <Textarea {...p} rows={3} maxLength={2000} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />}</Field>
          <Field label="Statut" help={locked(edit.p.status) ? "Un projet en évaluation ou terminé suit le processus d'évaluation : son statut ne peut pas être changé ici." : "Annuler un projet prévient tous ses membres."}>{(p) => <Select {...p} disabled={locked(edit.p.status)} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{locked(edit.p.status) ? <option value={edit.p.status}>{STATUS[edit.p.status]}</option> : ["PLANIFIE", "EN_COURS", "EN_PAUSE", "ANNULE"].map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}</Select>}</Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Début" optional>{(p) => <Input {...p} type="date" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} />}</Field><Field label="Fin prévue" optional>{(p) => <Input {...p} type="date" value={edit.plannedEndDate} onChange={(e) => setEdit({ ...edit, plannedEndDate: e.target.value })} />}</Field></div>
          {edit.status !== edit.p.status && <Field label="Motif du changement de statut" optional>{(p) => <Textarea {...p} rows={2} maxLength={300} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />}</Field>}
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Annuler</Button><Button type="submit" loading={save.isPending} disabled={edit.name.trim().length < 2}>Enregistrer</Button></div>
        </form>}
      </Modal>
      <Modal open={Boolean(del)} onOpenChange={(o) => !o && setDel(null)} title="Supprimer ce projet ?" description={del?.name}>
        <Alert tone="warning" title="Action irréversible">Les tâches, documents, messages, jalons, livrables et évaluations du projet sont supprimés, et ses membres sont prévenus. Le défi d'origine est archivé. Un projet avec des mouvements de séquestre, des attestations ou des badges ne peut pas être supprimé : passez-le alors au statut « Annulé ».</Alert>
        <div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setDel(null)}>Annuler</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Supprimer définitivement</Button></div>
      </Modal>
    </div>
  );
}

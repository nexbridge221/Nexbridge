import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

type Kind = "testimonials" | "partners" | "faq" | "messages";
/* eslint-disable @typescript-eslint/no-explicit-any */
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");
const blank: Record<string, any> = { testimonials: { authorName: "", authorRole: "", organization: "", quote: "", published: false, position: 0 }, partners: { name: "", kind: "ACADEMIQUE", website: "", published: false, position: 0 }, faq: { question: "", answer: "", audience: "GENERAL", published: true, position: 0 } };

export default function AdminContent() {
  usePageTitle("Contenus");
  const qc = useQueryClient();
  const [tab, setTab] = useState<Kind>("testimonials");
  const list = useQuery({ queryKey: ["admin-content", tab], queryFn: () => api<any>(tab === "messages" ? "/admin/contact-messages" : `/admin/${tab}`) });
  const [edit, setEdit] = useState<any | null>(null);
  const items: any[] = list.data?.items ?? list.data?.messages ?? [];
  const save = useMutation({ mutationFn: () => { const { id, createdAt, isDemo, ...body } = edit; for (const k of Object.keys(body)) if (body[k] === "" || body[k] === null) delete body[k]; return id ? api(`/admin/${tab}/${id}`, { method: "PUT", body }) : api(`/admin/${tab}`, { method: "POST", body }); }, onSuccess: async () => { setEdit(null); await qc.invalidateQueries({ queryKey: ["admin-content", tab] }); await qc.invalidateQueries({ queryKey: [tab === "testimonials" ? "testimonials" : tab === "partners" ? "partners" : "faq"] }); toast.success("Enregistré."); }, onError: (e) => toast.error(err(e)) });
  const del = useMutation({ mutationFn: (id: string) => api(`/admin/${tab}/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-content", tab] }) });
  const handled = useMutation({ mutationFn: (id: string) => api(`/admin/contact-messages/${id}/handled`, { method: "POST" }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["admin-content", "messages"] }); await qc.invalidateQueries({ queryKey: ["admin-overview"] }); } });
  const tabs: [Kind, string][] = [["testimonials", "Témoignages"], ["partners", "Partenaires"], ["faq", "FAQ"], ["messages", "Messages reçus"]];
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl sm:text-3xl">Contenus du site</h1>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold", tab === k ? "border-nexus text-nexus" : "border-transparent text-muted hover:text-night")}>{l}</button>)}</div>
      {tab !== "messages" && <div className="flex justify-end"><Button onClick={() => setEdit({ ...blank[tab] })}>Ajouter</Button></div>}
      {list.isLoading && <Skeleton className="h-32" />}
      {list.data && items.length === 0 && <EmptyState title="Aucun contenu" />}
      <ul className="space-y-3">{items.map((it) => (
        <li key={it.id}><Card><CardBody className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {tab === "testimonials" && <><p className="font-semibold text-night">{it.authorName} <span className="font-normal text-muted">{[it.authorRole, it.organization].filter(Boolean).join(", ")}</span></p><p className="mt-1 text-sm">« {it.quote} »</p></>}
            {tab === "partners" && <><p className="font-semibold text-night">{it.name} <Badge>{it.kind}</Badge></p><p className="text-sm text-muted">{it.website}</p></>}
            {tab === "faq" && <><p className="font-semibold text-night">{it.question} <Badge>{it.audience}</Badge></p><p className="mt-1 text-sm text-muted">{it.answer}</p></>}
            {tab === "messages" && <><p className="font-semibold text-night">{it.subject} <span className="font-normal text-muted">— {it.name} ({it.email}{it.organization ? `, ${it.organization}` : ""})</span></p><p className="mt-1 whitespace-pre-line text-sm">{it.message}</p><p className="mt-1 text-xs text-muted">{formatDate(it.createdAt)}</p></>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tab !== "messages" && <><Badge tone={it.published ? "green" : "neutral"}>{it.published ? "Publié" : "Brouillon"}</Badge><Button size="sm" variant="secondary" onClick={() => setEdit({ ...it })}>Modifier</Button><Button size="sm" variant="ghost" onClick={() => { if (confirm("Supprimer cet élément ?")) del.mutate(it.id); }}>Supprimer</Button></>}
            {tab === "messages" && (it.handledAt ? <Badge tone="green">Traité</Badge> : <Button size="sm" onClick={() => handled.mutate(it.id)}>Marquer comme traité</Button>)}
          </div>
        </CardBody></Card></li>))}</ul>
      <Modal open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Modifier" : "Ajouter"}>
        {edit && <form className="max-h-[70dvh] space-y-4 overflow-y-auto pr-1" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {tab === "testimonials" && <><Field label="Nom de l'auteur">{(p) => <Input {...p} value={edit.authorName ?? ""} onChange={(e) => set("authorName", e.target.value)} />}</Field><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Fonction" optional>{(p) => <Input {...p} value={edit.authorRole ?? ""} onChange={(e) => set("authorRole", e.target.value)} />}</Field><Field label="Organisation" optional>{(p) => <Input {...p} value={edit.organization ?? ""} onChange={(e) => set("organization", e.target.value)} />}</Field></div><Field label="Témoignage" help="Un témoignage réel, avec l'accord de la personne.">{(p) => <Textarea {...p} rows={4} value={edit.quote ?? ""} onChange={(e) => set("quote", e.target.value)} />}</Field></>}
          {tab === "partners" && <><Field label="Nom">{(p) => <Input {...p} value={edit.name ?? ""} onChange={(e) => set("name", e.target.value)} />}</Field><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Type">{(p) => <Select {...p} value={edit.kind} onChange={(e) => set("kind", e.target.value)}><option value="INSTITUTIONNEL">Institutionnel</option><option value="ACADEMIQUE">Académique</option><option value="ENTREPRISE">Entreprise</option></Select>}</Field><Field label="Site web" optional>{(p) => <Input {...p} type="url" value={edit.website ?? ""} onChange={(e) => set("website", e.target.value)} />}</Field></div></>}
          {tab === "faq" && <><Field label="Question">{(p) => <Input {...p} value={edit.question ?? ""} onChange={(e) => set("question", e.target.value)} />}</Field><Field label="Réponse">{(p) => <Textarea {...p} rows={5} value={edit.answer ?? ""} onChange={(e) => set("answer", e.target.value)} />}</Field><Field label="Public">{(p) => <Select {...p} value={edit.audience} onChange={(e) => set("audience", e.target.value)}><option value="GENERAL">Général</option><option value="ENTREPRISE">Entreprises</option><option value="ETUDIANT">Étudiants</option><option value="ETABLISSEMENT">Établissements</option></Select>}</Field></>}
          <div className="flex flex-wrap items-center gap-6"><Checkbox label="Publié sur le site" checked={Boolean(edit.published)} onChange={(e) => set("published", e.target.checked)} /><Field label="Position" className="w-28">{(p) => <Input {...p} type="number" min={0} value={edit.position ?? 0} onChange={(e) => set("position", Number(e.target.value) || 0)} />}</Field></div>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Annuler</Button><Button type="submit" loading={save.isPending}>Enregistrer</Button></div>
        </form>}
      </Modal>
    </div>
  );
}

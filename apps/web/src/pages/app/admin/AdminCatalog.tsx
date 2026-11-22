import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BADGE_TYPE_LABELS, SKILL_CATEGORIES, SKILL_CATEGORY_LABELS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, Card, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

interface S { id: string; name: string; category: keyof typeof SKILL_CATEGORY_LABELS; active: boolean; mergedIntoId: string | null; students: number; challenges: number }
interface B { id: string; code: string; name: string; description: string; type: keyof typeof BADGE_TYPE_LABELS; active: boolean; awards: number }
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");

export default function AdminCatalog() {
  usePageTitle("Compétences et badges");
  const qc = useQueryClient();
  const [tab, setTab] = useState<"skills" | "badges">("skills");
  const skills = useQuery({ queryKey: ["admin-skills"], queryFn: () => api<{ skills: S[] }>("/admin/skills") });
  const badges = useQuery({ queryKey: ["admin-badges"], queryFn: () => api<{ badges: B[] }>("/admin/badges") });
  const [add, setAdd] = useState<{ name: string; category: S["category"] } | null>(null);
  const [merge, setMerge] = useState<{ from: S; into: string } | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["admin-skills"] }), qc.invalidateQueries({ queryKey: ["skills"] })]);
  const create = useMutation({ mutationFn: () => api("/admin/skills", { method: "POST", body: add }), onSuccess: async () => { setAdd(null); await refresh(); }, onError: (e) => toast.error(err(e)) });
  const toggle = useMutation({ mutationFn: (s: S) => api(`/admin/skills/${s.id}`, { method: "PATCH", body: { active: !s.active } }), onSuccess: refresh });
  const doMerge = useMutation({ mutationFn: () => api(`/admin/skills/${merge!.from.id}/merge`, { method: "POST", body: { intoId: merge!.into } }), onSuccess: async () => { setMerge(null); toast.success("Compétences fusionnées."); await refresh(); }, onError: (e) => toast.error(err(e)) });
  const toggleBadge = useMutation({ mutationFn: (b: B) => api(`/admin/badges/${b.id}`, { method: "PATCH", body: { active: !b.active } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-badges"] }) });
  const activeSkills = skills.data?.skills.filter((s) => s.active) ?? [];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl sm:text-3xl">Compétences et badges</h1>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">{([["skills", "Référentiel de compétences"], ["badges", "Badges"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold", tab === k ? "border-nexus text-nexus" : "border-transparent text-muted hover:text-night")}>{l}</button>)}</div>
      {tab === "skills" && (<>
        <div className="flex justify-end"><Button onClick={() => setAdd({ name: "", category: "TECHNIQUE" })}>Ajouter une compétence</Button></div>
        {skills.isLoading && <Skeleton className="h-40" />}
        {skills.data && <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><caption className="sr-only">Compétences</caption><thead className="border-b border-line text-muted"><tr>{["Compétence", "Catégorie", "Étudiants", "Défis", "Statut", "Actions"].map((h) => <th key={h} scope="col" className="p-3 font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-line">{skills.data.skills.map((s) => <tr key={s.id} className={s.active ? "" : "opacity-60"}><th scope="row" className="p-3 text-left font-semibold text-night">{s.name}</th><td className="p-3 text-muted">{SKILL_CATEGORY_LABELS[s.category]}</td><td className="p-3 tabular-nums">{s.students}</td><td className="p-3 tabular-nums">{s.challenges}</td><td className="p-3">{s.mergedIntoId ? <Badge>Fusionnée</Badge> : <Badge tone={s.active ? "green" : "neutral"}>{s.active ? "Active" : "Désactivée"}</Badge>}</td><td className="p-3">{!s.mergedIntoId && <div className="flex gap-1.5"><Button size="sm" variant="ghost" onClick={() => toggle.mutate(s)}>{s.active ? "Désactiver" : "Activer"}</Button>{s.active && <Button size="sm" variant="ghost" onClick={() => setMerge({ from: s, into: "" })}>Fusionner…</Button>}</div>}</td></tr>)}</tbody></table></Card>}
      </>)}
      {tab === "badges" && (<>
        <p className="text-sm text-muted">Les badges sont attribués automatiquement à la clôture des projets. Les badges de compétence sont créés à la volée. Désactiver un badge empêche son attribution future (les badges déjà obtenus sont conservés).</p>
        {badges.isLoading && <Skeleton className="h-40" />}
        {badges.data?.badges.length === 0 && <p className="text-sm text-muted">Aucun badge n'a encore été attribué.</p>}
        {badges.data && badges.data.badges.length > 0 && <Card><ul className="divide-y divide-line">{badges.data.badges.map((b) => <li key={b.id} className="flex flex-wrap items-center gap-3 p-4 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold text-night">{b.name} <Badge tone={b.type === "EXCELLENCE" ? "amber" : b.type === "SECTORIEL" ? "teal" : "blue"}>{BADGE_TYPE_LABELS[b.type]}</Badge></p><p className="text-muted">{b.description}</p></div><span className="tabular-nums text-muted">{b.awards} attribution(s)</span><Button size="sm" variant={b.active ? "ghost" : "secondary"} onClick={() => toggleBadge.mutate(b)}>{b.active ? "Désactiver" : "Activer"}</Button></li>)}</ul></Card>}
      </>)}
      <Modal open={Boolean(add)} onOpenChange={(o) => !o && setAdd(null)} title="Nouvelle compétence">{add && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}><Field label="Nom">{(p) => <Input {...p} autoFocus value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />}</Field><Field label="Catégorie">{(p) => <Select {...p} value={add.category} onChange={(e) => setAdd({ ...add, category: e.target.value as S["category"] })}>{SKILL_CATEGORIES.map((c) => <option key={c} value={c}>{SKILL_CATEGORY_LABELS[c]}</option>)}</Select>}</Field><div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setAdd(null)}>Annuler</Button><Button type="submit" loading={create.isPending} disabled={add.name.trim().length < 2}>Créer</Button></div></form>}</Modal>
      <Modal open={Boolean(merge)} onOpenChange={(o) => !o && setMerge(null)} title={`Fusionner « ${merge?.from.name} »`} description="Les usages (profils, défis, évaluations) sont transférés vers la compétence choisie, en conservant le niveau le plus élevé. La compétence source est désactivée.">{merge && <div className="space-y-4"><Field label="Fusionner dans">{(p) => <Select {...p} value={merge.into} onChange={(e) => setMerge({ ...merge, into: e.target.value })}><option value="">Choisir…</option>{activeSkills.filter((s) => s.id !== merge.from.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setMerge(null)}>Annuler</Button><Button variant="danger" disabled={!merge.into} loading={doMerge.isPending} onClick={() => doMerge.mutate()}>Fusionner</Button></div></div>}</Modal>
    </div>
  );
}

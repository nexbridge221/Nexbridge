import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PROJECT_ROLE_LABELS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Alert, Avatar, Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { HEALTH } from "@/components/space/bits";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError, getAccessToken } from "@/lib/api";
import { fmtDateTime, fmtDay, fmtRelative } from "@/lib/dates";
import { useSpace } from "./ProjectLayout";
import { useSpaceInvalidate } from "./TaskPanel";

/* ---------------- Fil d'activité ---------------- */
const TYPES = [["", "Toute l'activité"], ["task", "Tâches"], ["document", "Documents"], ["deliverable", "Livrables"], ["milestone", "Jalons"], ["meeting", "Réunions"]] as const;
export function Activity() {
  const { id } = useSpace();
  const [type, setType] = useState("");
  const q = useInfiniteQuery({ queryKey: ["space", id, "activity", type], initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => api<{ events: { id: string; type: string; label: string; actor: string; createdAt: string }[]; nextCursor: string | null }>(`/projects/${id}/activity?limit=30${type ? `&type=${type}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`), getNextPageParam: (l) => l.nextCursor ?? undefined });
  const events = q.data?.pages.flatMap((p) => p.events) ?? [];
  return (
    <div className="space-y-4">
      <div className="max-w-xs"><label htmlFor="act-type" className="sr-only">Type d'événement</label><Select id="act-type" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
      {q.isLoading && <Skeleton className="h-40" />}
      {q.isSuccess && events.length === 0 && <EmptyState title="Aucune activité" />}
      <Card><ol className="divide-y divide-line">{events.map((e) => <li key={e.id} className="flex items-start gap-3 p-4 text-sm"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-nexus" aria-hidden /><div className="min-w-0 flex-1"><p className="text-night">{e.label}</p><p className="text-xs text-muted">{e.actor} · {fmtDateTime(e.createdAt)}</p></div></li>)}</ol></Card>
      {q.hasNextPage && <div className="text-center"><Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Voir plus</Button></div>}
    </div>
  );
}

/* ---------------- Équipe ---------------- */
export function Team() {
  const { id, overview } = useSpace();
  const navigate = useNavigate();
  const me = JSON.parse(atob(String(getAccessToken()).split(".")[1] ?? "e30=")).sub as string;
  const order = ["CONTACT_ENTREPRISE", "MENTOR", "CHEF_PROJET", "ETUDIANT"];
  const dm = async (userId: string) => { try { const r = await api<{ channel: { id: string } }>(`/projects/${id}/channels`, { method: "POST", body: { type: "DIRECT", userId } }); navigate(`../messages?canal=${r.channel.id}`, { relative: "path" }); } catch (e) { toast.error(e instanceof ApiError ? e.message : "Action impossible."); } };
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...overview.members].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)).map((m) => { const [f = "", ...l] = m.name.split(" "); return (
      <li key={m.userId}><Card><CardBody className="flex items-center gap-3"><Avatar first={f} last={l.join(" ")} size={44} /><div className="min-w-0 flex-1"><p className="truncate font-bold text-night">{m.name}</p><Badge tone={m.role === "MENTOR" ? "amber" : m.role === "CONTACT_ENTREPRISE" ? "blue" : "violet"}>{PROJECT_ROLE_LABELS[m.role as keyof typeof PROJECT_ROLE_LABELS]}</Badge></div>{m.userId !== me && !overview.access.readOnly && <Button size="sm" variant="ghost" onClick={() => void dm(m.userId)} aria-label={`Écrire à ${m.name}`}><MessageCircle className="h-4 w-4" aria-hidden /></Button>}</CardBody></Card></li>); })}</ul>
  );
}

/* ---------------- Rapports hebdomadaires du mentor ---------------- */
interface Rep { id: string; weekStart: string; summary: string; risks: string | null; nextSteps: string | null; health: "VERT" | "ORANGE" | "ROUGE"; visibleToCompany: boolean; visibleToReferent: boolean }
export function Reports() {
  const { id, overview } = useSpace();
  const refresh = useSpaceInvalidate(id);
  const isMentor = overview.access.role === "MENTOR" && !overview.access.readOnly;
  const q = useQuery({ queryKey: ["space", id, "reports"], queryFn: () => api<{ reports: Rep[] }>(`/projects/${id}/reports`), retry: false });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ weekStart: new Date().toISOString().slice(0, 10), summary: "", risks: "", nextSteps: "", health: "VERT" as Rep["health"], visibleToCompany: true, visibleToReferent: true });
  const create = useMutation({ mutationFn: () => api(`/projects/${id}/reports`, { method: "POST", body: { ...f, risks: f.risks || undefined, nextSteps: f.nextSteps || undefined } }), onSuccess: async () => { setOpen(false); await q.refetch(); await refresh(); toast.success("Rapport publié."); }, onError: (e) => toast.error(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.") });
  usePageTitle("Rapports");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">Rapports hebdomadaires rédigés par le mentor, visibles de l'entreprise et du référent académique selon le réglage de chaque rapport.</p>{isMentor && <Button onClick={() => setOpen(!open)}>{open ? "Fermer" : "Nouveau rapport"}</Button>}</div>
      {open && <Card><CardBody><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Semaine du">{(p) => <Input {...p} type="date" value={f.weekStart} onChange={(e) => setF({ ...f, weekStart: e.target.value })} />}</Field><Field label="Appréciation">{(p) => <Select {...p} value={f.health} onChange={(e) => setF({ ...f, health: e.target.value as Rep["health"] })}><option value="VERT">Bonne santé</option><option value="ORANGE">À surveiller</option><option value="ROUGE">En difficulté</option></Select>}</Field></div>
        <Field label="Résumé de la semaine">{(p) => <Textarea {...p} rows={4} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} maxLength={3000} />}</Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Risques" optional>{(p) => <Textarea {...p} rows={3} value={f.risks} onChange={(e) => setF({ ...f, risks: e.target.value })} />}</Field><Field label="Prochaines étapes" optional>{(p) => <Textarea {...p} rows={3} value={f.nextSteps} onChange={(e) => setF({ ...f, nextSteps: e.target.value })} />}</Field></div>
        <div className="flex flex-wrap gap-6"><Checkbox label="Visible de l'entreprise" checked={f.visibleToCompany} onChange={(e) => setF({ ...f, visibleToCompany: e.target.checked })} /><Checkbox label="Visible du référent académique" checked={f.visibleToReferent} onChange={(e) => setF({ ...f, visibleToReferent: e.target.checked })} /></div>
        <Button type="submit" loading={create.isPending} disabled={f.summary.trim().length < 10}>Publier le rapport</Button></form></CardBody></Card>}
      {q.isLoading && <Skeleton className="h-32" />}
      {q.isError && <Alert tone="info">Les rapports du mentor ne sont pas visibles par l'équipe : ils sont destinés à l'entreprise et à l'établissement.</Alert>}
      {q.data?.reports.length === 0 && <EmptyState title="Aucun rapport publié" />}
      {q.data?.reports.map((r) => <Card key={r.id}><CardBody><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base">Semaine du {fmtDay(r.weekStart)}</h2><Badge tone={HEALTH[r.health].tone}>{HEALTH[r.health].label}</Badge></div><p className="mt-2 whitespace-pre-line text-[15px]">{r.summary}</p>{r.risks && <p className="mt-2 text-sm"><strong>Risques :</strong> {r.risks}</p>}{r.nextSteps && <p className="mt-1 text-sm"><strong>Prochaines étapes :</strong> {r.nextSteps}</p>}</CardBody></Card>)}
    </div>
  );
}

/* ---------------- Espace de suivi du mentor ---------------- */
interface MP { id: string; name: string; status: string; progressPct: number; lastActivityAt: string | null; health: "VERT" | "ORANGE" | "ROUGE"; alerts: string[]; lateTasks: number; deliverablesToReview: number; milestonesToValidate: number; lastReportWeek: string | null; team: string[] }
export function MentorProjects() {
  usePageTitle("Projets supervisés");
  const { data, isLoading } = useQuery({ queryKey: ["mentor-projects"], queryFn: () => api<{ projects: MP[] }>("/mentor/projects"), refetchInterval: 60_000 });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl">Projets supervisés</h1>
      {isLoading && <Skeleton className="h-40" />}
      {data?.projects.length === 0 && <EmptyState title="Aucun projet à superviser" >Un administrateur vous affecte à un projet une fois l'équipe validée.</EmptyState>}
      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">{data?.projects.map((p) => (
        <li key={p.id}><Card className="h-full"><CardBody>
          <div className="flex items-start justify-between gap-3"><Link to={`/app/projets/${p.id}`} className="text-lg font-bold text-night hover:text-nexus hover:underline">{p.name}</Link><Badge tone={HEALTH[p.health].tone}>{HEALTH[p.health].label}</Badge></div>
          <p className="mt-1 text-sm text-muted">Équipe : {p.team.join(", ") || "—"} · activité {p.lastActivityAt ? fmtRelative(p.lastActivityAt) : "—"}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={p.progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progression de ${p.name}`}><div className="h-full rounded-full bg-gradient-to-r from-nexus to-impact" style={{ width: `${p.progressPct}%` }} /></div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded bg-cloud p-2"><dd className="text-lg font-extrabold text-night">{p.lateTasks}</dd><dt className="text-muted">tâches en retard</dt></div><div className="rounded bg-cloud p-2"><dd className="text-lg font-extrabold text-night">{p.deliverablesToReview}</dd><dt className="text-muted">livrables à relire</dt></div><div className="rounded bg-cloud p-2"><dd className="text-lg font-extrabold text-night">{p.milestonesToValidate}</dd><dt className="text-muted">jalons à valider</dt></div></dl>
          {p.alerts.length > 0 && <ul className="mt-3 space-y-1 text-sm text-amber-text">{p.alerts.map((a) => <li key={a}>⚠ {a}</li>)}</ul>}
          <div className="mt-4 flex flex-wrap gap-2"><Button asChild size="sm"><Link to={`/app/projets/${p.id}/taches`}>Suivre les tâches</Link></Button><Button asChild size="sm" variant="secondary"><Link to={`/app/projets/${p.id}/livrables`}>Livrables</Link></Button><Button asChild size="sm" variant="ghost"><Link to={`/app/projets/${p.id}/rapports`}>Rapports</Link></Button></div>
        </CardBody></Card></li>))}</ul>
    </div>
  );
}

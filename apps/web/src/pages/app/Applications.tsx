import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { APPLICATION_STATUS_LABELS, TEAM_MEMBER_STATUS_LABELS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { STEP_LABELS, STEP_STATUS_LABELS, timeLeft } from "@/lib/challenges";
import { formatDate } from "@/lib/format";

interface Invitation { id: string; status: keyof typeof TEAM_MEMBER_STATUS_LABELS; deadlineAt: string; respondedAt: string | null; isLead: boolean; teamStatus: string; steps: { step: keyof typeof STEP_LABELS; status: string }[]; hasProject: boolean; challenge: { id: string; title: string; durationWeeks: number | null; company: string }; teamSize: number }
interface App { id: string; status: keyof typeof APPLICATION_STATUS_LABELS; createdAt: string; challenge: { id: string; title: string; slug: string; status: string; company: string } }

export default function Applications() {
  usePageTitle("Candidatures");
  const qc = useQueryClient();
  const inv = useQuery({ queryKey: ["invitations"], queryFn: () => api<{ invitations: Invitation[] }>("/applications/invitations"), refetchInterval: 60_000 });
  const apps = useQuery({ queryKey: ["applications"], queryFn: () => api<{ applications: App[] }>("/applications") });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => api(`/applications/invitations/${id}/respond`, { method: "POST", body: { accept } }),
    onSuccess: async (_d, v) => { toast.success(v.accept ? "Participation confirmée." : "Invitation déclinée."); await Promise.all([qc.invalidateQueries({ queryKey: ["invitations"] }), qc.invalidateQueries({ queryKey: ["applications"] })]); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action impossible."),
  });
  const withdraw = useMutation({ mutationFn: (id: string) => api(`/applications/${id}`, { method: "DELETE" }), onSuccess: async () => { toast.success("Candidature retirée."); await qc.invalidateQueries({ queryKey: ["applications"] }); }, onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action impossible.") });
  const pending = inv.data?.invitations.filter((i) => i.status === "INVITE" && i.teamStatus === "EN_VALIDATION") ?? [];
  const history = inv.data?.invitations.filter((i) => !(i.status === "INVITE" && i.teamStatus === "EN_VALIDATION")) ?? [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl sm:text-3xl">Candidatures</h1>
      <section aria-labelledby="inv-h" className="space-y-4">
        <h2 id="inv-h" className="text-xl">Propositions d'équipe à confirmer {pending.length > 0 && <Badge tone="amber">{pending.length}</Badge>}</h2>
        {inv.isLoading && <Skeleton className="h-28" />}
        {inv.data && pending.length === 0 && <p className="rounded-md border border-dashed border-slate-300 bg-white/60 p-5 text-sm text-muted">Aucune proposition en attente. Une entreprise peut vous proposer pour un défi grâce à NexMatch : vous serez prévenu par notification et par e-mail.</p>}
        {pending.map((i) => (
          <Card key={i.id} className="border-amber-300"><CardBody>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg">{i.challenge.title}</h3><p className="text-sm text-muted">{i.challenge.company}{i.challenge.durationWeeks ? ` · ${i.challenge.durationWeeks} semaines` : ""} · équipe de {i.teamSize}{i.isLead ? " · vous êtes proposé(e) comme chef de projet" : ""}</p></div><Badge tone="amber"><Clock className="h-3.5 w-3.5" aria-hidden />Répondre sous {timeLeft(i.deadlineAt)}</Badge></div>
            <ol className="mt-4 flex flex-wrap gap-2 text-xs">{i.steps.filter((s) => s.status !== "NON_REQUIS").map((s) => <li key={s.step}><Badge tone={s.status === "VALIDE" ? "green" : "neutral"}>{STEP_LABELS[s.step]} : {STEP_STATUS_LABELS[s.status]}</Badge></li>)}</ol>
            <div className="mt-5 flex flex-wrap gap-3"><Button loading={respond.isPending && respond.variables?.id === i.id && respond.variables.accept} onClick={() => respond.mutate({ id: i.id, accept: true })}>Accepter</Button><Button variant="secondary" disabled={respond.isPending} onClick={() => { if (confirm("Décliner cette proposition ? Le suivant du classement sera sollicité.")) respond.mutate({ id: i.id, accept: false }); }}>Décliner</Button></div>
          </CardBody></Card>
        ))}
      </section>

      <section aria-labelledby="apps-h" className="space-y-4">
        <h2 id="apps-h" className="text-xl">Mes candidatures</h2>
        {apps.isLoading && <Skeleton className="h-24" />}
        {apps.data && apps.data.applications.length === 0 && <EmptyState icon={<Inbox className="h-6 w-6" />} title="Aucune candidature" action={<Button asChild><Link to="/projets">Découvrir les défis</Link></Button>}>Candidatez librement aux défis publiés qui vous intéressent.</EmptyState>}
        {apps.data && apps.data.applications.length > 0 && <Card><ul className="divide-y divide-line">{apps.data.applications.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 p-4 text-sm"><div className="min-w-0 flex-1"><Link to={`/projets/${a.challenge.slug}`} className="font-semibold text-night hover:text-nexus hover:underline">{a.challenge.title}</Link><p className="text-muted">{a.challenge.company} · envoyée le {formatDate(a.createdAt)}</p></div><Badge tone={a.status === "ACCEPTEE" ? "green" : a.status === "REFUSEE" || a.status === "RETIREE" ? "red" : "blue"}>{APPLICATION_STATUS_LABELS[a.status]}</Badge>{(a.status === "SOUMISE" || a.status === "PRE_SELECTIONNEE") && <Button size="sm" variant="ghost" onClick={() => { if (confirm("Retirer cette candidature ?")) withdraw.mutate(a.id); }}>Retirer</Button>}</li>))}</ul></Card>}
      </section>

      {history.length > 0 && <section aria-labelledby="hist-h" className="space-y-3"><h2 id="hist-h" className="text-xl">Historique des propositions</h2><Card><ul className="divide-y divide-line">{history.map((i) => <li key={i.id} className="flex flex-wrap items-center gap-3 p-4 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold text-night">{i.challenge.title}</p><p className="text-muted">{i.challenge.company}</p></div><Badge tone={i.status === "ACCEPTE" ? "green" : "red"}>{TEAM_MEMBER_STATUS_LABELS[i.status]}</Badge>{i.status === "ACCEPTE" && i.teamStatus === "EN_VALIDATION" && <Alert tone="info" className="basis-full">En attente de la validation des autres parties (équipe, entreprise, établissement).</Alert>}{i.hasProject && <Link to="/app/projets" className="font-semibold text-nexus hover:underline">Ouvrir mes projets</Link>}</li>)}</ul></Card></section>}
    </div>
  );
}

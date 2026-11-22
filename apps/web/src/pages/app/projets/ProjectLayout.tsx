import { Wifi, WifiOff } from "lucide-react";
import { NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import { PROJECT_ROLE_LABELS } from "@nexbridge/shared";
import { Alert, Badge, Progress, Skeleton } from "@/components/ui/misc";
import { ReportButton } from "@/components/ReportButton";
import { AvatarStack, HEALTH } from "@/components/space/bits";
import { usePageTitle } from "@/hooks/usePageTitle";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useOverview, useProjectSocket, type Overview } from "@/lib/space";

export interface SpaceCtx { id: string; overview: Overview; connected: boolean }
export const useSpace = () => useOutletContext<SpaceCtx>();

const TABS = [
  { to: "", label: "Aperçu", end: true }, { to: "taches", label: "Tâches" }, { to: "jalons", label: "Jalons" }, { to: "documents", label: "Documents" }, { to: "messages", label: "Messagerie" },
  { to: "livrables", label: "Livrables" }, { to: "reunions", label: "Réunions" }, { to: "activite", label: "Activité" }, { to: "equipe", label: "Équipe" }, { to: "rapports", label: "Rapports" }, { to: "evaluation", label: "Évaluation" }, { to: "paiement", label: "Paiement" },
];

export default function ProjectLayout() {
  const { id = "" } = useParams();
  const { data, isLoading, error } = useOverview(id);
  const connected = useProjectSocket(id);
  usePageTitle(data?.project.name);
  if (error instanceof ApiError && error.status === 404) return <Alert tone="error" title="Projet introuvable">Ce projet n'existe pas ou vous n'y avez pas accès.</Alert>;
  if (isLoading || !data) return <div className="space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-6 w-1/2" /><Skeleton className="h-64" /></div>;
  const { project: p, access } = data;
  const h = HEALTH[data.health];
  const tabs = TABS.filter((t) => (t.to !== "rapports" || access.role !== "ETUDIANT" && access.role !== "CHEF_PROJET") && (t.to !== "paiement" || access.role === "CONTACT_ENTREPRISE" || access.role === "ADMIN"));
  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-2xl sm:text-3xl">{p.name}</h1><p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">{p.challenge.sector?.name}<Badge tone="blue">{({ EN_COURS: "En cours", EN_EVALUATION: "En évaluation", TERMINE: "Terminé", ANNULE: "Annulé" } as Record<string, string>)[p.status] ?? p.status}</Badge><Badge tone={h.tone}>{h.label}</Badge><Badge>{PROJECT_ROLE_LABELS[access.role as keyof typeof PROJECT_ROLE_LABELS] ?? "Administrateur"}{access.readOnly ? " · lecture seule" : ""}</Badge></p></div>
          <div className="flex items-center gap-3"><ReportButton targetType="PROJECT" targetId={id} /><AvatarStack names={data.members.map((m) => m.name)} max={5} /><span className={cn("inline-flex items-center gap-1 text-xs", connected ? "text-emerald-700" : "text-muted")} title={connected ? "Mises à jour en direct" : "Actualisation périodique"}>{connected ? <Wifi className="h-3.5 w-3.5" aria-hidden /> : <WifiOff className="h-3.5 w-3.5" aria-hidden />}<span className="sr-only">{connected ? "Temps réel actif" : "Temps réel inactif"}</span></span></div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Progress value={p.progressPct} label="Progression du projet" className="min-w-[8rem] max-w-md flex-1" /><span className="whitespace-nowrap text-sm font-bold text-night">{p.progressPct} %</span><span className="whitespace-nowrap text-xs text-muted">{data.counts.TERMINE}/{data.counts.total} tâches terminées</span></div>
      </header>
      <nav aria-label="Sections du projet" className="-mx-1 overflow-x-auto border-b border-line"><ul className="flex min-w-max gap-1 px-1">{tabs.map((t) => <li key={t.to}><NavLink to={t.to} end={t.end} className={({ isActive }) => cn("-mb-px block whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-semibold", isActive ? "border-nexus text-nexus" : "border-transparent text-muted hover:text-night")}>{t.label}</NavLink></li>)}</ul></nav>
      <Outlet context={{ id, overview: data, connected } satisfies SpaceCtx} />
    </div>
  );
}

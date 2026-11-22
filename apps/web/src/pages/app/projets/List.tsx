import { useQuery } from "@tanstack/react-query";
import { FolderKanban } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, EmptyState, Progress, Skeleton } from "@/components/ui/misc";
import { AvatarStack } from "@/components/space/bits";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import { fmtRelative } from "@/lib/dates";
import { useAuth } from "@/stores/auth";

interface P { id: string; name: string; status: string; progressPct: number; lastActivityAt: string | null; sector: string | null; lateTasks: number; members: { name: string; role: string }[] }

export default function ProjectsList() {
  usePageTitle("Projets");
  const user = useAuth((s) => s.user)!;
  const { data, isLoading } = useQuery({ queryKey: ["my-projects"], queryFn: () => api<{ projects: P[] }>("/projects") });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl">Projets</h1>
      {isLoading && <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>}
      {data && data.projects.length === 0 && <EmptyState icon={<FolderKanban className="h-6 w-6" />} title="Aucun projet pour l'instant" action={<Button asChild><Link to={user.role === "ENTREPRISE" ? "/app/defis" : "/projets"}>{user.role === "ENTREPRISE" ? "Mes défis" : "Découvrir les défis"}</Link></Button>}>Un projet est créé dès qu'une équipe est validée : son espace de travail apparaît ici.</EmptyState>}
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">{data?.projects.map((p) => (
        <li key={p.id}><Link to={`/app/projets/${p.id}`} className="block h-full rounded-lg"><Card className="h-full transition-shadow hover:shadow-pop"><CardBody>
          <div className="flex items-start justify-between gap-3"><h2 className="text-lg">{p.name}</h2><Badge tone="blue">{p.status === "EN_COURS" ? "En cours" : p.status}</Badge></div>
          <p className="mt-1 text-sm text-muted">{p.sector ?? "—"}{p.lastActivityAt ? ` · activité ${fmtRelative(p.lastActivityAt)}` : ""}</p>
          <div className="mt-4 flex items-center gap-3"><Progress value={p.progressPct} label={`Progression de ${p.name}`} /><span className="text-sm font-bold text-night">{p.progressPct} %</span></div>
          <div className="mt-4 flex items-center justify-between"><AvatarStack names={p.members.map((m) => m.name)} max={5} />{p.lateTasks > 0 && <Badge tone="red">{p.lateTasks} tâche(s) en retard</Badge>}</div>
        </CardBody></Card></Link></li>))}</ul>
    </div>
  );
}

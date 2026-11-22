import { useQuery } from "@tanstack/react-query";
import { Award, Briefcase, FolderKanban, GraduationCap, Smile, Star, Target, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { CHALLENGE_STATUS_LABELS, type ChallengeStatus } from "@nexbridge/shared";
import { BarList, Donut, Radar } from "@/components/charts";
import { Badge, Card, CardBody, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { fmtRelative } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@nexbridge/shared";

/* eslint-disable @typescript-eslint/no-explicit-any */
const Kpi = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) => (
  <Card><CardBody><div className="flex flex-col items-start gap-2 text-muted sm:flex-row sm:items-center sm:gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-nexus" aria-hidden>{icon}</span><span className="min-h-[2.5em] text-[13px] font-semibold leading-tight sm:min-h-0 sm:text-sm">{label}</span></div><p className="mt-2 text-2xl font-extrabold text-night sm:mt-3 sm:text-3xl">{value}</p>{hint && <p className="mt-1 text-xs text-muted">{hint}</p>}</CardBody></Card>
);
const STATUS_COLOR: Record<string, string> = { BROUILLON: "#94A3B8", EN_REVISION: "#F59E0B", PUBLIE: "#14B8A6", EN_COURS: "#0B5FFF", CLOTURE: "#8B5CF6", ARCHIVE: "#CBD5E1" };

/** NexDash : indicateurs issus des données réelles (voir docs). « — » = donnée non disponible, jamais une valeur par défaut inventée. */
export function NexDash({ role }: { role: Role }) {
  const { data: d, isLoading } = useQuery({ queryKey: ["dash", role], queryFn: () => api<any>("/dashboards/me"), refetchInterval: 120_000 });
  if (isLoading || !d) return <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;

  if (role === "ENTREPRISE" && !d.empty) {
    const cs = d.challengesByStatus as Record<string, number>;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
          <Kpi icon={<Briefcase className="h-5 w-5" />} label="Défis publiés" value={cs.PUBLIE ?? 0} />
          <Kpi icon={<FolderKanban className="h-5 w-5" />} label="Projets actifs" value={d.projects.active} hint={`${d.projects.finished} terminé(s)`} />
          <Kpi icon={<Target className="h-5 w-5" />} label="Progression moyenne" value={d.projects.avgProgress != null ? `${d.projects.avgProgress} %` : "—"} />
          <Kpi icon={<Smile className="h-5 w-5" />} label="Satisfaction des équipes" value={d.satisfaction.average != null ? `${d.satisfaction.average}/5` : "—"} hint={d.satisfaction.responses ? `${d.satisfaction.responses} avis` : "Aucun avis pour l'instant"} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card><CardBody><h3 className="text-base">Vos défis par statut</h3><div className="mt-4"><Donut items={Object.entries(cs).map(([k, v]) => ({ label: CHALLENGE_STATUS_LABELS[k as ChallengeStatus] ?? k, value: v as number, color: STATUS_COLOR[k] ?? "#94A3B8" }))} /></div></CardBody></Card>
          <Card><CardBody><h3 className="text-base">Progression des projets actifs</h3>{d.projects.list.length === 0 ? <p className="mt-3 text-sm text-muted">Aucun projet actif.</p> : <div className="mt-4"><BarList total={100} items={d.projects.list.map((p: any) => ({ label: p.name, value: p.progressPct }))} /></div>}</CardBody></Card>
          <Card><CardBody><h3 className="text-base">Budget engagé</h3>{Object.keys(d.budgetsEngaged).length === 0 ? <p className="mt-3 text-sm text-muted">Aucun projet lancé.</p> : <ul className="mt-3 space-y-1">{Object.entries(d.budgetsEngaged).map(([cur, v]) => <li key={cur} className="text-2xl font-extrabold text-night">{formatNumber(v as number)} <span className="text-base font-semibold text-muted">{cur === "XOF" ? "FCFA" : cur}</span></li>)}</ul>}<p className="mt-2 text-xs text-muted">Budgets des projets lancés. Aucune transaction : les paiements arrivent en phase 5.</p><p className="mt-3 text-sm text-muted">Livrables validés : <strong className="text-night">{d.deliverables.validated}/{d.deliverables.total}</strong></p></CardBody></Card>
          <Card><CardBody><h3 className="text-base">Dernières activités</h3>{d.activity.length === 0 ? <p className="mt-3 text-sm text-muted">Aucune activité.</p> : <ul className="mt-3 space-y-2 text-sm">{d.activity.map((a: any) => <li key={a.id}><Link to={`/app/projets/${a.projectId}/activite`} className="text-night hover:text-nexus hover:underline">{a.label}</Link> <span className="text-xs text-muted">· {fmtRelative(a.createdAt)}</span></li>)}</ul>}</CardBody></Card>
        </div>
      </div>
    );
  }
  if (role === "ETUDIANT") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
          <Kpi icon={<FolderKanban className="h-5 w-5" />} label="Projets actifs" value={d.activeProjects.length} hint={`${d.completedProjects} terminé(s)`} />
          <Kpi icon={<Award className="h-5 w-5" />} label="Badges" value={d.badges} hint={`${d.certifications} certification(s)`} />
          <Kpi icon={<Star className="h-5 w-5" />} label="Indice de fiabilité" value={d.reliabilityIndex ?? "—"} hint={d.reliabilityIndex == null ? "Après votre premier projet évalué" : "sur 5"} />
          <Kpi icon={<GraduationCap className="h-5 w-5" />} label="Crédits validés" value={d.credits} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card><CardBody><div className="flex items-center justify-between"><h3 className="text-base">Compétences par catégorie</h3><Link to="/app/badges" className="text-sm font-semibold text-nexus hover:underline">Détails</Link></div><div className="mt-2"><Radar data={d.radar} size={240} /></div></CardBody></Card>
          <div className="space-y-6">
            <Card><CardBody><h3 className="text-base">Projets en cours</h3>{d.activeProjects.length === 0 ? <p className="mt-3 text-sm text-muted">Aucun projet en cours.</p> : <ul className="mt-3 space-y-3">{d.activeProjects.map((p: any) => <li key={p.id}><Link to={`/app/projets/${p.id}`} className="text-sm font-semibold text-night hover:text-nexus hover:underline">{p.name}</Link><div className="mt-1"><BarList total={100} items={[{ label: "Progression", value: p.progressPct }]} /></div></li>)}</ul>}</CardBody></Card>
            <Card><CardBody><h3 className="text-base">Opportunités recommandées</h3>{d.recommended.length === 0 ? <p className="mt-3 text-sm text-muted">Aucun défi publié pour l'instant.</p> : <ul className="mt-3 space-y-2.5">{d.recommended.map((r: any) => <li key={r.id} className="flex items-center justify-between gap-3 text-sm"><Link to={`/projets/${r.slug}`} className="min-w-0 truncate font-semibold text-night hover:text-nexus hover:underline">{r.title}<span className="block truncate text-xs font-normal text-muted">{r.company}</span></Link><Badge tone={r.score >= 60 ? "green" : "neutral"}>{r.score}/100</Badge></li>)}</ul>}<p className="mt-2 text-xs text-muted">Score de correspondance calculé par NexMatch avec votre profil.</p></CardBody></Card>
          </div>
        </div>
      </div>
    );
  }
  if (role === "MENTOR") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
          <Kpi icon={<FolderKanban className="h-5 w-5" />} label="Projets supervisés" value={d.supervised.active} hint={`${d.supervised.finished} terminé(s)`} />
          <Kpi icon={<Target className="h-5 w-5" />} label="Progression moyenne" value={d.avgProgress != null ? `${d.avgProgress} %` : "—"} />
          <Kpi icon={<Users className="h-5 w-5" />} label="Projets en alerte" value={d.alertsCount} hint={`${d.deliverablesToReview} livrable(s) à relire`} />
          <Kpi icon={<Star className="h-5 w-5" />} label="Évaluations reçues" value={d.evaluationsReceived.average != null ? `${d.evaluationsReceived.average}/5` : "—"} hint={`${d.evaluationsReceived.count} avis`} />
        </div>
        <Card><CardBody><div className="flex items-center justify-between"><h3 className="text-base">Mes projets</h3><Link to="/app/mentor/projets" className="text-sm font-semibold text-nexus hover:underline">Espace de suivi</Link></div>{d.projects.length === 0 ? <p className="mt-3 text-sm text-muted">Aucun projet affecté.</p> : <div className="mt-4"><BarList total={100} items={d.projects.map((p: any) => ({ label: p.name, value: p.progressPct }))} /></div>}</CardBody></Card>
      </div>
    );
  }
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    const PS: Record<string, string> = { EN_COURS: "En cours", EN_EVALUATION: "En évaluation", TERMINE: "Terminé", ANNULE: "Annulé" };
    const pct = (v: number | null) => (v == null ? "—" : `${v} %`);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
          <Kpi icon={<Target className="h-5 w-5" />} label="Taux de matching" value={pct(d.matchingRate)} hint={d.matchingNote} />
          <Kpi icon={<FolderKanban className="h-5 w-5" />} label="Taux de complétion" value={pct(d.completionRate)} hint={d.completionNote} />
          <Kpi icon={<Smile className="h-5 w-5" />} label="Satisfaction étudiants" value={d.nps.average != null ? `${d.nps.average}/5` : "—"} hint={d.nps.responses ? `${d.nps.responses} avis` : "Aucun avis pour l'instant"} />
          <Kpi icon={<Briefcase className="h-5 w-5" />} label="Chiffre d'affaires" value="—" hint={d.revenueNote} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card><CardBody><h3 className="text-base">Utilisateurs par rôle</h3><div className="mt-4"><BarList total={Math.max(1, ...Object.values(d.usersByRole as Record<string, number>))} items={Object.entries(d.usersByRole as Record<string, number>).map(([k, v]) => ({ label: ROLE_LABELS[k as Role] ?? k, value: v }))} /></div></CardBody></Card>
          <Card><CardBody><h3 className="text-base">Défis par statut</h3><div className="mt-4"><Donut items={Object.entries(d.challengesByStatus as Record<string, number>).map(([k, v]) => ({ label: CHALLENGE_STATUS_LABELS[k as ChallengeStatus] ?? k, value: v, color: STATUS_COLOR[k] ?? "#94A3B8" }))} /></div></CardBody></Card>
          <Card><CardBody><h3 className="text-base">Projets par statut</h3><div className="mt-4"><Donut items={Object.entries(d.projectsByStatus as Record<string, number>).map(([k, v], i) => ({ label: PS[k] ?? k, value: v, color: ["#0B5FFF", "#F59E0B", "#14B8A6", "#94A3B8"][i % 4]! }))} /></div></CardBody></Card>
          <Card><CardBody><h3 className="text-base">À traiter</h3><ul className="mt-3 space-y-2 text-sm"><li className="flex justify-between"><Link className="font-semibold text-nexus hover:underline" to="/app/admin/moderation">Signalements ouverts</Link><span className="font-bold tabular-nums">{d.queues.reports}</span></li><li className="flex justify-between"><Link className="font-semibold text-nexus hover:underline" to="/app/admin/contenus">Messages de contact non traités</Link><span className="font-bold tabular-nums">{d.queues.contact}</span></li><li className="flex justify-between"><span>Validations de crédits en attente (référents)</span><span className="font-bold tabular-nums">{d.queues.credits}</span></li></ul></CardBody></Card>
        </div>
      </div>
    );
  }
  return null;
}

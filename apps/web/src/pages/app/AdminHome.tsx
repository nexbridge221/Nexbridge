import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Briefcase, ClipboardList, FolderKanban, GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardBody, Skeleton } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { NexDash } from "@/components/NexDash";
import { downloadCsv } from "@/pages/app/admin/AdminUsers";
import { useAuth } from "@/stores/auth";

interface Overview { queues: { kyc: number; challengesToReview: number; institutionsPending: number; projectsWithoutMentor: number }; totals: { users: number; companies: number; publishedChallenges: number; activeProjects: number } }

export default function AdminHome() {
  usePageTitle("Pilotage");
  const user = useAuth((s) => s.user)!;
  const { data, isLoading } = useQuery({ queryKey: ["admin-overview"], queryFn: () => api<Overview>("/admin/overview"), refetchInterval: 60_000 });
  const queues = data ? [
    { n: "Défis à valider", v: data.queues.challengesToReview, to: "/app/admin/defis", Icon: ClipboardList },
    { n: "Organisations à valider (KYC)", v: data.queues.kyc, to: "/app/admin/organisations", Icon: Briefcase },
    { n: "Établissements à valider", v: data.queues.institutionsPending, to: "/app/admin/organisations", Icon: GraduationCap },
    { n: "Projets sans mentor", v: data.queues.projectsWithoutMentor, to: "/app/admin/projets", Icon: FolderKanban },
  ] : [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl">Pilotage de la plateforme</h1>
      <section aria-labelledby="q-h"><h2 id="q-h" className="mb-3 text-lg">Files de validation</h2>
        {isLoading && <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">{queues.map((q) => (
          <li key={q.n}><Link to={q.to} className="block h-full rounded-lg focus-visible:outline-offset-4"><Card className="h-full transition-shadow hover:shadow-pop"><CardBody><div className="flex flex-col items-start gap-2 text-muted sm:flex-row sm:items-center sm:gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-nexus" aria-hidden><q.Icon className="h-5 w-5" /></span><span className="min-h-[2.5em] text-[13px] font-semibold leading-tight sm:min-h-0 sm:text-sm">{q.n}</span></div><p className="mt-2 flex items-end justify-between text-3xl font-extrabold text-night sm:mt-3 sm:text-4xl">{q.v}<ArrowRight className="mb-1 h-5 w-5 text-nexus" aria-hidden /></p></CardBody></Card></Link></li>))}</ul>
      </section>
      {data && <section aria-labelledby="t-h"><h2 id="t-h" className="mb-3 text-lg">Plateforme (données réelles)</h2><div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">{[["Utilisateurs", data.totals.users], ["Organisations", data.totals.companies], ["Défis publiés", data.totals.publishedChallenges], ["Projets actifs", data.totals.activeProjects]].map(([l, v]) => <Card key={l as string}><CardBody><p className="text-[13px] font-semibold leading-tight text-muted sm:text-sm">{l}</p><p className="mt-1 text-2xl font-extrabold text-night sm:text-3xl">{v}</p></CardBody></Card>)}</div></section>}
      <NexDash role={user.role} />
      <Card><CardBody><h2 className="text-lg">Exports (CSV)</h2><p className="mt-1 text-sm text-muted">Chaque export est inscrit au journal d'audit.</p><div className="mt-3 flex flex-wrap gap-2">{([["users", "Utilisateurs"], ["challenges", "Défis"], ["projects", "Projets"], ["evaluations", "Évaluations"]] as const).map(([k, l]) => <Button key={k} variant="secondary" size="sm" onClick={() => void downloadCsv(k)}>{l}</Button>)}</div></CardBody></Card>
    </div>
  );
}

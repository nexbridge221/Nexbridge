import { useQuery } from "@tanstack/react-query";
import { FilePlus2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { CHALLENGE_STATUS_LABELS, type ChallengeStatus } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import { STATUS_TONE } from "@/lib/challenges";
import { formatDate } from "@/lib/format";
import { useMe } from "@/lib/me";

interface Row { id: string; title: string; status: ChallengeStatus; sector: string | null; teamSize: number; durationWeeks: number | null; budgetAmount: number | null; budgetCurrency: string; updatedAt: string; applications: number; rejectionReason: string | null; project: { id: string; status: string } | null }

export default function ChallengesList() {
  usePageTitle("Mes défis");
  const { data, isLoading, isError } = useQuery({ queryKey: ["my-challenges"], queryFn: () => api<{ challenges: Row[] }>("/challenges") });
  const { data: me } = useMe();
  const kyc = me?.company?.kycStatus;
  const groups: { key: string; label: string; statuses: ChallengeStatus[] }[] = [
    { key: "draft", label: "Brouillons et en révision", statuses: ["BROUILLON", "EN_REVISION"] }, { key: "pub", label: "Publiés", statuses: ["PUBLIE"] }, { key: "run", label: "En cours", statuses: ["EN_COURS"] }, { key: "done", label: "Clôturés et archivés", statuses: ["CLOTURE", "ARCHIVE"] },
  ];
  const kpi = (s: ChallengeStatus[]) => data?.challenges.filter((c) => s.includes(c.status)).length ?? 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl sm:text-3xl">Mes défis</h1><Button asChild><Link to="/app/defis/nouveau"><FilePlus2 className="h-4 w-4" aria-hidden />Déposer un défi</Link></Button></div>
      {kyc && kyc !== "VALIDE" && <Alert tone="warning" title="Organisation non validée" action={<Button asChild size="sm" variant="secondary"><Link to="/app/organisation">Gérer la validation</Link></Button>}>Vous pouvez préparer des brouillons, mais la soumission est possible une fois votre organisation validée.</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {groups.map((g) => <Card key={g.key}><CardBody><p className="text-[13px] font-semibold leading-tight text-muted sm:text-sm">{g.label}</p><p className="mt-2 text-2xl font-extrabold text-night sm:text-3xl">{isLoading ? "—" : kpi(g.statuses)}</p></CardBody></Card>)}
      </div>
      {isLoading && <Skeleton className="h-40" />}
      {isError && <Alert tone="error">Impossible de charger vos défis.</Alert>}
      {data && data.challenges.length === 0 && <EmptyState icon={<FilePlus2 className="h-6 w-6" />} title="Aucun défi pour l'instant" action={<Button asChild><Link to="/app/defis/nouveau">Déposer mon premier défi</Link></Button>}>L'assistant NexBrief vous guide en cinq étapes, avec des modèles par secteur.</EmptyState>}
      {data && data.challenges.length > 0 && (
        <Card className="overflow-x-auto"><table className="block w-full text-left text-sm sm:table sm:min-w-[640px]">
          <caption className="sr-only">Liste de vos défis</caption>
          <thead className="hidden border-b border-line text-muted sm:table-header-group"><tr><th scope="col" className="p-4 font-semibold">Défi</th><th scope="col" className="p-4 font-semibold">Statut</th><th scope="col" className="p-4 font-semibold">Candidatures</th><th scope="col" className="p-4 font-semibold">Mis à jour</th></tr></thead>
          <tbody className="block divide-y divide-line sm:table-row-group">{data.challenges.map((c) => (
            <tr key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-cloud/60 sm:table-row sm:p-0">
              <td className="block w-full p-0 sm:table-cell sm:w-auto sm:p-4"><Link to={c.status === "BROUILLON" ? `/app/defis/${c.id}/modifier` : `/app/defis/${c.id}`} className="font-semibold text-night hover:text-nexus hover:underline">{c.title}</Link><p className="text-xs text-muted">{[c.sector, c.durationWeeks ? `${c.durationWeeks} sem.` : null, `${c.teamSize} étudiants`].filter(Boolean).join(" · ")}</p>{c.status === "BROUILLON" && c.rejectionReason && <p className="mt-1 text-xs font-medium text-red-700">Refusé : {c.rejectionReason}</p>}</td>
              <td className="block p-0 sm:table-cell sm:p-4"><Badge tone={STATUS_TONE[c.status]}>{CHALLENGE_STATUS_LABELS[c.status]}</Badge></td>
              <td className="block p-0 sm:table-cell sm:p-4"><span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-muted" aria-hidden />{c.applications}</span></td>
              <td className="block p-0 text-xs text-muted sm:table-cell sm:p-4 sm:text-sm">{formatDate(c.updatedAt)}</td>
            </tr>))}</tbody></table></Card>
      )}
    </div>
  );
}

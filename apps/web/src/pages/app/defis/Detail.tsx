import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CHALLENGE_STATUS_LABELS, DELIVERABLE_FORMAT_LABELS, SKILL_LEVEL_LABELS, APPLICATION_STATUS_LABELS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { ReportButton } from "@/components/ReportButton";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { STATUS_TONE, type ChallengeDraft, type StudentCard } from "@/lib/challenges";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import NexMatchPanel from "./NexMatchPanel";

type Tab = "apercu" | "candidatures" | "nexmatch";

export default function ChallengeDetail() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const tab: Tab = location.pathname.endsWith("/nexmatch") ? "nexmatch" : ((sp.get("onglet") as Tab) ?? "apercu");
  const { data, isLoading, error } = useQuery({ queryKey: ["challenge", id], queryFn: () => api<{ challenge: ChallengeDraft }>(`/challenges/${id}`) });
  usePageTitle(data?.challenge.title);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const close = useMutation({ mutationFn: () => api(`/challenges/${id}/close`, { method: "POST", body: { reason } }), onSuccess: async () => { setCloseOpen(false); toast.success("Défi clôturé."); await qc.invalidateQueries({ queryKey: ["challenge", id] }); await qc.invalidateQueries({ queryKey: ["my-challenges"] }); }, onError: (e) => toast.error(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Clôture impossible.") });
  const apps = useQuery({ queryKey: ["challenge-apps", id], enabled: tab === "candidatures", queryFn: () => api<{ applications: { id: string; status: keyof typeof APPLICATION_STATUS_LABELS; motivation: string | null; createdAt: string; student: StudentCard | null; score: number | null }[] }>(`/challenges/${id}/applications`) });

  if (error instanceof ApiError && error.status === 404) return <Alert tone="error">Ce défi est introuvable.</Alert>;
  if (isLoading || !data) return <div className="space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64" /></div>;
  const c = data.challenge;
  const tabs: { k: Tab; label: string }[] = [{ k: "apercu", label: "Aperçu" }, { k: "candidatures", label: `Candidatures (${c.applications ?? 0})` }, { k: "nexmatch", label: "NexMatch et équipe" }];
  const go = (k: Tab) => { if (k === "nexmatch") navigate(`/app/defis/${id}/nexmatch`); else { navigate(`/app/defis/${id}`); setSp(k === "apercu" ? {} : { onglet: k }, { replace: true }); } };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Link to="/app/defis" className="text-sm font-semibold text-nexus hover:underline">← Mes défis</Link><h1 className="mt-1 text-2xl sm:text-3xl">{c.title || "Défi sans titre"}</h1><div className="mt-2 flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[c.status]}>{CHALLENGE_STATUS_LABELS[c.status]}</Badge>{c.sector && <Badge tone="blue">{c.sector.name}</Badge>}</div></div>
        <div className="flex flex-wrap gap-2">
          <ReportButton targetType="CHALLENGE" targetId={id} />
          {(c.status === "BROUILLON" || c.status === "EN_REVISION") && <Button asChild variant="secondary"><Link to={`/app/defis/${id}/modifier`}><Pencil className="h-4 w-4" aria-hidden />Modifier</Link></Button>}
          {c.status === "PUBLIE" && <Button variant="ghost" onClick={() => setCloseOpen(true)}>Clôturer le défi</Button>}
        </div>
      </div>
      {c.status === "EN_REVISION" && <Alert tone="info" title="En cours de révision">L'équipe NEXBRIDGE relit votre brief. Vous serez prévenu par notification et par e-mail.</Alert>}
      {c.status === "BROUILLON" && c.rejectionReason && <Alert tone="error" title="Modifications demandées">{c.rejectionReason}</Alert>}

      <div role="tablist" aria-label="Sections du défi" className="flex gap-1 overflow-x-auto border-b border-line">{tabs.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => go(t.k)} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold", tab === t.k ? "border-nexus text-nexus" : "border-transparent text-muted hover:text-night")}>{t.label}</button>)}</div>

      {tab === "apercu" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <Card><CardBody className="space-y-5">
            <section><h2 className="text-lg">Contexte</h2><p className="mt-1 whitespace-pre-line text-[15px] leading-7">{c.context || "—"}</p></section>
            {c.objectives && <section><h2 className="text-lg">Objectifs</h2><p className="mt-1 whitespace-pre-line text-[15px] leading-7">{c.objectives}</p></section>}
            <section><h2 className="text-lg">Livrables attendus</h2><ul className="mt-2 space-y-1.5 text-[15px]">{c.deliverables.map((d, i) => <li key={i}>{d.title} <Badge>{DELIVERABLE_FORMAT_LABELS[d.format]}</Badge></li>)}</ul></section>
            <section><h2 className="text-lg">Compétences requises</h2><ul className="mt-2 flex flex-wrap gap-2">{c.skills.map((s) => <li key={s.skillId}><Badge tone="violet">{s.skill.name} · {SKILL_LEVEL_LABELS[s.minLevel]}</Badge></li>)}</ul></section>
            {c.milestones.length > 0 && <section><h2 className="text-lg">Jalons</h2><ul className="mt-2 space-y-1 text-[15px]">{c.milestones.map((m, i) => <li key={i}>Semaine {m.targetWeek} — {m.title}</li>)}</ul></section>}
          </CardBody></Card>
          <div className="space-y-4">
            <Card><CardBody className="space-y-2 text-sm"><p><span className="text-muted">Équipe :</span> <strong>{c.teamSize} étudiants</strong></p><p><span className="text-muted">Durée :</span> <strong>{c.durationWeeks ? `${c.durationWeeks} semaines` : "—"}</strong></p><p><span className="text-muted">Budget :</span> <strong>{c.budgetAmount != null ? `${new Intl.NumberFormat("fr-FR").format(c.budgetAmount)} ${c.budgetCurrency === "XOF" ? "FCFA" : "EUR"}` : "—"}</strong> {c.budgetPublic && <Badge>public</Badge>}</p></CardBody></Card>
            <Card><CardBody><h2 className="text-base">Historique</h2><ol className="mt-3 space-y-3 border-l-2 border-line pl-4">{c.history?.map((h) => <li key={h.id} className="relative text-sm"><span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-nexus" aria-hidden /><p className="font-semibold text-night">{CHALLENGE_STATUS_LABELS[h.to]}</p>{h.note && <p className="text-muted">{h.note}</p>}<p className="text-xs text-muted">{formatDate(h.at)}</p></li>)}</ol></CardBody></Card>
          </div>
        </div>
      )}

      {tab === "candidatures" && (
        <Card className="overflow-x-auto">{apps.isLoading ? <Skeleton className="m-4 h-24" /> : apps.data?.applications.length ? (
          <table className="w-full min-w-[640px] text-left text-sm"><caption className="sr-only">Candidatures reçues</caption>
            <thead className="border-b border-line text-muted"><tr><th scope="col" className="p-4 font-semibold">Étudiant</th><th scope="col" className="p-4 font-semibold">Score</th><th scope="col" className="p-4 font-semibold">Motivation</th><th scope="col" className="p-4 font-semibold">Statut</th></tr></thead>
            <tbody className="divide-y divide-line">{apps.data.applications.map((a) => <tr key={a.id}><td className="p-4"><p className="font-semibold text-night">{a.student?.name ?? "—"}</p><p className="text-xs text-muted">{[a.student?.institution, a.student?.program].filter(Boolean).join(" · ")}</p></td><td className="p-4 font-bold tabular-nums">{a.score ?? "—"}</td><td className="max-w-xs p-4 text-muted"><p className="line-clamp-3">{a.motivation}</p></td><td className="p-4"><Badge tone={a.status === "ACCEPTEE" ? "green" : a.status === "REFUSEE" || a.status === "RETIREE" ? "red" : "blue"}>{APPLICATION_STATUS_LABELS[a.status]}</Badge></td></tr>)}</tbody></table>
        ) : <p className="p-6 text-center text-sm text-muted">Aucune candidature pour l'instant. Les étudiants peuvent postuler depuis la marketplace dès la publication.</p>}</Card>
      )}

      {tab === "nexmatch" && <NexMatchPanel challengeId={id} status={c.status} teamSize={c.teamSize} hasSkills={c.skills.length > 0} />}

      <Modal open={closeOpen} onOpenChange={setCloseOpen} title="Clôturer ce défi ?" description="Le défi ne sera plus visible sur la marketplace et les candidatures en attente seront refusées.">
        <Field label="Motif de clôture (obligatoire)">{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setCloseOpen(false)}>Retour</Button><Button variant="danger" loading={close.isPending} disabled={reason.trim().length < 5} onClick={() => close.mutate()}>Clôturer</Button></div>
      </Modal>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Search, Sparkles, UserPlus, Users, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { SKILL_LEVEL_LABELS, TEAM_MEMBER_STATUS_LABELS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, Progress, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { STEP_LABELS, STEP_STATUS_LABELS, timeLeft, type MatchView, type Proposal, type StudentCard, type TeamView } from "@/lib/challenges";
import { cn } from "@/lib/cn";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Action impossible.");
const memberTone = { INVITE: "amber", ACCEPTE: "green", DECLINE: "red", EXPIRE: "red", REMPLACE: "neutral" } as const;

function ScoreBar({ value, label }: { value: number; label: string }) { return <div className="flex items-center gap-2"><Progress value={value} label={label} className="h-1.5 flex-1" /><span className="w-9 text-right text-xs font-bold tabular-nums text-night">{value}</span></div>; }

/* ---------------------- Suivi de l'équipe en cours de validation ---------------------- */
function TeamPanel({ challengeId, team }: { challengeId: string; team: TeamView }) {
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["team", challengeId] }), qc.invalidateQueries({ queryKey: ["challenge", challengeId] })]);
  const cancel = useMutation({ mutationFn: () => api(`/teams/${team.id}/cancel`, { method: "POST", body: { reason: reason || "Annulée par l'entreprise" } }), onSuccess: async () => { setCancelOpen(false); toast.success("Équipe annulée."); await refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  const active = team.members.filter((m) => m.status === "INVITE" || m.status === "ACCEPTE");
  return (
    <Card><CardBody>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl">Équipe {team.status === "VALIDEE" ? "validée" : team.status === "ANNULEE" ? "annulée" : "en cours de validation"}</h2><Badge tone={team.status === "VALIDEE" ? "green" : team.status === "ANNULEE" ? "red" : "amber"}>{team.origin === "NEXMATCH" ? "Proposée par NexMatch" : "Composée manuellement"}</Badge></div>
      <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Étapes de validation">{team.steps.map((s) => (
        <li key={s.step} className={cn("rounded-md border p-3 text-sm", s.status === "VALIDE" ? "border-emerald-200 bg-emerald-50" : s.status === "REFUSE" ? "border-red-200 bg-red-50" : s.status === "NON_REQUIS" ? "border-line bg-cloud" : "border-amber-200 bg-amber-50")}>
          <p className="font-bold text-night">{STEP_LABELS[s.step]}</p><p className="mt-0.5 flex items-center gap-1.5 text-[13px]">{s.status === "VALIDE" ? <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden /> : s.status === "REFUSE" ? <XCircle className="h-4 w-4 text-red-700" aria-hidden /> : <Clock className="h-4 w-4 text-muted" aria-hidden />}{STEP_STATUS_LABELS[s.status] ?? s.status}</p>{s.comment && <p className="mt-1 text-xs text-muted">{s.comment}</p>}
        </li>))}</ol>
      <ul className="mt-5 divide-y divide-line rounded-md border border-line">{team.members.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
          <span className="min-w-0 flex-1"><span className="font-semibold text-night">{m.student?.name ?? "Étudiant"}</span>{m.isLead && <Badge tone="violet" className="ml-2">Chef de projet</Badge>}<span className="block truncate text-muted">{[m.student?.institution, m.student?.program].filter(Boolean).join(" · ")}</span></span>
          <Badge tone={memberTone[m.status]}>{TEAM_MEMBER_STATUS_LABELS[m.status]}</Badge>
          {m.status === "INVITE" && <span className="text-xs text-muted">reste {timeLeft(m.deadlineAt)}</span>}
          {m.replaced && <span className="text-xs text-muted">remplacé automatiquement</span>}
        </li>))}</ul>
      {team.status === "EN_VALIDATION" && (
        <div className="mt-5 flex flex-wrap gap-3">
          {active.length < 8 && <Button variant="secondary" onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" aria-hidden />Ajouter un étudiant</Button>}
          <Button variant="ghost" onClick={() => setCancelOpen(true)}>Annuler cette équipe</Button>
          <p className="basis-full text-xs text-muted">Chaque étudiant dispose de 72 h pour répondre, avec une relance toutes les 24 h. En cas de refus, le suivant du classement NexMatch est invité automatiquement.</p>
        </div>)}
      {team.status === "VALIDEE" && <Alert tone="success" className="mt-5" title="Projet lancé">L'équipe est validée et le projet est lancé : l'espace de travail NexSpace est ouvert.</Alert>}
      <Modal open={cancelOpen} onOpenChange={setCancelOpen} title="Annuler l'équipe ?" description="Les étudiants invités seront prévenus. Vous pourrez relancer NexMatch ensuite.">
        <Field label="Motif" optional>{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setCancelOpen(false)}>Retour</Button><Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Annuler l'équipe</Button></div>
      </Modal>
      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} challengeId={challengeId} teamId={team.id} onDone={refresh} />
    </CardBody></Card>
  );
}

/* ---------------------- Candidats (composition manuelle / ajout) ---------------------- */
function useCandidates(challengeId: string, q: string, enabled: boolean) {
  return useQuery({ queryKey: ["candidates", challengeId, q], enabled, queryFn: () => api<{ candidates: (StudentCard & { score: number; applied: boolean })[]; total: number }>(`/challenges/${challengeId}/candidates?limit=30${q ? `&q=${encodeURIComponent(q)}` : ""}`) });
}
function CandidateRow({ c, right }: { c: StudentCard & { score: number; applied: boolean }; right: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 p-3 text-sm">
      <div className="min-w-0 flex-1"><p className="font-semibold text-night">{c.name}{c.applied && <Badge tone="blue" className="ml-2">A candidaté</Badge>}</p><p className="truncate text-muted">{[c.institution, c.program, c.studyLevel].filter(Boolean).join(" · ")}</p><p className="mt-1 flex flex-wrap gap-1">{c.skills.slice(0, 4).map((s) => <Badge key={s.name}>{s.name} · {SKILL_LEVEL_LABELS[s.level]}</Badge>)}</p></div>
      <div className="w-24"><p className="mb-0.5 text-[11px] font-semibold text-muted">Score</p><ScoreBar value={c.score} label={`Score de ${c.name}`} /></div>{right}
    </li>
  );
}
function AddMemberModal({ open, onClose, challengeId, teamId, onDone }: { open: boolean; onClose: () => void; challengeId: string; teamId: string; onDone: () => Promise<unknown> }) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useCandidates(challengeId, q, open);
  const add = useMutation({ mutationFn: (studentId: string) => api(`/teams/${teamId}/members`, { method: "POST", body: { studentId } }), onSuccess: async () => { toast.success("Invitation envoyée."); onClose(); await onDone(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Ajouter un étudiant" description="Choisissez parmi les profils disponibles (triés par score pour ce défi).">
      <Field label="Rechercher">{(p) => <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, compétence, établissement…" />}</Field>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-md border border-line">{isLoading ? <Skeleton className="m-3 h-20" /> : data?.candidates.length ? <ul className="divide-y divide-line">{data.candidates.map((c) => <CandidateRow key={c.studentId} c={c} right={<Button size="sm" loading={add.isPending && add.variables === c.studentId} onClick={() => add.mutate(c.studentId)}>Inviter</Button>} />)}</ul> : <p className="p-4 text-sm text-muted">Aucun profil disponible.</p>}</div>
    </Modal>
  );
}

/* ---------------------- Propositions NexMatch ---------------------- */
function ProposalCard({ p, challengeId, canApprove, onApproved }: { p: Proposal; challengeId: string; canApprove: boolean; onApproved: () => Promise<unknown> }) {
  const [confirm, setConfirm] = useState(false);
  const approve = useMutation({ mutationFn: () => api(`/challenges/${challengeId}/proposals/${p.id}/approve`, { method: "POST" }), onSuccess: async () => { setConfirm(false); toast.success("Équipe approuvée : les étudiants ont été invités."); await onApproved(); }, onError: (e) => toast.error(errMsg(e)) });
  const ex = p.explanation;
  return (
    <Card className={cn(p.status === "APPROUVEE" && "border-emerald-300", p.status === "ECARTEE" && "opacity-60")}><CardBody>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-wider text-nexus">Proposition {p.rank}</p><h3 className="mt-0.5 flex items-center gap-2 text-2xl">{p.totalScore}<span className="text-sm font-semibold text-muted">/ 100 — score d'équipe</span></h3></div>
        {canApprove && p.status === "PROPOSEE" && <Button onClick={() => setConfirm(true)}>Approuver cette équipe</Button>}
        {p.status === "APPROUVEE" && <Badge tone="green">Approuvée</Badge>}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-muted">Couverture des compétences</dt><dd className="font-bold text-night">{ex.coverage} %</dd></div><div><dt className="text-muted">Score individuel moyen</dt><dd className="font-bold text-night">{ex.avgIndividual}</dd></div>
        <div><dt className="text-muted">Filières</dt><dd className="font-bold text-night">{ex.fields}{p.diversityScore > 0 && <span className="ml-1 text-xs font-semibold text-collab-text">(+{p.diversityScore} diversité)</span>}</dd></div><div><dt className="text-muted">Compétences couvertes</dt><dd className="font-bold text-night">{ex.coveredSkills} / {ex.requiredSkills}</dd></div>
      </dl>
      <ul className="mt-4 divide-y divide-line rounded-md border border-line">{p.members.map((m) => (
        <li key={m.studentId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
          <div className="min-w-0 flex-1"><p className="font-semibold text-night">{m.name}</p><p className="truncate text-muted">{[m.institution, m.program, m.studyLevel].filter(Boolean).join(" · ")}</p><p className="mt-1 flex flex-wrap gap-1">{m.skills.slice(0, 5).map((s) => <Badge key={s.name} tone={s.validated ? "green" : "neutral"}>{s.name} · {SKILL_LEVEL_LABELS[s.level]}</Badge>)}</p>{m.penalties.map((x) => <p key={x.code} className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-text"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />{x.label}</p>)}</div>
          <div className="w-28"><p className="mb-0.5 text-[11px] font-semibold text-muted">Score individuel</p><ScoreBar value={m.score} label={`Score de ${m.name}`} /></div>
        </li>))}</ul>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><h4 className="text-sm font-bold text-night">Pourquoi cette équipe</h4><ul className="mt-1.5 space-y-1 text-sm text-ink">{ex.strengths.map((s) => <li key={s} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />{s}</li>)}</ul></div>
        {ex.warnings.length > 0 && <div><h4 className="text-sm font-bold text-night">Points d'attention</h4><ul className="mt-1.5 space-y-1 text-sm text-ink">{ex.warnings.map((s) => <li key={s} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-text" aria-hidden />{s}</li>)}</ul></div>}
      </div>
      <Modal open={confirm} onOpenChange={setConfirm} title="Approuver cette équipe ?" description={`Les ${p.members.length} étudiants seront invités à confirmer leur participation (72 h, relance toutes les 24 h).`}>
        <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setConfirm(false)}>Retour</Button><Button loading={approve.isPending} onClick={() => approve.mutate()}>Approuver et inviter</Button></div>
      </Modal>
    </CardBody></Card>
  );
}

function ManualTeam({ challengeId, teamSize, onCreated }: { challengeId: string; teamSize: number; onCreated: () => Promise<unknown> }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const { data, isLoading } = useCandidates(challengeId, q, true);
  const create = useMutation({ mutationFn: () => api(`/challenges/${challengeId}/teams`, { method: "POST", body: { studentIds: sel } }), onSuccess: async () => { toast.success("Équipe créée : les étudiants ont été invités."); setSel([]); await onCreated(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <Card><CardBody>
      <h2 className="text-xl">Composer l'équipe manuellement</h2><p className="mt-1 text-sm text-muted">Parcourez les profils disponibles et sélectionnez entre 2 et {teamSize} étudiants.</p>
      <div className="mt-4 flex items-end gap-3"><div className="flex-1"><Field label="Rechercher un profil">{(p) => <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, compétence, établissement…" />}</Field></div></div>
      <div className="mt-3 max-h-96 overflow-y-auto rounded-md border border-line">{isLoading ? <Skeleton className="m-3 h-20" /> : data?.candidates.length ? <ul className="divide-y divide-line">{data.candidates.map((c) => { const on = sel.includes(c.studentId); return <CandidateRow key={c.studentId} c={c} right={<Checkbox label={<span className="sr-only">Sélectionner {c.name}</span>} checked={on} disabled={!on && sel.length >= teamSize} onChange={() => setSel(on ? sel.filter((x) => x !== c.studentId) : [...sel, c.studentId])} />} />; })}</ul> : <p className="p-4 text-sm text-muted">Aucun profil disponible pour l'instant.</p>}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><Button disabled={sel.length < 2} loading={create.isPending} onClick={() => create.mutate()}><Users className="h-4 w-4" aria-hidden />Inviter {sel.length || ""} étudiant{sel.length > 1 ? "s" : ""}</Button><span className="text-sm text-muted">{sel.length} / {teamSize} sélectionné(s)</span></div>
    </CardBody></Card>
  );
}

export default function NexMatchPanel({ challengeId, status, teamSize, hasSkills }: { challengeId: string; status: string; teamSize: number; hasSkills: boolean }) {
  const qc = useQueryClient();
  const [onlyApplicants, setOnlyApplicants] = useState(false);
  const teamQ = useQuery({ queryKey: ["team", challengeId], queryFn: () => api<{ team: TeamView | null }>(`/challenges/${challengeId}/team`), refetchInterval: 30_000 });
  const matchQ = useQuery({ queryKey: ["match", challengeId], queryFn: () => api<MatchView>(`/challenges/${challengeId}/match/latest`) });
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["team", challengeId] }), qc.invalidateQueries({ queryKey: ["match", challengeId] }), qc.invalidateQueries({ queryKey: ["challenge", challengeId] })]); };
  const run = useMutation({ mutationFn: () => api<MatchView>(`/challenges/${challengeId}/match`, { method: "POST", body: { onlyApplicants } }), onSuccess: (r) => { qc.setQueryData(["match", challengeId], r); if (r.proposals.length === 0) toast.error(r.message ?? "Aucune proposition possible."); }, onError: (e) => toast.error(errMsg(e)) });

  const team = teamQ.data?.team;
  const teamActive = team && (team.status === "EN_VALIDATION" || team.status === "VALIDEE");
  if (status !== "PUBLIE" && status !== "EN_COURS" && !team) return <Alert tone="info" title="NexMatch n'est pas encore disponible">Le matching s'ouvre dès que votre défi est publié par l'équipe NEXBRIDGE.</Alert>;
  if (teamQ.isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-6">
      {team && <TeamPanel challengeId={challengeId} team={team} />}
      {!teamActive && status === "PUBLIE" && (<>
        <Card><CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-50 text-impact-text"><Sparkles className="h-6 w-6" aria-hidden /></span>
          <div className="flex-1"><h2 className="text-xl">NexMatch — équipes suggérées</h2><p className="text-sm text-muted">Le moteur analyse les compétences, la formation, les disponibilités, les préférences et l'historique des étudiants et vous propose les 3 meilleures équipes, avec l'explication de chaque choix.</p>{!hasSkills && <p className="mt-1 text-sm font-semibold text-red-700">Ajoutez des compétences requises à ce défi pour activer le matching.</p>}</div>
          <div className="flex flex-col gap-2"><Button size="lg" onClick={() => run.mutate()} loading={run.isPending} disabled={!hasSkills}><Search className="h-4 w-4" aria-hidden />{matchQ.data?.run ? "Relancer NexMatch" : "Lancer NexMatch"}</Button><Checkbox label={<span className="text-xs">Candidats uniquement</span>} checked={onlyApplicants} onChange={(e) => setOnlyApplicants(e.target.checked)} /></div>
        </CardBody></Card>
        {matchQ.data?.run && (<>
          <p className="text-xs text-muted">Calcul du {new Date(matchQ.data.run.createdAt).toLocaleString("fr-FR")} · moteur « {matchQ.data.run.engine} » v{matchQ.data.run.engineVersion} (scoring par règles, sans IA) · {matchQ.data.run.poolSize} profil(s) analysé(s) · {matchQ.data.run.durationMs} ms</p>
          {matchQ.data.proposals.length === 0 ? <Alert tone="warning" title="Aucune équipe proposable">Moins de 2 profils disponibles pour ce défi. Élargissez le défi (niveau, compétences) ou attendez de nouvelles inscriptions.</Alert> : <div className="space-y-5">{matchQ.data.proposals.map((p) => <ProposalCard key={p.id} p={p} challengeId={challengeId} canApprove onApproved={refresh} />)}</div>}
        </>)}
        <ManualTeam challengeId={challengeId} teamSize={teamSize} onCreated={refresh} />
      </>)}
      {team?.project && <p className="text-sm"><Link to={`/app/projets/${team.project.id}`} className="font-semibold text-nexus hover:underline">Accéder à l'espace de travail →</Link></p>}
    </div>
  );
}

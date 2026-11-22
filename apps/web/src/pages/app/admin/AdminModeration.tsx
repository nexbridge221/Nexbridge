import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EVALUATION_TYPE_LABELS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

interface Ev { id: string; type: keyof typeof EVALUATION_TYPE_LABELS; rating: number; comment: string | null; hidden: boolean; hiddenReason: string | null; project: string; evaluator: string; subject: string | null; submittedAt: string }
interface Rp { id: string; targetType: string; targetId: string; reason: string; reporter: string; createdAt: string }
const err = (e: unknown) => (e instanceof ApiError ? e.message : "Action impossible.");

export default function AdminModeration() {
  usePageTitle("Modération");
  const qc = useQueryClient();
  const [tab, setTab] = useState<"reports" | "evals">("reports");
  const reports = useQuery({ queryKey: ["admin-reports"], queryFn: () => api<{ reports: Rp[] }>("/admin/reports") });
  const evals = useQuery({ queryKey: ["admin-evals"], queryFn: () => api<{ evaluations: Ev[] }>("/admin/evaluations?limit=50") });
  const [hide, setHide] = useState<Ev | null>(null); const [reason, setReason] = useState("");
  const [handle, setHandle] = useState<{ r: Rp; status: "TRAITE" | "REJETE" } | null>(null); const [note, setNote] = useState("");
  const mod = useMutation({ mutationFn: (v: { e: Ev; hidden: boolean }) => api(`/admin/evaluations/${v.e.id}`, { method: "PATCH", body: { hidden: v.hidden, reason: v.hidden ? reason : undefined } }), onSuccess: async () => { setHide(null); setReason(""); await qc.invalidateQueries({ queryKey: ["admin-evals"] }); toast.success("Modération enregistrée."); }, onError: (e) => toast.error(err(e)) });
  const rep = useMutation({ mutationFn: () => api(`/admin/reports/${handle!.r.id}`, { method: "PATCH", body: { status: handle!.status, note: note || undefined } }), onSuccess: async () => { setHandle(null); setNote(""); await qc.invalidateQueries({ queryKey: ["admin-reports"] }); await qc.invalidateQueries({ queryKey: ["admin-overview"] }); }, onError: (e) => toast.error(err(e)) });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl sm:text-3xl">Modération</h1>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">{([["reports", `Signalements${reports.data?.reports.length ? ` (${reports.data.reports.length})` : ""}`], ["evals", "Évaluations"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold", tab === k ? "border-nexus text-nexus" : "border-transparent text-muted hover:text-night")}>{l}</button>)}</div>
      {tab === "reports" && (<>{reports.isLoading && <Skeleton className="h-32" />}{reports.data?.reports.length === 0 && <EmptyState title="Aucun signalement ouvert" />}<ul className="space-y-3">{reports.data?.reports.map((r) => <li key={r.id}><Card><CardBody><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-night"><Badge tone="amber">{r.targetType}</Badge> signalé par {r.reporter}</p><p className="mt-2 text-sm">{r.reason}</p><p className="mt-1 font-mono text-xs text-muted">Cible : {r.targetId} · {formatDate(r.createdAt)}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => { setHandle({ r, status: "TRAITE" }); setNote(""); }}>Traité</Button><Button size="sm" variant="secondary" onClick={() => { setHandle({ r, status: "REJETE" }); setNote(""); }}>Rejeter</Button></div></div></CardBody></Card></li>)}</ul></>)}
      {tab === "evals" && (<>{evals.isLoading && <Skeleton className="h-32" />}{evals.data?.evaluations.length === 0 && <EmptyState title="Aucune évaluation" />}<ul className="space-y-3">{evals.data?.evaluations.map((e) => <li key={e.id}><Card className={e.hidden ? "opacity-70" : ""}><CardBody><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-night">{EVALUATION_TYPE_LABELS[e.type]} · {e.project}</p><p className="text-sm text-muted">{e.evaluator}{e.subject ? ` → ${e.subject}` : ""} · {formatDate(e.submittedAt)} · <span className="text-amber-500" aria-label={`${e.rating} sur 5`}>{"★".repeat(e.rating)}</span></p>{e.comment && <p className="mt-2 text-sm">{e.comment}</p>}{e.hidden && <p className="mt-1 text-xs font-semibold text-red-700">Masquée : {e.hiddenReason ?? "—"}</p>}</div>{e.hidden ? <Button size="sm" variant="secondary" onClick={() => mod.mutate({ e, hidden: false })}>Rétablir</Button> : <Button size="sm" variant="ghost" onClick={() => { setHide(e); setReason(""); }}>Masquer</Button>}</div></CardBody></Card></li>)}</ul></>)}
      <Modal open={Boolean(hide)} onOpenChange={(o) => !o && setHide(null)} title="Masquer cette évaluation ?" description="Elle n'apparaît plus et n'entre plus dans l'indice de fiabilité. Le motif est conservé dans le journal d'audit."><Field label="Motif">{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field><div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setHide(null)}>Annuler</Button><Button variant="danger" disabled={!reason.trim()} loading={mod.isPending} onClick={() => hide && mod.mutate({ e: hide, hidden: true })}>Masquer</Button></div></Modal>
      <Modal open={Boolean(handle)} onOpenChange={(o) => !o && setHandle(null)} title={handle?.status === "TRAITE" ? "Marquer comme traité" : "Rejeter le signalement"} description="Votre note est transmise à la personne qui a signalé."><Field label="Note" optional>{(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</Field><div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setHandle(null)}>Annuler</Button><Button loading={rep.isPending} onClick={() => rep.mutate()}>Confirmer</Button></div></Modal>
    </div>
  );
}

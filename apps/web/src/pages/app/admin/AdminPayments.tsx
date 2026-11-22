import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { useAuth } from "@/stores/auth";

interface Item { projectId: string; project: string; projectStatus: string; status: string; amountHeld: number; currency: string; reference: string; declared: { amount: number; reference: string; note: string | null; at: string } | null }
type Act = { item: Item; kind: "confirm" | "reject" | "release" | "refund" };
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");

export default function AdminPayments() {
  usePageTitle("Paiements");
  const qc = useQueryClient();
  const isSuper = useAuth((s) => s.user?.role === "SUPER_ADMIN");
  const q = useQuery({ queryKey: ["admin-payments"], queryFn: () => api<{ items: Item[] }>("/payments/admin/pending") });
  const bank = useQuery({ queryKey: ["admin-bank"], queryFn: () => api<{ text: string | null }>("/payments/admin/bank-instructions"), enabled: isSuper });
  const [act, setAct] = useState<Act | null>(null); const [f, setF] = useState({ amount: "", reference: "", note: "" }); const [text, setText] = useState<string | null>(null);
  const open = (a: Act) => { setAct(a); setF({ amount: String(a.item.declared?.amount ?? a.item.amountHeld ?? ""), reference: a.item.declared?.reference ?? "", note: "" }); };
  const run = useMutation({ mutationFn: () => { const a = act!; const base = `/payments/admin/project/${a.item.projectId}/${a.kind}`; const body = a.kind === "confirm" ? { amount: Number(f.amount.replace(/\s/g, "")), reference: f.reference, note: f.note || undefined } : { note: f.note }; return api(base, { method: "POST", body }); }, onSuccess: async () => { toast.success("Enregistré (journalisé)."); setAct(null); await qc.invalidateQueries({ queryKey: ["admin-payments"] }); }, onError: (e) => toast.error(err(e)) });
  const saveBank = useMutation({ mutationFn: () => api("/payments/admin/bank-instructions", { method: "PUT", body: { text } }), onSuccess: async () => { toast.success("Coordonnées enregistrées."); await bank.refetch(); }, onError: (e) => toast.error(err(e)) });
  const title = { confirm: "Constater le dépôt", reject: "Virement non retrouvé", release: "Enregistrer la libération", refund: "Enregistrer le remboursement" };
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl">Paiements</h1>
      <Alert tone="info">NEXBRIDGE n'exécute aucun virement. Vous constatez ici ce que vous avez vérifié sur le relevé bancaire ou chez le prestataire ; chaque décision est inscrite au journal d'audit.</Alert>
      {q.isLoading && <Skeleton className="h-32" />}
      {q.data?.items.length === 0 && <EmptyState title="Rien à traiter">Aucun virement déclaré en attente et aucun projet terminé avec fonds à libérer.</EmptyState>}
      <ul className="space-y-3">{q.data?.items.map((i) => (
        <li key={i.projectId}><Card><CardBody><div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-semibold text-night">{i.project} <Badge tone={i.declared ? "amber" : "green"}>{i.declared ? "Virement à vérifier" : i.projectStatus === "TERMINE" ? "Projet terminé : libération à enregistrer" : "Fonds déposés"}</Badge></p>
            <p className="mt-1 text-sm text-muted">Référence attendue <span className="font-mono">{i.reference}</span>{i.declared && <> · déclaré {formatNumber(i.declared.amount)} (réf. {i.declared.reference}) le {formatDate(i.declared.at)}{i.declared.note ? ` · ${i.declared.note}` : ""}</>}{!i.declared && <> · montant constaté {formatNumber(i.amountHeld)} {i.currency}</>}</p></div>
          <div className="flex flex-wrap gap-2">{i.declared ? <><Button size="sm" onClick={() => open({ item: i, kind: "confirm" })}>Constater le dépôt</Button><Button size="sm" variant="secondary" onClick={() => open({ item: i, kind: "reject" })}>Non retrouvé</Button></> : <><Button size="sm" onClick={() => open({ item: i, kind: "release" })} disabled={i.projectStatus !== "TERMINE"}>Libérer</Button><Button size="sm" variant="ghost" onClick={() => open({ item: i, kind: "refund" })}>Rembourser</Button></>}</div>
        </div></CardBody></Card></li>))}</ul>
      {isSuper && <Card><CardBody><h2 className="text-lg">Coordonnées bancaires affichées aux entreprises</h2><p className="mt-1 text-sm text-muted">IBAN/RIB, banque, bénéficiaire. Visible des entreprises ayant un projet à financer. Réservé au Super Admin.</p>
        <div className="mt-3"><Field label="Coordonnées">{(p) => <Textarea {...p} rows={4} value={text ?? bank.data?.text ?? ""} onChange={(e) => setText(e.target.value)} />}</Field></div>
        <Button className="mt-3" onClick={() => saveBank.mutate()} loading={saveBank.isPending} disabled={(text ?? "").trim().length < 10}>Enregistrer</Button></CardBody></Card>}
      <Modal open={Boolean(act)} onOpenChange={(o) => !o && setAct(null)} title={act ? title[act.kind] : ""} description={act?.item.project}>
        <div className="space-y-4">
          {act?.kind === "confirm" && <><Field label="Montant constaté sur le relevé">{(p) => <Input {...p} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}</Field><Field label="Référence bancaire">{(p) => <Input {...p} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />}</Field></>}
          <Field label={act?.kind === "confirm" ? "Note" : "Motif / détail"} optional={act?.kind === "confirm"}>{(p) => <Textarea {...p} rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />}</Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setAct(null)}>Annuler</Button><Button loading={run.isPending} onClick={() => run.mutate()} disabled={act?.kind !== "confirm" && f.note.trim().length < 3}>Confirmer</Button></div>
        </div>
      </Modal>
    </div>
  );
}

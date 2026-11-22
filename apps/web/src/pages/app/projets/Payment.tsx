import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, Landmark } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { useSpace } from "./ProjectLayout";
import { useSpaceInvalidate } from "./TaskPanel";

export interface PaymentView { status: "NON_DEPOSE" | "DEPOSE" | "LIBERE" | "REMBOURSE"; amountHeld: number; currency: string; reference: string; bankInstructions: string | null; stripeAvailable: boolean; notice: string; due: { budget: number | null; commission: number | null; total: number | null; bps: number }; pendingDeclaration: { amount: number; reference: string; at: string } | null; events: { id: string; kind: string; method: string; amount: number; reference: string | null; note: string | null; at: string }[] }
export const ESCROW_LABELS = { NON_DEPOSE: "Non déposé", DEPOSE: "Fonds déposés", LIBERE: "Fonds libérés", REMBOURSE: "Remboursé" } as const;
export const EVENT_LABELS: Record<string, string> = { VIREMENT_DECLARE: "Virement déclaré par l'entreprise", DEPOT_CONFIRME: "Dépôt constaté", DEPOT_REJETE: "Virement non retrouvé", LIBERATION_ENREGISTREE: "Libération enregistrée", REMBOURSEMENT_ENREGISTRE: "Remboursement enregistré" };
const money = (n: number | null, cur: string) => (n == null ? "—" : `${formatNumber(n)} ${cur === "XOF" ? "F CFA" : cur === "EUR" ? "centimes €" : cur}`);
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");

export function EventList({ events, currency }: { events: PaymentView["events"]; currency: string }) {
  if (!events.length) return <p className="text-sm text-muted">Aucun mouvement enregistré.</p>;
  return <ul className="divide-y divide-line">{events.map((e) => <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm"><div><p className="font-semibold text-night">{EVENT_LABELS[e.kind] ?? e.kind}</p><p className="text-muted">{e.method === "STRIPE" ? "Carte (Stripe)" : "Virement"}{e.reference ? ` · réf. ${e.reference}` : ""}{e.note ? ` · ${e.note}` : ""}</p></div><div className="text-right"><p className="font-semibold tabular-nums">{money(e.amount, currency)}</p><p className="text-xs text-muted">{formatDate(e.at)}</p></div></li>)}</ul>;
}

export default function Payment() {
  const { id, overview } = useSpace();
  const refresh = useSpaceInvalidate(id);
  const role = overview.access.role;
  const q = useQuery({ queryKey: ["space", id, "payment"], queryFn: () => api<PaymentView>(`/payments/project/${id}`) });
  const [f, setF] = useState({ amount: "", reference: "", note: "" });
  const declare = useMutation({ mutationFn: () => api(`/payments/project/${id}/declare`, { method: "POST", body: { amount: Number(f.amount.replace(/\s/g, "")), reference: f.reference, note: f.note || undefined } }), onSuccess: async () => { toast.success("Virement déclaré : un administrateur va le vérifier."); await q.refetch(); await refresh(); }, onError: (e) => toast.error(err(e)) });
  const card = useMutation({ mutationFn: () => api<{ url: string }>(`/payments/project/${id}/stripe-session`, { method: "POST" }), onSuccess: (r) => { window.location.href = r.url; }, onError: (e) => toast.error(err(e)) });
  if (q.isLoading || !q.data) return <Skeleton className="h-64" />;
  const d = q.data;
  const canPay = role === "CONTACT_ENTREPRISE" && d.status === "NON_DEPOSE";
  return (
    <div className="space-y-6">
      <Alert tone="info">{d.notice}</Alert>
      <Card><CardBody>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg">Séquestre du projet</h2><Badge tone={d.status === "DEPOSE" ? "green" : d.status === "NON_DEPOSE" ? "amber" : "blue"}>{ESCROW_LABELS[d.status]}</Badge></div>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div><dt className="text-sm text-muted">Budget du défi</dt><dd className="text-xl font-bold text-night tabular-nums">{money(d.due.budget, d.currency)}</dd></div>
          <div><dt className="text-sm text-muted">Commission NEXBRIDGE ({d.due.bps / 100} %)</dt><dd className="text-xl font-bold text-night tabular-nums">{money(d.due.commission, d.currency)}</dd></div>
          <div><dt className="text-sm text-muted">Total à régler</dt><dd className="text-xl font-bold text-nexus tabular-nums">{money(d.due.total, d.currency)}</dd></div>
        </dl>
        {d.status !== "NON_DEPOSE" && <p className="mt-3 text-sm text-muted">Montant constaté : <strong>{money(d.amountHeld, d.currency)}</strong></p>}
      </CardBody></Card>
      {canPay && (<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card><CardBody>
          <Landmark className="mb-2 h-6 w-6 text-nexus" aria-hidden /><h2 className="text-lg">Payer par virement</h2>
          {d.bankInstructions ? <pre className="mt-3 whitespace-pre-wrap rounded-md bg-cloud p-3 font-sans text-sm text-night">{d.bankInstructions}</pre> : <Alert tone="warning" className="mt-3">Les coordonnées bancaires ne sont pas encore renseignées par NEXBRIDGE. Contactez l'équipe avant de payer.</Alert>}
          <p className="mt-3 text-sm">Indiquez cette référence dans le motif du virement : <strong className="font-mono">{d.reference}</strong></p>
          {d.pendingDeclaration ? <Alert tone="info" className="mt-4">Virement déclaré le {formatDate(d.pendingDeclaration.at)} (réf. {d.pendingDeclaration.reference}) : en attente de vérification par un administrateur.</Alert> : (
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); declare.mutate(); }}>
              <Field label={`Montant viré (${d.currency === "XOF" ? "F CFA" : d.currency})`}>{(p) => <Input {...p} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}</Field>
              <Field label="Référence du virement" help="Celle de votre banque, pour que nous la retrouvions sur le relevé.">{(p) => <Input {...p} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />}</Field>
              <Field label="Note" optional>{(p) => <Textarea {...p} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />}</Field>
              <Button type="submit" loading={declare.isPending} disabled={!f.amount || f.reference.trim().length < 3}>J'ai effectué le virement</Button>
            </form>)}
        </CardBody></Card>
        <Card><CardBody>
          <CreditCard className="mb-2 h-6 w-6 text-collab-text" aria-hidden /><h2 className="text-lg">Payer par carte</h2>
          {d.stripeAvailable ? <><p className="mt-2 text-sm text-muted">Paiement sécurisé par Stripe. Le dépôt est enregistré automatiquement à la confirmation du prestataire.</p><Button className="mt-4" loading={card.isPending} onClick={() => card.mutate()} disabled={d.due.total == null}>Payer {money(d.due.total, d.currency)} par carte</Button></> : <p className="mt-2 text-sm text-muted">Le paiement par carte n'est pas activé sur cette plateforme. Utilisez le virement.</p>}
        </CardBody></Card>
      </div>)}
      <Card><CardBody><h2 className="mb-2 text-lg">Historique</h2><EventList events={d.events} currency={d.currency} /></CardBody></Card>
    </div>
  );
}

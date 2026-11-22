import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { COMMISSION_MAX_BPS, COMMISSION_MIN_BPS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Card, CardBody, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";

interface S { commissionRateBps: number; nexmatchWeights: Record<string, number>; paymentsNote: string }
const W: [string, string, string][] = [["skills", "Compétences", "%"], ["education", "Formation et niveau d'études", "%"], ["availability", "Disponibilité", "%"], ["sector", "Préférence sectorielle", "%"], ["history", "Historique et fiabilité", "%"], ["overloadFactor", "Facteur de surcharge (0,1 à 1)", ""], ["diversityBonus3", "Bonus diversité (≥ 3 filières)", "pts"], ["diversityBonus2", "Bonus diversité (2 filières)", "pts"]];

interface Integ { key: string; label: string; configured: boolean; detail: string; envVars: string[] }
function Integrations() {
  const { data } = useQuery({ queryKey: ["admin-integrations"], queryFn: () => api<{ integrations: Integ[] }>("/admin/integrations") });
  if (!data) return null;
  return <Card><CardBody><h2 className="text-lg">État des intégrations</h2><p className="mt-1 text-sm text-muted">Les clés se renseignent dans les variables d'environnement du serveur, jamais dans l'application.</p>
    <ul className="mt-3 divide-y divide-line">{data.integrations.map((i) => <li key={i.key} className="py-3 text-sm"><p className="font-semibold text-night">{i.label} <span className={i.configured ? "text-emerald-700" : "text-muted"}>{i.configured ? "· actif" : "· non configuré"}</span></p><p className="text-muted">{i.detail}</p><p className="mt-0.5 font-mono text-xs text-muted">{i.envVars.join(", ")}</p></li>)}</ul></CardBody></Card>;
}

export default function AdminSettings() {
  usePageTitle("Configuration");
  const { data, isLoading } = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<S>("/admin/settings") });
  const [rate, setRate] = useState("15"); const [w, setW] = useState<Record<string, string>>({});
  useEffect(() => { if (data) { setRate(String(data.commissionRateBps / 100)); setW(Object.fromEntries(Object.entries(data.nexmatchWeights).map(([k, v]) => [k, String(v)]))); } }, [data]);
  const save = useMutation({ mutationFn: () => api("/admin/settings", { method: "PUT", body: { commissionRateBps: Math.round(Number(rate.replace(",", ".")) * 100), nexmatchWeights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v.replace(",", "."))])) } }), onSuccess: () => toast.success("Configuration enregistrée (journalisée)."), onError: (e) => toast.error(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Enregistrement impossible.") });
  if (isLoading || !data) return <Skeleton className="h-64" />;
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl sm:text-3xl">Configuration avancée</h1>
      <Alert tone="info">{data.paymentsNote} Toute modification est inscrite au journal d'audit.</Alert>
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Card><CardBody><h2 className="text-lg">Commission NEXBRIDGE</h2><p className="mt-1 text-sm text-muted">Bornée entre {COMMISSION_MIN_BPS / 100} % et {COMMISSION_MAX_BPS / 100} % du budget projet (cahier des charges).</p><div className="mt-4 max-w-xs"><Field label="Taux (%)">{(p) => <Input {...p} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />}</Field></div></CardBody></Card>
        <Card><CardBody><h2 className="text-lg">Pondérations de NexMatch</h2><p className="mt-1 text-sm text-muted">Appliquées aux prochains calculs de matching (chaque calcul garde la trace des pondérations utilisées).</p><div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{W.map(([k, label, unit]) => <Field key={k} label={`${label}${unit ? ` (${unit})` : ""}`}>{(p) => <Input {...p} inputMode="decimal" value={w[k] ?? ""} onChange={(e) => setW({ ...w, [k]: e.target.value })} />}</Field>)}</div></CardBody></Card>
        <Button type="submit" size="lg" loading={save.isPending}>Enregistrer la configuration</Button>
      </form>
      <Integrations />
    </div>
  );
}

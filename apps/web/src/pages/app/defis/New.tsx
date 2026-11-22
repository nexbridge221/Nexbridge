import { useQuery } from "@tanstack/react-query";
import { FileText, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, Skeleton } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";

interface Tpl { id: string; name: string; sector: string; content: { context: string; durationWeeks: number; deliverables: unknown[] } }

export default function NewChallenge() {
  usePageTitle("Déposer un défi");
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["brief-templates"], queryFn: () => api<{ templates: Tpl[] }>("/challenges/templates"), staleTime: 10 * 60_000 });
  const create = async (templateId?: string) => {
    setBusy(templateId ?? "blank"); setError(null);
    try { const r = await api<{ challenge: { id: string } }>("/challenges", { method: "POST", body: templateId ? { templateId } : {} }); navigate(`/app/defis/${r.challenge.id}/modifier`); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Création impossible."); setBusy(null); }
  };
  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl sm:text-3xl">Déposer un défi</h1><p className="mt-1 text-muted">Partez d'un modèle sectoriel pour structurer votre brief, ou d'une page blanche. Vous pourrez tout modifier avant l'envoi.</p></header>
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="border-nexus/30"><CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-nexus"><Sparkles className="h-6 w-6" aria-hidden /></span><div className="flex-1"><h2 className="text-lg">Partir de zéro</h2><p className="text-sm text-muted">Un brouillon vide, enregistré automatiquement à chaque étape.</p></div><Button size="lg" loading={busy === "blank"} onClick={() => create()}>Commencer</Button></CardBody></Card>
      <h2 className="text-lg">Ou choisir un modèle sectoriel</h2>
      {isLoading && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">{data?.templates.map((t) => (
        <li key={t.id}><Card className="h-full"><CardBody className="flex h-full flex-col"><span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-violet-50 text-impact-text"><FileText className="h-5 w-5" aria-hidden /></span><h3 className="text-base">{t.name}</h3><p className="mt-1 text-sm text-muted">{t.sector} · {t.content.durationWeeks} semaines · {t.content.deliverables.length} livrable(s)</p><div className="mt-4 flex-1" /><Button variant="secondary" loading={busy === t.id} onClick={() => create(t.id)}>Utiliser ce modèle</Button></CardBody></Card></li>
      ))}</ul>
    </div>
  );
}

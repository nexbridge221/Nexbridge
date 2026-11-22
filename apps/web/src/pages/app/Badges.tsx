import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Download, ExternalLink, GraduationCap, ShieldCheck, Star, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { BADGE_TYPE_LABELS, SKILL_CATEGORY_LABELS, SKILL_LEVEL_LABELS } from "@nexbridge/shared";
import { LineChart, Radar } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, getAccessToken } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface B { slug: string; isPortfolioPublic: boolean; reliabilityIndex: number | null; skills: { id: string; name: string; category: keyof typeof SKILL_CATEGORY_LABELS; level: keyof typeof SKILL_LEVEL_LABELS; source: string }[]; radar: { category: string; value: number }[]; badges: { id: string; name: string; description: string; type: keyof typeof BADGE_TYPE_LABELS; awardedAt: string; project: { name: string } | null }[]; certifications: { id: string; skill: string; level: keyof typeof SKILL_LEVEL_LABELS; basedOnProjects: number; issuedAt: string }[]; attestations: { id: string; code: string; issuedAt: string; project: string; company: string }[]; credits: { total: number; items: { project: string; credits: number }[] }; ratingTimeline: { project: string; rating: number }[]; nextBadges: { label: string; hint: string }[] }
const tone = { COMPETENCE: "blue", EXCELLENCE: "amber", SECTORIEL: "teal" } as const;

export default function Badges() {
  usePageTitle("Badges et compétences");
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["badges-me"], queryFn: () => api<B>("/badges/me") });
  const eva = useQuery({ queryKey: ["evals-received"], queryFn: () => api<{ evaluations: { id: string; label: string; rating: number; comment: string | null; author: string; project: { name: string } }[] }>("/evaluations/received") });
  const togglePortfolio = async (v: boolean) => { await api("/badges/me/portfolio", { method: "PUT", body: { isPortfolioPublic: v } }); await qc.invalidateQueries({ queryKey: ["badges-me"] }); toast.success(v ? "Votre portfolio est public." : "Votre portfolio est masqué."); };
  const dl = async (id: string) => { const r = await fetch(`/api/attestations/${id}/download`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: "include" }); if (!r.ok) return toast.error("Téléchargement impossible."); const u = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = u; a.download = "attestation-nexbridge.pdf"; a.click(); URL.revokeObjectURL(u); };
  if (isLoading || !data) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64" /></div>;
  const cats = Object.keys(SKILL_CATEGORY_LABELS) as (keyof typeof SKILL_CATEGORY_LABELS)[];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl sm:text-3xl">Badges et compétences</h1><p className="mt-1 text-sm text-muted">Vos compétences validées par des projets réels, vos badges et vos attestations.</p></div>
        <div className="flex flex-col items-end gap-2"><Checkbox label="Portfolio public" checked={data.isPortfolioPublic} onChange={(e) => void togglePortfolio(e.target.checked)} />{data.isPortfolioPublic && <Button asChild size="sm" variant="secondary"><Link to={`/portfolio/${data.slug}`} target="_blank"><ExternalLink className="h-4 w-4" aria-hidden />Voir mon portfolio public</Link></Button>}</div></div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Card><CardBody><h2 className="text-lg">Carte de compétences</h2><div className="mt-2"><Radar data={data.radar} /></div><p className="mt-2 text-center text-xs text-muted">Niveau moyen par catégorie (1 = sensibilisé, 4 = expert)</p></CardBody></Card>
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card><CardBody><p className="text-sm font-semibold text-muted">Indice de fiabilité</p><p className="mt-1 flex items-center gap-1 text-3xl font-extrabold text-night">{data.reliabilityIndex ?? "—"}{data.reliabilityIndex != null && <Star className="h-5 w-5 text-amber-500" aria-hidden />}</p><p className="text-xs text-muted">{data.reliabilityIndex == null ? "Disponible après votre premier projet évalué." : "Moyenne des évaluations reçues."}</p></CardBody></Card>
            <Card><CardBody><p className="text-sm font-semibold text-muted">Badges</p><p className="mt-1 text-3xl font-extrabold text-night">{data.badges.length}</p></CardBody></Card>
            <Card><CardBody><p className="text-sm font-semibold text-muted">Crédits validés</p><p className="mt-1 text-3xl font-extrabold text-night">{data.credits.total}</p></CardBody></Card>
          </div>
          <Card><CardBody><h2 className="text-lg">Évolution de votre indice</h2><div className="mt-2"><LineChart points={data.ratingTimeline.map((p) => ({ label: p.project, value: p.rating }))} /></div></CardBody></Card>
        </div>
      </div>
      <section aria-labelledby="skills-h"><h2 id="skills-h" className="mb-3 text-xl">Compétences</h2>
        {data.skills.length === 0 ? <EmptyState icon={<Award className="h-6 w-6" />} title="Aucune compétence" action={<Button asChild><Link to="/app/profil">Compléter mon profil</Link></Button>} /> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{cats.map((c) => { const l = data.skills.filter((s) => s.category === c); return l.length ? <Card key={c}><CardBody><h3 className="text-base">{SKILL_CATEGORY_LABELS[c]}</h3><ul className="mt-3 space-y-2">{l.map((s) => <li key={s.id} className="flex items-center justify-between gap-2 text-sm"><span className="font-medium text-night">{s.name}</span><span className="flex items-center gap-1.5"><Badge tone={s.source === "DECLARE" ? "neutral" : "green"}>{SKILL_LEVEL_LABELS[s.level]}</Badge>{s.source !== "DECLARE" && <span title="Validée par un projet" className="text-emerald-700"><ShieldCheck className="h-4 w-4" aria-hidden /><span className="sr-only">validée par un projet</span></span>}</span></li>)}</ul></CardBody></Card> : null; })}</div>}</section>
      <section aria-labelledby="badges-h"><h2 id="badges-h" className="mb-3 text-xl">Badges obtenus</h2>
        {data.badges.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 bg-white/60 p-5 text-sm text-muted">Aucun badge pour l'instant : ils sont attribués automatiquement à la fin d'un projet évalué positivement.</p> : <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.badges.map((b) => <li key={b.id}><Card className="h-full"><CardBody><span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-nexus to-impact text-white" aria-hidden><Trophy className="h-5 w-5" /></span><h3 className="text-base">{b.name}</h3><Badge tone={tone[b.type]} className="mt-1">{BADGE_TYPE_LABELS[b.type]}</Badge><p className="mt-2 text-sm text-muted">{b.description}</p><p className="mt-2 text-xs text-muted">{b.project?.name ? `${b.project.name} · ` : ""}{formatDate(b.awardedAt)}</p></CardBody></Card></li>)}</ul>}
        <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-nexus">Prochains badges à débloquer</summary><ul className="mt-2 space-y-1 text-muted">{data.nextBadges.map((n) => <li key={n.label}><strong className="text-night">{n.label}</strong> — {n.hint}</li>)}</ul></details></section>
      {data.certifications.length > 0 && <section aria-labelledby="cert-h"><h2 id="cert-h" className="mb-3 text-xl">Certifications NEXBRIDGE</h2><ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">{data.certifications.map((c) => <li key={c.id}><Card className="border-emerald-300"><CardBody className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-emerald-700" aria-hidden /><div><h3 className="text-base">{c.skill}</h3><p className="text-sm text-muted">Niveau {SKILL_LEVEL_LABELS[c.level]} · {c.basedOnProjects} projets validés</p></div></CardBody></Card></li>)}</ul></section>}
      <section aria-labelledby="att-h"><h2 id="att-h" className="mb-3 text-xl">Attestations</h2>
        {data.attestations.length === 0 ? <p className="text-sm text-muted">Vos attestations de participation apparaîtront ici à la fin de vos projets.</p> : <Card><ul className="divide-y divide-line">{data.attestations.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-3 p-4 text-sm"><GraduationCap className="h-5 w-5 text-muted" aria-hidden /><div className="min-w-0 flex-1"><p className="font-semibold text-night">{a.project}</p><p className="text-muted">{a.company} · délivrée le {formatDate(a.issuedAt)} · code {a.code}</p></div><Button size="sm" variant="secondary" onClick={() => void dl(a.id)}><Download className="h-4 w-4" aria-hidden />PDF</Button><Button asChild size="sm" variant="ghost"><Link to={`/verifier/${a.code}`} target="_blank">Vérifier</Link></Button></li>)}</ul></Card>}</section>
      {(eva.data?.evaluations.length ?? 0) > 0 && <section aria-labelledby="ev-h"><h2 id="ev-h" className="mb-3 text-xl">Évaluations reçues</h2><ul className="space-y-3">{eva.data!.evaluations.map((e) => <li key={e.id}><Card><CardBody><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-night">{e.project.name} — {e.author}</p><span className="text-lg text-amber-500" aria-label={`${e.rating} sur 5`}>{"★".repeat(e.rating)}<span className="text-slate-300">{"★".repeat(5 - e.rating)}</span></span></div><p className="text-xs text-muted">{e.label}</p>{e.comment && <p className="mt-2 text-sm">{e.comment}</p>}</CardBody></Card></li>)}</ul></section>}
    </div>
  );
}

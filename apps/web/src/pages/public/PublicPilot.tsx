import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck, Trophy, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BADGE_TYPE_LABELS, SKILL_CATEGORY_LABELS, SKILL_LEVEL_LABELS, STUDY_LEVEL_LABELS } from "@nexbridge/shared";
import { Section } from "@/components/landing/Section";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, Skeleton } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";

export function PortfolioPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ["portfolio", slug], queryFn: () => api<{ name: string; institution: string | null; program: string | null; studyLevel: string | null; city: string | null; bio: string | null; skills: { name: string; category: keyof typeof SKILL_CATEGORY_LABELS; level: keyof typeof SKILL_LEVEL_LABELS; validated: boolean }[]; badges: { id: string; name: string; type: keyof typeof BADGE_TYPE_LABELS; description: string; awardedAt: string }[]; certifications: { skill: string; level: keyof typeof SKILL_LEVEL_LABELS; basedOnProjects: number }[]; projects: { name: string; company: string; code: string; issuedAt: string }[] }>(`/public/portfolio/${slug}`, { auth: false }), retry: false });
  usePageTitle(data ? `Portfolio de ${data.name}` : "Portfolio");
  if (isLoading) return <div className="nb-container max-w-4xl space-y-4 py-16"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-48" /></div>;
  if (error instanceof ApiError || !data) return <section className="nb-container py-24 text-center"><h1 className="text-3xl">Ce portfolio n'est pas public.</h1><p className="mt-3 text-muted">L'étudiant ne l'a pas rendu public, ou il n'existe pas.</p><Button asChild className="mt-6"><Link to="/">Retour à l'accueil</Link></Button></section>;
  return (
    <Section tone="light" center={false}>
      <div className="mx-auto max-w-4xl space-y-8">
        <header><p className="text-sm font-bold uppercase tracking-wider text-nexus">Portfolio NEXBRIDGE</p><h1 className="mt-1 text-3xl sm:text-4xl">{data.name}</h1><p className="mt-2 text-muted">{[data.program, data.studyLevel ? STUDY_LEVEL_LABELS[data.studyLevel as keyof typeof STUDY_LEVEL_LABELS] : null, data.institution, data.city].filter(Boolean).join(" · ")}</p>{data.bio && <p className="mt-4 max-w-2xl text-[15.5px]">{data.bio}</p>}</header>
        {data.certifications.length > 0 && <section aria-labelledby="c-h"><h2 id="c-h" className="mb-3 text-xl">Certifications NEXBRIDGE</h2><ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{data.certifications.map((c) => <li key={c.skill}><Card className="border-emerald-300"><CardBody className="flex items-center gap-3"><ShieldCheck className="h-7 w-7 text-emerald-700" aria-hidden /><div><p className="font-bold text-night">{c.skill}</p><p className="text-sm text-muted">{SKILL_LEVEL_LABELS[c.level]} · {c.basedOnProjects} projets validés</p></div></CardBody></Card></li>)}</ul></section>}
        <section aria-labelledby="s-h"><h2 id="s-h" className="mb-3 text-xl">Compétences</h2><ul className="flex flex-wrap gap-2">{data.skills.map((s) => <li key={s.name}><Badge tone={s.validated ? "green" : "neutral"}>{s.name} · {SKILL_LEVEL_LABELS[s.level]}{s.validated ? " ✔" : ""}</Badge></li>)}</ul><p className="mt-2 text-xs text-muted">✔ = validée par un projet réel et évaluée.</p></section>
        {data.badges.length > 0 && <section aria-labelledby="b-h"><h2 id="b-h" className="mb-3 text-xl">Badges</h2><ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.badges.map((b) => <li key={b.id}><Card className="h-full"><CardBody><Trophy className="mb-1 h-6 w-6 text-amber-500" aria-hidden /><p className="font-bold text-night">{b.name}</p><p className="text-sm text-muted">{b.description}</p><p className="mt-1 text-xs text-muted">{formatDate(b.awardedAt)}</p></CardBody></Card></li>)}</ul></section>}
        {data.projects.length > 0 && <section aria-labelledby="p-h"><h2 id="p-h" className="mb-3 text-xl">Projets réalisés</h2><Card><ul className="divide-y divide-line">{data.projects.map((p) => <li key={p.code} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div><p className="font-semibold text-night">{p.name}</p><p className="text-muted">{p.company} · {formatDate(p.issuedAt)}</p></div><Button asChild size="sm" variant="secondary"><Link to={`/verifier/${p.code}`}>Vérifier l'attestation</Link></Button></li>)}</ul></Card></section>}
      </div>
    </Section>
  );
}

export function VerifyPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  usePageTitle("Vérifier une attestation");
  const q = useQuery({ queryKey: ["verify", code], enabled: Boolean(code), retry: false, queryFn: () => api<{ valid: boolean; student: string; project: string; company: string; issuedAt: string }>(`/public/attestations/${encodeURIComponent(code!)}`, { auth: false }) });
  return (
    <Section tone="light" title={<h1 className="text-3xl sm:text-4xl">Vérifier une attestation</h1>} subtitle="Saisissez le code figurant en bas de l'attestation NEXBRIDGE.">
      <div className="mx-auto max-w-xl space-y-5">
        <form className="flex items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (input.trim()) navigate(`/verifier/${input.trim().toUpperCase()}`); }}><div className="flex-1"><Field label="Code de vérification">{(p) => <Input {...p} value={input} onChange={(e) => setInput(e.target.value)} placeholder="ex. A1B2C3D4E" autoComplete="off" />}</Field></div><Button type="submit">Vérifier</Button></form>
        {code && q.isLoading && <Skeleton className="h-24" />}
        {code && q.data && <Alert tone="success" title="Attestation authentique"><p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><strong>{q.data.student}</strong> a participé au projet « {q.data.project} » proposé par {q.data.company}. Délivrée le {formatDate(q.data.issuedAt)}.</span></p></Alert>}
        {code && q.error && <Alert tone="error" title="Code inconnu"><p className="flex items-start gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Aucune attestation NEXBRIDGE ne correspond à « {code} ». Vérifiez la saisie.</p></Alert>}
      </div>
    </Section>
  );
}

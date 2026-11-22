import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Clock, SearchX, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChallengeCard, ChallengeCardSkeleton } from "@/components/landing/ChallengeCard";
import { Section } from "@/components/landing/Section";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { useSectors, useSkills, type PublicChallenge, type PublicChallengeDetail } from "@/lib/queries";
import { useAuth } from "@/stores/auth";
import { NotFound } from "./NotFound";

const DURATIONS = [{ v: "", l: "Toutes les durées" }, { v: "1-6", l: "Jusqu'à 6 semaines" }, { v: "7-10", l: "7 à 10 semaines" }, { v: "11-104", l: "11 semaines et plus" }];

export function ProjectsPage() {
  const { t } = useTranslation("landing");
  usePageTitle("Découvrir les projets");
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "", sector = sp.get("secteur") ?? "", skill = sp.get("competence") ?? "", dur = sp.get("duree") ?? "";
  const sectors = useSectors(), skills = useSkills();
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };

  const query = useInfiniteQuery({
    queryKey: ["challenges", { q, sector, skill, dur }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: "12" });
      if (q) p.set("q", q); if (sector) p.set("sector", sector); if (skill) p.set("skill", skill);
      if (dur) { const [a, b] = dur.split("-"); if (a) p.set("minWeeks", a); if (b) p.set("maxWeeks", b); }
      if (pageParam) p.set("cursor", pageParam);
      return api<{ challenges: PublicChallenge[]; nextCursor: string | null }>(`/public/challenges?${p}`, { auth: false });
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.challenges) ?? [];
  const filtered = Boolean(q || sector || skill || dur);

  return (
    <Section tone="light" title={<h1 className="text-3xl sm:text-5xl">{t("marketplace.title")}</h1>} subtitle={t("marketplace.subtitle")}>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="mb-8 grid grid-cols-1 gap-4 rounded-lg border border-line bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("marketplace.search")}>{(p) => <Input {...p} type="search" value={q} onChange={(e) => set("q", e.target.value)} placeholder="Mot-clé, intitulé…" />}</Field>
        <Field label={t("marketplace.sector")}>{(p) => <Select {...p} value={sector} onChange={(e) => set("secteur", e.target.value)}><option value="">{t("marketplace.allSectors")}</option>{sectors.data?.sectors.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}</Select>}</Field>
        <Field label={t("marketplace.skills")}>{(p) => <Select {...p} value={skill} onChange={(e) => set("competence", e.target.value)}><option value="">Toutes les compétences</option>{skills.data?.skills.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}</Select>}</Field>
        <Field label={t("marketplace.duration")}>{(p) => <Select {...p} value={dur} onChange={(e) => set("duree", e.target.value)}>{DURATIONS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}</Select>}</Field>
      </form>
      <p className="sr-only" aria-live="polite">{query.isSuccess ? `${items.length} défi(s) affiché(s)` : ""}</p>
      {query.isLoading && <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <ChallengeCardSkeleton key={i} />)}</div>}
      {query.isError && <Alert tone="error" action={<Button size="sm" variant="secondary" onClick={() => query.refetch()}>Réessayer</Button>}>{t("marketplace.loadError")}</Alert>}
      {query.isSuccess && items.length === 0 && (
        <EmptyState icon={<SearchX className="h-6 w-6" />} title={filtered ? t("marketplace.emptyFiltered") : t("marketplace.empty")} action={filtered ? <Button variant="secondary" onClick={() => setSp({}, { replace: true })}>{t("marketplace.reset")}</Button> : <Button asChild><Link to="/inscription?role=ENTREPRISE">{t("companies.cta")}</Link></Button>}>{!filtered && t("marketplace.emptyHint")}</EmptyState>
      )}
      {items.length > 0 && <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">{items.map((c) => <li key={c.id}><ChallengeCard c={c} /></li>)}</ul>}
      {query.hasNextPage && <div className="mt-10 text-center"><Button variant="secondary" size="lg" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>Voir plus</Button></div>}
    </Section>
  );
}

export function ProjectDetailPage() {
  const { slug } = useParams();
  const { t } = useTranslation("landing");
  const user = useAuth((s) => s.user);
  const { data, isLoading, error } = useQuery({ queryKey: ["challenge", slug], queryFn: () => api<{ challenge: PublicChallengeDetail }>(`/public/challenges/${slug}`, { auth: false }), retry: false });
  usePageTitle(data?.challenge.title);
  const [applyOpen, setApplyOpen] = useState(false);
  const [motivation, setMotivation] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const submitApplication = async () => {
    if (!data) return;
    setApplying(true); setApplyError(null);
    try { await api(`/applications/challenge/${data.challenge.id}`, { method: "POST", body: { motivation } }); setApplied(true); setApplyOpen(false); toast.success("Candidature envoyée."); }
    catch (e) { setApplyError(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Envoi impossible."); }
    finally { setApplying(false); }
  };
  if (isLoading) return <div className="nb-container max-w-3xl space-y-4 py-16"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-5 w-1/3" /><Skeleton className="h-40" /></div>;
  if (error instanceof ApiError && error.status === 404) return <section className="nb-container py-24 text-center"><h1 className="text-3xl">{t("marketplace.notFound")}</h1><Button asChild className="mt-6"><Link to="/projets">{t("marketplace.back")}</Link></Button></section>;
  if (!data) return <NotFound />;
  const c = data.challenge;
  return (
    <section className="bg-cloud py-10 sm:py-16">
      <div className="nb-container grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
        <article>
          <Link to="/projets" className="inline-flex items-center gap-1.5 text-sm font-semibold text-nexus hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />{t("marketplace.back")}</Link>
          <div className="mt-4 flex flex-wrap gap-2">{c.sector && <Badge tone="blue">{c.sector.name}</Badge>}{c.isDemo && <Badge tone="amber">Exemple — donnée de démonstration</Badge>}</div>
          <h1 className="mt-3 text-3xl sm:text-4xl">{c.title}</h1>
          <p className="mt-3 flex items-center gap-2 font-medium text-muted"><Building2 className="h-5 w-5" aria-hidden />{c.company}</p>
          <h2 className="mt-8 text-xl">{t("marketplace.context")}</h2>
          <p className="mt-2 whitespace-pre-line text-[16px] leading-7 text-ink">{c.context}</p>
          {c.objectives && <><h2 className="mt-8 text-xl">{t("marketplace.objectives")}</h2><p className="mt-2 whitespace-pre-line text-[16px] leading-7 text-ink">{c.objectives}</p></>}
          {c.skills.length > 0 && <><h2 className="mt-8 text-xl">{t("marketplace.skills")}</h2><ul className="mt-3 flex flex-wrap gap-2">{c.skills.map((s) => <li key={s.slug}><Badge tone="violet">{s.name}</Badge></li>)}</ul></>}
        </article>
        <aside className="h-fit space-y-5 lg:sticky lg:top-24">
          <Card><CardBody className="space-y-3 text-[15px]">
            {c.durationWeeks && <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted" aria-hidden />{t("marketplace.weeksValue", { count: c.durationWeeks })}</p>}
            <p className="flex items-center gap-2"><Users className="h-4 w-4 text-muted" aria-hidden />{t("marketplace.participants", { count: c.teamSize })}</p>
          </CardBody></Card>
          <Card><CardBody>
            {user?.role === "ETUDIANT" ? (
              <>
                {applied ? <Alert tone="success">Candidature envoyée. Suivez-la dans « Candidatures ».</Alert> : (<><h2 className="text-lg">{t("marketplace.apply")}</h2><p className="mt-2 text-sm text-muted">Expliquez en quelques lignes pourquoi ce défi vous intéresse. L'entreprise verra votre profil et vos compétences.</p><Button size="lg" className="mt-4 w-full" onClick={() => setApplyOpen(true)} disabled={!user.emailVerified || !user.onboardingDone}>Candidater</Button>{(!user.emailVerified || !user.onboardingDone) && <p className="mt-2 text-xs text-muted">{!user.emailVerified ? "Confirmez votre e-mail" : "Complétez votre profil"} pour candidater.</p>}</>)}
                <Modal open={applyOpen} onOpenChange={setApplyOpen} title="Candidater à ce défi" description={c.title}>
                  {applyError && <Alert tone="error" className="mb-3">{applyError}</Alert>}
                  <label htmlFor="motivation" className="mb-1.5 block text-sm font-semibold text-night">Votre motivation</label>
                  <Textarea id="motivation" rows={6} maxLength={1500} value={motivation} onChange={(e) => setMotivation(e.target.value)} />
                  <p className="mt-1 text-xs text-muted">{motivation.length} / 1500 — 20 caractères minimum</p>
                  <div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setApplyOpen(false)}>Annuler</Button><Button loading={applying} disabled={motivation.trim().length < 20} onClick={submitApplication}>Envoyer ma candidature</Button></div>
                </Modal>
              </>
            ) : user ? (
              <p className="text-sm text-muted">Seuls les comptes étudiants peuvent postuler à un défi.</p>
            ) : (
              <>
                <h2 className="text-lg">{t("marketplace.apply")}</h2>
                <p className="mt-2 text-sm text-muted">{t("marketplace.applyHint")}</p>
                <div className="mt-4 grid gap-2"><Button asChild size="lg"><Link to="/inscription?role=ETUDIANT">Créer un compte étudiant</Link></Button><Button asChild variant="secondary"><Link to="/connexion">Se connecter</Link></Button></div>
              </>
            )}
          </CardBody></Card>
        </aside>
      </div>
    </section>
  );
}

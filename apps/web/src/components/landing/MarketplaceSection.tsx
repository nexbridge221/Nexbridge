import { ArrowRight, Telescope } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Section } from "./Section";
import { ChallengeCard, ChallengeCardSkeleton } from "./ChallengeCard";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { PublicChallenge } from "@/lib/queries";

export function MarketplaceSection() {
  const { t } = useTranslation("landing");
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["challenges", "home"], queryFn: () => api<{ challenges: PublicChallenge[] }>("/public/challenges?limit=3", { auth: false }) });
  return (
    <Section id="marketplace" tone="light" eyebrow={t("marketplace.eyebrow")} title={t("marketplace.title")} subtitle={t("marketplace.subtitle")}>
      {isLoading && <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <ChallengeCardSkeleton key={i} />)}</div>}
      {isError && <Alert tone="error" action={<Button size="sm" variant="secondary" onClick={() => refetch()}>Réessayer</Button>}>{t("marketplace.loadError")}</Alert>}
      {data && data.challenges.length === 0 && (
        <EmptyState icon={<Telescope className="h-6 w-6" />} title={t("marketplace.empty")} action={<Button asChild><Link to="/inscription?role=ENTREPRISE">{t("companies.cta")}</Link></Button>}>{t("marketplace.emptyHint")}</EmptyState>
      )}
      {data && data.challenges.length > 0 && (
        <>
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">{data.challenges.map((c) => <li key={c.id}><ChallengeCard c={c} /></li>)}</ul>
          <div className="mt-10 text-center"><Button asChild size="lg"><Link to="/projets">{t("marketplace.seeAll")}<ArrowRight className="h-5 w-5" aria-hidden /></Link></Button></div>
        </>
      )}
    </Section>
  );
}

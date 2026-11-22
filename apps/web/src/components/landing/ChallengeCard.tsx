import { Building2, Clock, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge, Card, CardBody } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import type { PublicChallenge } from "@/lib/queries";

export function ChallengeCard({ c }: { c: PublicChallenge }) {
  const { t } = useTranslation(["landing", "common"]);
  return (
    <Card className="flex h-full flex-col transition-shadow hover:shadow-pop">
      <CardBody className="flex h-full flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {c.sector && <Badge tone="blue">{c.sector.name}</Badge>}
          {c.isDemo && <Badge tone="amber">{t("testimonials.demoBadge")}</Badge>}
        </div>
        <h3 className="text-lg leading-snug"><Link to={`/projets/${c.slug}`} className="hover:text-nexus hover:underline">{c.title}</Link></h3>
        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-muted"><Building2 className="h-4 w-4" aria-hidden /><span className="sr-only">{t("marketplace.company")} : </span>{c.company}</p>
        <p className="mt-3 text-[14.5px] text-muted">{c.summary}</p>
        {c.skills.length > 0 && (
          <div className="mt-4">
            <p className="sr-only">{t("marketplace.skills")}</p>
            <ul className="flex flex-wrap gap-1.5">{c.skills.slice(0, 4).map((s) => <li key={s.slug}><Badge>{s.name}</Badge></li>)}{c.skills.length > 4 && <li><Badge>+{c.skills.length - 4}</Badge></li>}</ul>
          </div>
        )}
        <dl className="mt-5 grid grid-cols-1 gap-2 border-t border-line pt-4 text-sm text-ink">
          {c.durationWeeks && <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted" aria-hidden /><dt className="sr-only">{t("marketplace.duration")}</dt><dd>{t("marketplace.weeksValue", { count: c.durationWeeks })}</dd></div>}
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted" aria-hidden /><dd>{t("marketplace.participants", { count: c.teamSize })}</dd></div>
        </dl>
        <Button asChild variant="secondary" className="mt-5 w-full"><Link to={`/projets/${c.slug}`}>{t("actions.seeProject", { ns: "common" })}</Link></Button>
      </CardBody>
    </Card>
  );
}

export function ChallengeCardSkeleton() {
  return (
    <Card aria-hidden><CardBody className="space-y-3"><div className="nb-skeleton h-5 w-24" /><div className="nb-skeleton h-6 w-full" /><div className="nb-skeleton h-4 w-1/2" /><div className="nb-skeleton h-16 w-full" /><div className="nb-skeleton h-10 w-full" /></CardBody></Card>
  );
}

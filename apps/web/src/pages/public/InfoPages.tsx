import { Check } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Audience } from "@/components/landing/Audience";
import { ContactForm, ContactSection } from "@/components/landing/Forms";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Section } from "@/components/landing/Section";
import { solutionIcons, type SolutionItem } from "@/components/landing/Solutions";
import { MarketplaceSection } from "@/components/landing/MarketplaceSection";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";
import { NotFound } from "./NotFound";

export function HowPage() {
  const { t } = useTranslation("landing");
  usePageTitle(t("nav.how", { ns: "common" }));
  const details = t("howPage.details", { returnObjects: true }) as { title: string; items: string[] }[];
  return (
    <>
      <Section tone="white" title={<h1 className="text-3xl sm:text-5xl">{t("howPage.title")}</h1>} subtitle={t("howPage.intro")}>
        <div className="mx-auto grid grid-cols-1 max-w-4xl gap-5 md:grid-cols-2">
          {details.map((d) => (
            <Card key={d.title}><CardBody>
              <h2 className="text-xl">{d.title}</h2>
              <ul className="mt-4 space-y-3">{d.items.map((i) => <li key={i} className="flex gap-2.5 text-[15px] text-muted"><Check className="mt-1 h-4 w-4 shrink-0 text-nexus" aria-hidden />{i}</li>)}</ul>
            </CardBody></Card>
          ))}
        </div>
      </Section>
      <HowItWorks withCta={false} />
      <FinalCta />
    </>
  );
}

export function AudiencePage({ k }: { k: "companies" | "students" | "institutions" | "mentors" }) {
  const { t } = useTranslation(["landing", "common"]);
  usePageTitle(t(`${k}.eyebrow`, { ns: "landing" }));
  return (
    <>
      <Audience k={k} tone="white" standalone />
      <Section tone="light" center={false}><p className="mx-auto max-w-3xl text-center text-lg text-muted">{t(`${k}.pageIntro`, { ns: "landing" })}</p></Section>
      <HowItWorks withCta={false} tone="white" />
      {k === "companies" || k === "students" ? <MarketplaceSection /> : null}
      <FinalCta />
    </>
  );
}

const availability: Record<string, { label: string; tone: "green" | "amber" | "blue" }> = {
  nexbrief: { label: "Phase 2", tone: "amber" }, nexmatch: { label: "Phase 2", tone: "amber" }, nexspace: { label: "Phase 3", tone: "amber" },
  nexbadge: { label: "Phase 4", tone: "amber" }, nexdash: { label: "Phase 4", tone: "amber" }, paiement: { label: "Phase 5", tone: "amber" },
  profils: { label: "Disponible", tone: "green" }, "back-office": { label: "Phases 2 à 4", tone: "amber" },
};

export function SolutionPage() {
  const { slug } = useParams();
  const { t } = useTranslation("landing");
  const items = t("solutions.items", { returnObjects: true }) as SolutionItem[];
  const item = items.find((i) => i.slug === slug);
  usePageTitle(item?.name);
  if (!item) return <NotFound />;
  const Icon = solutionIcons[item.icon]!;
  const av = availability[item.slug] ?? { label: "À venir", tone: "amber" as const };
  return (
    <>
      <Section tone="white" center={false}>
        <div className="mx-auto max-w-3xl">
          <Link to="/#solutions" className="text-sm font-semibold text-nexus hover:underline">← {t("solutionPage.back")}</Link>
          <div className="mt-6 flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-md bg-blue-50 text-nexus"><Icon className="h-7 w-7" aria-hidden /></span><div><h1 className="text-3xl sm:text-4xl">{item.name}</h1><p className="font-semibold text-nexus">{item.tagline}</p></div></div>
          <p className="mt-6 text-lg text-ink">{item.body}</p>
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">{t("solutionPage.status")} : <Badge tone={av.tone}>{av.label}</Badge></p>
          <div className="mt-8"><Button asChild size="lg"><Link to="/inscription">{t("solutionPage.cta")}</Link></Button></div>
        </div>
      </Section>
      <FinalCta />
    </>
  );
}

export function ContactPage() {
  usePageTitle("Contact");
  return <><ContactSection /></>;
}
export { ContactForm };

export function FaqPage() {
  usePageTitle("Questions fréquentes");
  return <><Faq full /><ContactSection /></>;
}

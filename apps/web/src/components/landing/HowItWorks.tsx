import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Section } from "./Section";
import { Button } from "@/components/ui/button";

const stepColors = ["bg-nexus", "bg-impact-text", "bg-collab-text", "bg-night"];

export function HowItWorks({ withCta = true, tone = "light" as "light" | "white" }) {
  const { t } = useTranslation("landing");
  const steps = t("how.steps", { returnObjects: true }) as { title: string; body: string }[];
  return (
    <Section id="comment" tone={tone} eyebrow={t("how.eyebrow")} title={t("how.title")} subtitle={t("how.subtitle")}>
      <ol className="relative grid grid-cols-1 gap-8 lg:grid-cols-4 lg:gap-6">
        {/* Ligne de liaison (desktop) */}
        <div className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-0.5 bg-gradient-to-r from-nexus via-impact to-collab lg:block" aria-hidden />
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-5 lg:flex-col lg:items-center lg:gap-4 lg:text-center">
            <span className={`relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-extrabold text-white shadow-lg ring-4 ring-cloud ${stepColors[i]}`} aria-hidden>{i + 1}</span>
            <div>
              <h3 className="text-lg"><span className="sr-only">Étape {i + 1} : </span>{s.title}</h3>
              <p className="mt-2 text-[15px] text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {withCta && <div className="mt-12 text-center"><Button asChild variant="secondary"><Link to="/comment-ca-marche">{t("how.cta")}<ArrowRight className="h-4 w-4" aria-hidden /></Link></Button></div>}
    </Section>
  );
}

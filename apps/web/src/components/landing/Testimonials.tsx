import { Quote } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Section } from "./Section";
import { Badge, Card, CardBody } from "@/components/ui/misc";
import { useTestimonials } from "@/lib/queries";

export function Testimonials() {
  const { t } = useTranslation("landing");
  const { data } = useTestimonials();
  if (!data || data.testimonials.length === 0) return null; // administrables : rien d'inventé quand il n'y en a pas
  return (
    <Section id="temoignages" tone="white" eyebrow={t("testimonials.eyebrow")} title={t("testimonials.title")}>
      <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {data.testimonials.map((x) => (
          <li key={x.id}>
            <Card className="h-full"><CardBody>
              <Quote className="mb-3 h-7 w-7 text-impact" aria-hidden />
              <blockquote className="text-[15.5px] text-ink">{x.quote}</blockquote>
              <figcaption className="mt-5 text-sm"><span className="font-bold text-night">{x.authorName}</span>{(x.authorRole || x.organization) && <span className="text-muted"> — {[x.authorRole, x.organization].filter(Boolean).join(", ")}</span>}</figcaption>
              {x.isDemo && <Badge tone="amber" className="mt-3">{t("testimonials.demoNote")}</Badge>}
            </CardBody></Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

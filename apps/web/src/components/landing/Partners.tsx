import { Handshake } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Section } from "./Section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { usePartners } from "@/lib/queries";

export function Partners() {
  const { t } = useTranslation("landing");
  const { data } = usePartners();
  return (
    <Section id="partenaires" tone="light" eyebrow={t("partners.eyebrow")} title={t("partners.title")}>
      {data && data.partners.length > 0 ? (
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {data.partners.map((p) => (
            <li key={p.id} className="text-lg font-bold text-slate-600">
              {p.logoUrl ? <img src={p.logoUrl} alt={p.name} className="h-10 w-auto grayscale" loading="lazy" /> : p.name}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Handshake className="h-6 w-6" />} title={t("partners.empty")} action={<Button asChild variant="secondary"><Link to="/contact">{t("partners.cta")}</Link></Button>} />
      )}
    </Section>
  );
}

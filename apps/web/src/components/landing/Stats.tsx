import { useTranslation } from "react-i18next";
import { Section } from "./Section";
import { formatNumber } from "@/lib/format";
import { usePublicStats } from "@/lib/queries";

/** Chiffres réels uniquement : une valeur à zéro n'est pas affichée ; si rien n'est affichable, la section disparaît. */
export function Stats() {
  const { t } = useTranslation("landing");
  const { data } = usePublicStats();
  if (!data) return null;
  const items = (["students", "mentors", "companies", "institutions", "challenges"] as const).filter((k) => data[k] > 0);
  if (items.length === 0) return null;
  return (
    <Section id="chiffres" tone="dark" eyebrow={t("stats.eyebrow")} title={t("stats.title")}>
      <dl className="grid grid-cols-2 gap-6 text-center md:grid-cols-3 lg:grid-cols-5">
        {items.map((k) => (
          <div key={k} className="rounded-lg border border-white/10 bg-white/5 p-5">
            <dd className="text-4xl font-extrabold text-white">{formatNumber(data[k])}</dd>
            <dt className="mt-1 text-sm font-medium text-slate-300">{t(`stats.items.${k}`)}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-center text-sm text-slate-300">{data.isDemoData ? t("stats.demoNote") : t("stats.note")}</p>
    </Section>
  );
}

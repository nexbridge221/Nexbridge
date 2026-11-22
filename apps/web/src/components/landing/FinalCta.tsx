import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  const { t } = useTranslation("landing");
  return (
    <section className="relative overflow-hidden bg-night py-16 text-white sm:py-20" aria-labelledby="cta-title">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gradient-to-br from-nexus/50 to-impact/40 blur-3xl" aria-hidden />
      <div className="nb-container relative text-center">
        <h2 id="cta-title" className="mx-auto max-w-3xl text-3xl text-white sm:text-4xl">{t("cta.title")}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-200">{t("cta.subtitle")}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg"><Link to="/inscription">{t("cta.primary")}</Link></Button>
          <Button asChild size="lg" variant="outlineLight"><Link to="/projets">{t("cta.secondary")}</Link></Button>
        </div>
      </div>
    </section>
  );
}

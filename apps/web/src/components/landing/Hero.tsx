import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EcosystemDiagram } from "@/components/brand/EcosystemDiagram";

export function Hero() {
  const { t } = useTranslation("landing");
  return (
    <section className="relative overflow-hidden bg-night text-white" aria-labelledby="hero-title">
      {/* Courbes dégradées de l'univers graphique de la charte */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1440 700" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="hc1" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#0b5fff" stopOpacity="0" /><stop offset=".6" stopColor="#0b5fff" stopOpacity=".55" /><stop offset="1" stopColor="#3b82f6" stopOpacity=".9" /></linearGradient>
          <linearGradient id="hc2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#8b5cf6" stopOpacity="0" /><stop offset=".7" stopColor="#8b5cf6" stopOpacity=".5" /><stop offset="1" stopColor="#a78bfa" stopOpacity=".8" /></linearGradient>
        </defs>
        <path d="M600 760 C 900 520, 1120 300, 1500 120 L1500 -10 L1180 -10 C 1020 200, 800 420, 520 760 Z" fill="url(#hc1)" />
        <path d="M780 760 C 1060 600, 1260 440, 1500 330 L1500 160 C 1250 300, 1050 480, 880 760 Z" fill="url(#hc2)" />
      </svg>
      <div className="nb-container relative grid grid-cols-1 items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:py-28">
        <div className="nb-in">
          <p className="mb-5 inline-flex rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[13px] font-semibold text-slate-100">{t("hero.eyebrow")}</p>
          <h1 id="hero-title" className="text-[2.25rem] font-extrabold leading-[1.08] text-white sm:text-5xl lg:text-[3.5rem]">
            {t("hero.title")}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-slate-200 sm:text-xl">{t("hero.subtitle")}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg"><Link to="/inscription?role=ENTREPRISE">{t("hero.ctaChallenge")}<ArrowRight className="h-5 w-5" aria-hidden /></Link></Button>
            <Button asChild size="lg" variant="outlineLight"><Link to="/projets">{t("hero.ctaOpportunities")}</Link></Button>
          </div>
          <p className="mt-8 text-sm text-slate-300">{t("hero.trust")}</p>
        </div>
        <div className="nb-in" style={{ animationDelay: ".15s" }}><EcosystemDiagram /></div>
      </div>
    </section>
  );
}

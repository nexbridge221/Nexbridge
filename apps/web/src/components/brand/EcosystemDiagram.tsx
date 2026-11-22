import { Briefcase, GraduationCap, Landmark, Rocket, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Représentation animée de l'écosystème : entreprises, étudiants, établissements et mentors
 * reliés autour de NEXBRIDGE et des projets. Décorative pour les lecteurs d'écran (description fournie),
 * animations coupées si l'utilisateur demande de réduire les mouvements.
 */
const nodes = [
  { key: "company", x: 14, y: 24, Icon: Briefcase, color: "#0b5fff", delay: "0s" },
  { key: "student", x: 86, y: 24, Icon: GraduationCap, color: "#8b5cf6", delay: "1.2s" },
  { key: "institution", x: 14, y: 76, Icon: Landmark, color: "#14b8a6", delay: "2.4s" },
  { key: "mentor", x: 86, y: 76, Icon: UserRound, color: "#f59e0b", delay: "3.6s" },
] as const;

export function EcosystemDiagram() {
  const { t } = useTranslation("landing");
  return (
    <figure className="relative mx-auto aspect-square w-full max-w-[520px]" aria-label={t("hero.diagramLabel")} role="img">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="nb-line" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b82f6" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
          <radialGradient id="nb-glow"><stop offset="0" stopColor="#3b82f6" stopOpacity=".45" /><stop offset="1" stopColor="#3b82f6" stopOpacity="0" /></radialGradient>
        </defs>
        <circle cx="50" cy="50" r="34" fill="url(#nb-glow)" />
        <circle cx="50" cy="50" r="30" fill="none" stroke="#3b82f6" strokeOpacity=".25" strokeWidth=".4" vectorEffect="non-scaling-stroke" />
        {nodes.map((n) => (
          <line key={n.key} x1="50" y1="50" x2={n.x} y2={n.y} stroke="url(#nb-line)" strokeWidth="1.5" className="nb-dash" vectorEffect="non-scaling-stroke" />
        ))}
        <path d="M14 24 Q50 4 86 24 M86 24 Q96 50 86 76 M86 76 Q50 96 14 76 M14 76 Q4 50 14 24" fill="none" stroke="#3b82f6" strokeOpacity=".35" strokeWidth="1" className="nb-dash" vectorEffect="non-scaling-stroke" />
        {nodes.map((n) => (<circle key={`p-${n.key}`} cx={n.x} cy={n.y} r="3" fill={n.color} className="nb-pulse" style={{ animationDelay: n.delay }} />))}
      </svg>

      {/* Noyau */}
      <div className="absolute left-1/2 top-1/2 flex h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[28%] bg-night-2 shadow-pop ring-1 ring-white/20">
        <img src="/brand/logo-mark.png" alt="" className="h-[58%] w-auto" />
      </div>

      {nodes.map((n) => (
        <div key={n.key} className="nb-float absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5" style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: n.delay }}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg ring-4 ring-white/10 sm:h-14 sm:w-14" style={{ background: n.color }}>
            <n.Icon className="h-6 w-6" aria-hidden />
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur sm:text-xs">{t(`hero.nodes.${n.key}`)}</span>
        </div>
      ))}
      <div className="nb-float absolute left-1/2 top-[4%] flex -translate-x-1/2 flex-col items-center gap-1" style={{ animationDelay: "1.8s" }}>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-nexus shadow-lg"><Rocket className="h-5 w-5" aria-hidden /></span>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur sm:text-xs">{t("hero.nodes.projects")}</span>
      </div>
    </figure>
  );
}

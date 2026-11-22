import { ArrowRight, Briefcase, Check, GraduationCap, Landmark, UserRound, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Section } from "./Section";
import { Button } from "@/components/ui/button";

const cfg: Record<"companies" | "students" | "institutions" | "mentors", { Icon: LucideIcon; accent: string; chip: string; to: string; role: string }> = {
  companies: { Icon: Briefcase, accent: "bg-nexus", chip: "bg-blue-50 text-nexus", to: "/entreprises", role: "ENTREPRISE" },
  students: { Icon: GraduationCap, accent: "bg-impact-text", chip: "bg-violet-50 text-impact-text", to: "/etudiants", role: "ETUDIANT" },
  institutions: { Icon: Landmark, accent: "bg-collab-text", chip: "bg-teal-50 text-collab-text", to: "/etablissements", role: "REFERENT_ACADEMIQUE" },
  mentors: { Icon: UserRound, accent: "bg-amber-text", chip: "bg-amber-50 text-amber-text", to: "/experts-mentors", role: "MENTOR" },
};

export function Audience({ k, tone = "light", reverse = false, standalone = false }: { k: keyof typeof cfg; tone?: "light" | "white"; reverse?: boolean; standalone?: boolean }) {
  const { t } = useTranslation("landing");
  const c = cfg[k];
  const benefits = t(`${k}.benefits`, { returnObjects: true }) as string[];
  return (
    <Section id={k} tone={tone} center={false}>
      <div className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
        <div>
          <p className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${c.chip}`}><c.Icon className="h-4 w-4" aria-hidden />{t(`${k}.eyebrow`)}</p>
          {standalone ? <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem]">{t(`${k}.title`)}</h1> : <h2 className="text-3xl sm:text-4xl">{t(`${k}.title`)}</h2>}
          <p className="mt-4 text-lg text-muted">{t(`${k}.subtitle`)}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to={`/inscription?role=${c.role}`}>{t(`${k}.cta`)}<ArrowRight className="h-5 w-5" aria-hidden /></Link></Button>
            {!standalone && <Button asChild size="lg" variant="secondary"><Link to={c.to}>{t("solutions.learnMore")}</Link></Button>}
          </div>
        </div>
        <ul className="grid gap-3 rounded-xl border border-line bg-white p-5 shadow-card sm:p-7">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-3 rounded-md p-2.5 text-[15.5px] font-medium text-night">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${c.accent}`}><Check className="h-4 w-4" aria-hidden /></span>{b}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

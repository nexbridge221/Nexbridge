import { Briefcase, Check, GraduationCap, Landmark } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Section } from "./Section";
import { Card, CardBody } from "@/components/ui/misc";

const actorStyle = {
  company: { Icon: Briefcase, bg: "bg-blue-50", fg: "text-nexus" },
  student: { Icon: GraduationCap, bg: "bg-violet-50", fg: "text-impact-text" },
  institution: { Icon: Landmark, bg: "bg-teal-50", fg: "text-collab-text" },
} as const;

export function ProblemSolution() {
  const { t } = useTranslation("landing");
  const actors = t("problem.actors", { returnObjects: true }) as { key: keyof typeof actorStyle; title: string; points: string[] }[];
  return (
    <Section id="probleme" tone="white" eyebrow={t("problem.eyebrow")} title={t("problem.title")} subtitle={t("problem.subtitle")}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {actors.map((a) => {
          const s = actorStyle[a.key];
          return (
            <Card key={a.key} className="h-full">
              <CardBody>
                <span className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-md ${s.bg} ${s.fg}`}><s.Icon className="h-6 w-6" aria-hidden /></span>
                <h3 className="text-xl">{a.title}</h3>
                <ul className="mt-4 space-y-3 text-[15px] text-muted">
                  {a.points.map((p) => <li key={p} className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />{p}</li>)}
                </ul>
              </CardBody>
            </Card>
          );
        })}
      </div>
      <div className="mt-10 overflow-hidden rounded-xl bg-gradient-to-br from-night to-night-2 p-8 text-white sm:p-12">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-nexus"><Check className="h-6 w-6" aria-hidden /></span>
          <h3 className="text-2xl text-white sm:text-3xl">{t("problem.solutionTitle")}</h3>
          <p className="mt-4 text-lg text-slate-200">{t("problem.solutionBody")}</p>
        </div>
      </div>
    </Section>
  );
}

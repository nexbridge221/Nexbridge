import { ArrowRight, Award, BarChart3, CreditCard, FileText, KanbanSquare, ShieldCheck, Sparkles, UserCircle, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Section } from "./Section";
import { Card, CardBody } from "@/components/ui/misc";

export const solutionIcons: Record<string, LucideIcon> = { FileText, Sparkles, KanbanSquare, Award, BarChart3, CreditCard, UserCircle, ShieldCheck };
export interface SolutionItem { slug: string; icon: string; name: string; tagline: string; body: string }
const tint = ["text-nexus bg-blue-50", "text-impact-text bg-violet-50", "text-collab-text bg-teal-50", "text-amber-text bg-amber-50"];

export function Solutions() {
  const { t } = useTranslation("landing");
  const items = t("solutions.items", { returnObjects: true }) as SolutionItem[];
  return (
    <Section id="solutions" tone="white" eyebrow={t("solutions.eyebrow")} title={t("solutions.title")} subtitle={t("solutions.subtitle")}>
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((s, i) => {
          const Icon = solutionIcons[s.icon] ?? FileText;
          return (
            <li key={s.slug}>
              <Card className="group h-full transition-shadow hover:shadow-pop">
                <CardBody className="flex h-full flex-col">
                  <span className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-md ${tint[i % 4]}`}><Icon className="h-6 w-6" aria-hidden /></span>
                  <h3 className="text-lg">{s.name}</h3>
                  <p className="mt-0.5 text-sm font-semibold text-nexus">{s.tagline}</p>
                  <p className="mt-3 flex-1 text-[14.5px] text-muted">{s.body}</p>
                  <Link to={`/solutions/${s.slug}`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-nexus hover:underline">
                    {t("solutions.learnMore")}<span className="sr-only"> sur {s.name}</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

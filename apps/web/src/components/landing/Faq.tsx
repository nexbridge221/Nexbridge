import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Section } from "./Section";
import { Skeleton } from "@/components/ui/misc";
import { useFaq } from "@/lib/queries";

export function Faq({ limit, full = false }: { limit?: number; full?: boolean }) {
  const { t } = useTranslation("landing");
  const { data, isLoading } = useFaq();
  const items = (data?.items ?? []).slice(0, limit);
  return (
    <Section id="faq" tone="white" eyebrow={t("faq.eyebrow")} title={full ? undefined : t("faq.title")}>
      {isLoading && <div className="mx-auto max-w-3xl space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
      {data && items.length === 0 && <p className="text-center text-muted">{t("faq.empty")}</p>}
      <div className="mx-auto max-w-3xl divide-y divide-line rounded-lg border border-line bg-white">
        {items.map((q) => (
          <details key={q.id} className="group px-5 py-4 open:bg-cloud/60">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold text-night [&::-webkit-details-marker]:hidden">
              <span>{q.question}</span><ChevronDown className="h-5 w-5 shrink-0 text-nexus transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="mt-3 text-[15px] leading-7 text-muted">{q.answer}</p>
          </details>
        ))}
      </div>
      {!full && data && data.items.length > 0 && <p className="mt-8 text-center"><Link to="/faq" className="font-semibold text-nexus hover:underline">{t("faq.all")}</Link></p>}
    </Section>
  );
}

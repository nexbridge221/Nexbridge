import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";

/** Bandeaux d'environnement : démonstration et e-mails non envoyés. Jamais de données fictives présentées comme réelles. */
export function EnvBanners() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ["env"], queryFn: () => api<{ demoMode: boolean; emailDelivery: string }>("/public/env", { auth: false }), staleTime: 5 * 60_000, retry: false });
  if (!data) return null;
  return (
    <>
      {data.demoMode && <div role="note" className="bg-amber-400 px-4 py-1.5 text-center text-[13px] font-semibold text-night">{t("banner.demo")}</div>}
      {data.emailDelivery !== "reel" && <div role="note" className="bg-slate-800 px-4 py-1.5 text-center text-[12.5px] text-slate-100">{t("banner.mail")}</div>}
    </>
  );
}

import { ArrowRight, BadgeCheck, Briefcase, CheckCircle2, CircleDashed, FileText, FolderKanban, Search, ShieldAlert, Sparkles, UserCheck } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, Progress, Skeleton } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";
import { profileCompletion, useMe } from "@/lib/me";
import { usePublicStats } from "@/lib/queries";
import { NexDash } from "@/components/NexDash";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";

const phases: Record<string, { items: { name: string; phase: string }[] }> = {
  ETUDIANT: { items: [{ name: "Badges, compétences validées, attestations", phase: "Phase 4" }] },
  ENTREPRISE: { items: [{ name: "Paiement et factures", phase: "Phase 5" }] },
  MENTOR: { items: [{ name: "Évaluations et rapports", phase: "Phase 4" }] },
  REFERENT_ACADEMIQUE: { items: [{ name: "Cohortes et suivi des étudiants", phase: "Phase 4" }, { name: "Crédits, compétences et rapports PDF/CSV", phase: "Phase 4" }] },
};

export default function Dashboard() {
  const { t } = useTranslation("app");
  usePageTitle(t("nav.dashboard"));
  const user = useAuth((s) => s.user)!;
  const { data: me, isLoading } = useMe();
  const { data: stats } = usePublicStats();
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return <Navigate to="/app/admin/tableau-de-bord" replace />;
  const mine = useQuery({ queryKey: ["my-challenges"], queryFn: () => api<{ challenges: { status: string; applications: number }[] }>("/challenges"), enabled: user.role === "ENTREPRISE" });
  const invitations = useQuery({ queryKey: ["invitations"], queryFn: () => api<{ invitations: { status: string; teamStatus: string; hasProject: boolean }[] }>("/applications/invitations"), enabled: user.role === "ETUDIANT" });
  const myApps = useQuery({ queryKey: ["applications"], queryFn: () => api<{ applications: { status: string }[] }>("/applications"), enabled: user.role === "ETUDIANT" });
  const acad = useQuery({ queryKey: ["academic-validations"], queryFn: () => api<{ validations: unknown[] }>("/academic/validations"), enabled: user.role === "REFERENT_ACADEMIQUE" });
  const completion = me ? profileCompletion(user.role, me) : null;
  const pendingInv = invitations.data?.invitations.filter((i) => i.status === "INVITE" && i.teamStatus === "EN_VALIDATION").length ?? 0;
  const kyc = me?.company?.kycStatus;

  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl sm:text-3xl">{t("dashboard.welcome", { name: user.firstName })}</h1><p className="mt-1 text-muted">{t("dashboard.intro")}</p></header>

      {isLoading && <div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>}

      {completion && completion.percent < 100 && (
        <Card className="border-nexus/30"><CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-nexus"><UserCheck className="h-6 w-6" aria-hidden /></span>
          <div className="min-w-0 flex-1"><h2 className="text-lg">{t("dashboard.onboardingTitle")}</h2><p className="mt-1 text-sm text-muted">{t("dashboard.onboardingBody")}</p>
            <div className="mt-3 flex items-center gap-3"><Progress value={completion.percent} label="Complétion du profil" className="max-w-xs" /><span className="text-sm font-bold text-night">{completion.percent} %</span></div>
            <p className="mt-2 text-xs text-muted">{t("onboarding.missing", { items: completion.missing.join(", ") })}</p></div>
          <Button asChild><Link to={user.onboardingDone ? (user.role === "ENTREPRISE" ? "/app/organisation" : "/app/profil") : "/app/onboarding"}>{t("dashboard.onboardingCta")}<ArrowRight className="h-4 w-4" aria-hidden /></Link></Button>
        </CardBody></Card>
      )}

      {user.role === "ENTREPRISE" && me?.company && kyc !== "VALIDE" && (
        <Alert tone={kyc === "REFUSE" ? "error" : kyc === "EN_VERIFICATION" ? "info" : "warning"} title={t("dashboard.kycTitle")} action={<Button asChild size="sm" variant="secondary"><Link to="/app/organisation">{t("dashboard.kycGo")}</Link></Button>}>
          {kyc === "EN_VERIFICATION" ? "Votre dossier est en cours de vérification (généralement sous 48 h)." : kyc === "REFUSE" ? me.company.kycRejectionReason ?? "Votre dossier a été refusé. Consultez-le pour le corriger." : t("dashboard.kycPending")}
        </Alert>
      )}

      <section aria-labelledby="stats-h"><h2 id="stats-h" className="mb-3 text-lg">{t("dashboard.stats")}</h2>
        <NexDash role={user.role} />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1"><StatCard icon={<UserCheck className="h-5 w-5" />} label="Profil complété" value={completion ? `${completion.percent} %` : "—"} />{user.role === "ENTREPRISE" && <StatCard icon={<ShieldAlert className="h-5 w-5" />} label="Validation de l'organisation" value={kyc ? t(`kyc.${kyc}`) : "—"} />}{user.role === "REFERENT_ACADEMIQUE" && <StatCard icon={<UserCheck className="h-5 w-5" />} label="Projets à valider" value={acad.data ? String(acad.data.validations.length) : "—"} />}<StatCard icon={<Briefcase className="h-5 w-5" />} label="Défis publics ouverts" value={stats ? String(stats.challenges) : "—"} hint={stats?.isDemoData ? "Inclut des données de démonstration" : undefined} /></div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card><CardBody>
          <h2 className="text-lg">{t("dashboard.checklist")}</h2>
          <ul className="mt-4 space-y-3 text-[15px]">
            <Step done={Boolean(user.emailVerified)} label="Adresse e-mail confirmée" />
            <Step done={user.onboardingDone} label="Profil de base complété" />
            {user.role === "ENTREPRISE" && <Step done={kyc === "VALIDE"} label="Organisation validée (KYC)" />}
            <Step done={user.twoFactorEnabled} label="Authentification à deux facteurs activée (recommandé)" to="/app/parametres" />
          </ul>
          {user.role === "ETUDIANT" && pendingInv > 0 && <Alert tone="warning" className="mt-4" title={`${pendingInv} proposition(s) d'équipe à confirmer`} action={<Button asChild size="sm"><Link to="/app/candidatures">Répondre</Link></Button>} />}
          {user.role === "ENTREPRISE" && <div className="mt-4"><Button asChild><Link to="/app/defis/nouveau">Déposer un défi</Link></Button></div>}
          <div className="mt-5 flex flex-wrap gap-3"><Button asChild variant="secondary"><Link to="/projets"><Search className="h-4 w-4" aria-hidden />{t("dashboard.browse")}</Link></Button></div>
        </CardBody></Card>
        <Card><CardBody>
          <h2 className="text-lg">{t("dashboard.soonTitle")}</h2><p className="mt-1 text-sm text-muted">{t("dashboard.soonBody")}</p>
          <ul className="mt-4 space-y-2.5">{phases[user.role]?.items.map((i) => (
            <li key={i.name} className="flex items-center justify-between gap-3 rounded-md bg-cloud px-3.5 py-2.5 text-sm"><span className="flex items-center gap-2 font-medium text-night">{i.name.startsWith("NexSpace") ? <FolderKanban className="h-4 w-4 text-muted" aria-hidden /> : i.name.startsWith("Badges") ? <BadgeCheck className="h-4 w-4 text-muted" aria-hidden /> : <FileText className="h-4 w-4 text-muted" aria-hidden />}{i.name}</span><Badge tone="amber">{i.phase}</Badge></li>
          ))}</ul>
        </CardBody></Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (<Card><CardBody><div className="flex flex-col items-start gap-2 text-muted sm:flex-row sm:items-center sm:gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-nexus" aria-hidden>{icon}</span><span className="min-h-[2.5em] text-[13px] font-semibold leading-tight sm:min-h-0 sm:text-sm">{label}</span></div><p className="mt-2 text-2xl font-extrabold text-night sm:mt-3 sm:text-3xl">{value}</p>{hint && <p className="mt-1 text-xs text-muted">{hint}</p>}</CardBody></Card>);
}
function Step({ done, label, to }: { done: boolean; label: string; to?: string }) {
  const body = <><span className={done ? "text-emerald-700" : "text-slate-400"}>{done ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <CircleDashed className="h-5 w-5" aria-hidden />}</span><span className={done ? "text-night" : "text-muted"}>{label}</span><span className="sr-only">{done ? " : fait" : " : à faire"}</span></>;
  return <li className="flex items-center gap-3">{!done && to ? <Link to={to} className="flex items-center gap-3 hover:underline">{body}</Link> : body}</li>;
}

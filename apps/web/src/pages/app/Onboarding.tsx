import { PartyPopper } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, Progress } from "@/components/ui/misc";
import { CompanySection, MentorSection, ReferentSection, StudentAbout, StudentAcademic, StudentAvailability, StudentSkills } from "@/components/profile/Sections";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

export default function Onboarding() {
  const { t } = useTranslation("app");
  usePageTitle(t("onboarding.title"));
  const user = useAuth((s) => s.user)!;
  const reload = useAuth((s) => s.reload);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const next = () => setStep((s) => s + 1);
  const steps: { title: string; node: (p: { onSaved: () => void; submitLabel: string }) => ReactNode }[] =
    user.role === "ETUDIANT" ? [
      { title: "Votre parcours", node: (p) => <StudentAcademic embedded {...p} /> },
      { title: "Disponibilités et localisation", node: (p) => <StudentAvailability embedded {...p} /> },
      { title: "Vos compétences", node: (p) => <StudentSkills embedded {...p} /> },
      { title: "Présentation et confidentialité", node: (p) => <StudentAbout embedded {...p} /> },
    ] : user.role === "MENTOR" ? [
      { title: "Profil professionnel", node: (p) => <MentorSection embedded part="pro" {...p} /> },
      { title: "Secteurs d'expertise", node: (p) => <MentorSection embedded part="expertise" {...p} /> },
      { title: "Disponibilité", node: (p) => <MentorSection embedded part="availability" {...p} /> },
    ] : user.role === "REFERENT_ACADEMIQUE" ? [
      { title: "Votre fonction", node: (p) => <ReferentSection embedded {...p} /> },
    ] : user.role === "ENTREPRISE" ? [
      { title: "Votre organisation", node: (p) => <CompanySection embedded {...p} /> },
    ] : [];

  if (steps.length === 0) return <Navigate to="/app/dashboard" replace />;
  const done = step >= steps.length;
  const finish = async () => {
    setFinishing(true); setError(null);
    try { await api("/me/onboarding/complete", { method: "POST" }); await reload(); navigate(user.role === "ENTREPRISE" ? "/app/organisation" : "/app/dashboard", { replace: true }); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Impossible de terminer."); setFinishing(false); }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl sm:text-3xl">{t("onboarding.title")}</h1>
      <p className="mt-1 text-muted">{t("onboarding.subtitle")}</p>
      <div className="mt-6 flex items-center gap-3" aria-live="polite">
        <Progress value={(Math.min(step, steps.length) / steps.length) * 100} label="Progression de l'onboarding" />
        <span className="shrink-0 text-sm font-semibold text-muted">{done ? (error ? "Profil à compléter" : t("onboarding.done")) : t("onboarding.step", { current: step + 1, total: steps.length })}</span>
      </div>
      <Card className="mt-6"><CardBody>
        {!done ? (
          <>
            <h2 className="mb-5 text-xl">{steps[step]!.title}</h2>
            {steps[step]!.node({ onSaved: next, submitLabel: step === steps.length - 1 ? t("onboarding.finish") : "Enregistrer et continuer" })}
            <div className="mt-5 flex justify-between border-t border-line pt-4 text-sm">
              <button className="font-semibold text-muted hover:text-night disabled:opacity-40" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>← Précédent</button>
              <button className="font-semibold text-nexus hover:underline" onClick={next}>Passer cette étape →</button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <span className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${error ? "bg-amber-50 text-amber-text" : "bg-emerald-50 text-emerald-700"}`}><PartyPopper className="h-8 w-8" aria-hidden /></span>
            <h2 className="text-2xl">{error ? "Il reste des informations à compléter" : t("onboarding.done")}</h2>
            {error && <Alert tone="error" className="mt-4 text-left">{error} Utilisez « Revoir les étapes » pour les renseigner.</Alert>}
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Button size="lg" variant={error ? "secondary" : "primary"} loading={finishing} onClick={finish}>{t("onboarding.finish")}</Button><Button size="lg" variant={error ? "primary" : "secondary"} onClick={() => { setError(null); setStep(0); }}>Revoir les étapes</Button></div>
          </div>
        )}
      </CardBody></Card>
    </div>
  );
}

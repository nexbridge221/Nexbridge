import { Hourglass } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";

const modules: Record<string, { title: string; phase: string; text: string }> = {
  candidatures: { title: "Candidatures", phase: "Phase 2", text: "Postuler à un défi, suivre vos candidatures et confirmer les propositions d'équipe NexMatch." },
  projets: { title: "Projets", phase: "Phase 3", text: "Accéder à l'espace NexSpace de vos projets : tâches, jalons, documents, messagerie et livrables." },
  badges: { title: "Badges & compétences", phase: "Phase 4", text: "Vos compétences validées, badges et attestations (NexBadge)." },
  defis: { title: "Mes défis", phase: "Phase 2", text: "Créer, suivre et publier vos défis avec l'assistant NexBrief." },
  supervision: { title: "Projets supervisés", phase: "Phase 3", text: "Suivre vos projets, commenter les livrables et valider les étapes." },
  cohortes: { title: "Cohortes", phase: "Phase 2 et 4", text: "Gérer les cohortes d'étudiants, valider les projets et attribuer les crédits." },
  utilisateurs: { title: "Utilisateurs", phase: "Phase 4", text: "Gestion des comptes, rôles et signalements." },
  kyc: { title: "Validation des organisations", phase: "Phase 2", text: "Vérifier les pièces KYC des entreprises." },
  "validation-defis": { title: "Défis à valider", phase: "Phase 2", text: "Relire et publier les défis soumis par les entreprises." },
};

export default function ComingSoon() {
  const { t } = useTranslation("app");
  const { key = "" } = useParams();
  const m = modules[key] ?? { title: "Module", phase: "À venir", text: "Ce module sera activé dans une prochaine phase." };
  usePageTitle(m.title);
  return (
    <div>
      <h1 className="text-2xl sm:text-3xl">{m.title}</h1>
      <div className="mt-6"><EmptyState icon={<Hourglass className="h-6 w-6" />} title={t("soon.title")} action={<Button asChild variant="secondary"><Link to="/app/dashboard">{t("soon.back")}</Link></Button>}><span className="block">{m.text}</span><span className="mt-3 inline-flex items-center gap-2">{t("soon.phase")} : <Badge tone="amber">{m.phase}</Badge></span><span className="mt-3 block">{t("soon.body")}</span></EmptyState></div>
    </div>
  );
}

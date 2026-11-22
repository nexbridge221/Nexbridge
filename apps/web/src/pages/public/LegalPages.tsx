import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/usePageTitle";

type Block = { h: string; p: string[] };
const pages: Record<string, { title: string; blocks: Block[] }> = {
  mentions: {
    title: "Mentions légales",
    blocks: [
      { h: "Éditeur du site", p: ["Raison sociale, forme juridique, capital, siège social, numéro NINEA et RCCM : [à compléter par l'éditeur]."] },
      { h: "Directeur de la publication", p: ["[à compléter]"] },
      { h: "Hébergement", p: ["Nom et adresse de l'hébergeur : [à compléter une fois le choix d'hébergement arrêté]."] },
      { h: "Propriété intellectuelle", p: ["Les marques, logos, textes et éléments graphiques de NEXBRIDGE sont protégés. Toute reproduction non autorisée est interdite."] },
      { h: "Contact", p: ["Pour toute question, utilisez le formulaire de contact du site."] },
    ],
  },
  cgu: {
    title: "Conditions générales d'utilisation",
    blocks: [
      { h: "1. Objet", p: ["Les présentes conditions encadrent l'utilisation de la plateforme NEXBRIDGE par les entreprises, étudiants, experts/mentors et référents académiques."] },
      { h: "2. Comptes et rôles", p: ["Chaque utilisateur choisit un rôle à l'inscription et s'engage à fournir des informations exactes. Les organisations sont soumises à une vérification (KYC) avant de publier des défis."] },
      { h: "3. Défis, candidatures et projets", p: ["Les défis sont relus avant publication. La constitution d'une équipe suit un processus de validation (entreprise, étudiants, établissement le cas échéant)."] },
      { h: "4. Propriété intellectuelle et confidentialité des livrables", p: ["[Clauses à rédiger avec le conseil juridique : titularité des livrables, cession éventuelle de droits, confidentialité des informations échangées.]"] },
      { h: "5. Paiements et commissions", p: ["[Conditions à définir selon le prestataire de paiement retenu et la validation réglementaire : séquestre, commission, remboursement.]"] },
      { h: "6. Responsabilités", p: ["[À compléter.]"] },
      { h: "7. Droit applicable", p: ["[À compléter : droit applicable et juridiction compétente.]"] },
    ],
  },
  confidentialite: {
    title: "Politique de confidentialité",
    blocks: [
      { h: "Données collectées", p: ["Identité et coordonnées, informations de profil (parcours, compétences, disponibilités), données d'organisation (dont pièces justificatives de vérification), données d'usage et journaux de sécurité."] },
      { h: "Finalités et bases légales", p: ["Fonctionnement de la plateforme (exécution du service), sécurité, mise en relation, amélioration du service, communication (avec votre consentement)."] },
      { h: "Vos droits", p: ["Accès, rectification, export et suppression de vos données depuis Paramètres → Confidentialité. Retrait du consentement à tout moment. Réclamation possible auprès de la Commission de Protection des Données Personnelles (Sénégal)."] },
      { h: "Sécurité", p: ["Communications chiffrées, mots de passe hachés, données sensibles chiffrées, accès par rôle, journalisation des actions sensibles."] },
      { h: "Conservation et transferts", p: ["[Durées de conservation et lieux d'hébergement à préciser selon les choix d'infrastructure.]"] },
      { h: "Responsable de traitement et contact", p: ["[À compléter par l'éditeur.]"] },
    ],
  },
  cookies: {
    title: "Cookies",
    blocks: [
      { h: "Cookies utilisés", p: ["NEXBRIDGE n'utilise actuellement qu'un cookie strictement nécessaire : le cookie de session sécurisé (HttpOnly) qui permet de rester connecté. Aucun cookie publicitaire ni traceur tiers n'est déposé."] },
      { h: "Évolution", p: ["Si des outils de mesure d'audience sont ajoutés, un bandeau de consentement sera mis en place et cette page mise à jour."] },
    ],
  },
};

export function LegalPage({ k }: { k: keyof typeof pages }) {
  const { t } = useTranslation("landing");
  const page = pages[k]!;
  usePageTitle(page.title);
  return (
    <section className="nb-container max-w-3xl py-14 sm:py-20">
      <h1 className="text-3xl sm:text-4xl">{page.title}</h1>
      <div role="note" className="mt-6 flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><p>{t("legal.draftBanner")}</p></div>
      <p className="mt-4 text-sm text-muted">{t("legal.updated")}</p>
      <div className="mt-8 space-y-8">{page.blocks.map((b) => <div key={b.h}><h2 className="text-xl">{b.h}</h2>{b.p.map((x) => <p key={x} className="mt-2 text-[15.5px] leading-7 text-ink">{x}</p>)}</div>)}</div>
    </section>
  );
}

/** Données de référence (réelles) : secteurs, compétences, FAQ. Chargées dans tous les environnements. */

export const SECTORS = [
  "Finance & FinTech",
  "Agriculture & Agro-industrie",
  "Santé & Biotechnologies",
  "Technologies & Numérique",
  "Éducation & Formation",
  "Énergie & Environnement",
  "Commerce & Distribution",
  "Transport & Logistique",
  "Tourisme & Culture",
  "Industrie & Mines",
  "Télécommunications",
  "Secteur public & ONG",
];

export type SeedSkill = { name: string; category: "TECHNIQUE" | "METIER" | "TRANSVERSALE" | "SECTORIELLE" };

export const SKILLS: SeedSkill[] = [
  // Techniques
  ...["Analyse de données", "Data science", "Machine learning", "Développement web", "Développement mobile", "Bases de données & SQL", "Cybersécurité", "Cloud & DevOps", "UX / UI Design", "Design graphique", "Intelligence artificielle", "Business intelligence", "Électronique & IoT", "Modélisation 3D / CAO", "Rédaction technique"].map((name) => ({ name, category: "TECHNIQUE" as const })),
  // Métiers
  ...["Marketing digital", "Stratégie d'entreprise", "Finance & comptabilité", "Gestion de la chaîne logistique", "Ressources humaines", "Vente & développement commercial", "Communication", "Étude de marché", "Gestion des risques", "Droit des affaires", "Qualité & amélioration continue", "Entrepreneuriat"].map((name) => ({ name, category: "METIER" as const })),
  // Transversales
  ...["Gestion de projet", "Communication orale", "Travail en équipe", "Résolution de problèmes", "Esprit critique", "Créativité & innovation", "Leadership", "Gestion du temps", "Négociation", "Adaptabilité", "Présentation & storytelling"].map((name) => ({ name, category: "TRANSVERSALE" as const })),
  // Sectorielles
  ...["FinTech & paiement mobile", "Agro-industrie", "AgriTech", "Santé numérique", "Énergies renouvelables", "EdTech", "Logistique urbaine", "Commerce de proximité", "Développement durable & RSE", "Tourisme durable"].map((name) => ({ name, category: "SECTORIELLE" as const })),
];

export const FAQ: { question: string; answer: string; audience: "GENERAL" | "ENTREPRISE" | "ETUDIANT" | "ETABLISSEMENT"; position: number }[] = [
  { audience: "GENERAL", position: 1, question: "Qu'est-ce que NEXBRIDGE ?", answer: "NEXBRIDGE est une plateforme d'innovation ouverte fondée sur l'apprentissage par projet. Des entreprises y déposent des défis réels, des équipes interdisciplinaires d'étudiants les relèvent avec l'accompagnement d'un expert ou mentor, et les établissements valident les compétences acquises." },
  { audience: "GENERAL", position: 2, question: "Comment fonctionne la mise en relation ?", answer: "Une fois un défi validé et publié, NexMatch propose à l'entreprise les équipes les plus adaptées selon les compétences, la formation, les disponibilités et l'historique des étudiants. Les étudiants peuvent aussi postuler librement. Chaque équipe est validée par l'entreprise, puis acceptée individuellement par les étudiants." },
  { audience: "GENERAL", position: 3, question: "Mes données personnelles sont-elles protégées ?", answer: "Oui. NEXBRIDGE applique les principes du RGPD et de la loi sénégalaise sur la protection des données personnelles : consentement explicite, accès, export et suppression de vos données depuis votre espace, chiffrement des communications et des données sensibles." },
  { audience: "ENTREPRISE", position: 1, question: "Comment déposer un défi ?", answer: "Créez un compte entreprise, faites valider votre organisation (NINEA et registre de commerce), puis utilisez l'assistant NexBrief en cinq étapes : contexte, périmètre, équipe, calendrier et budget. Votre défi est relu par l'équipe NEXBRIDGE avant publication." },
  { audience: "ENTREPRISE", position: 2, question: "Pourquoi mon organisation doit-elle être validée ?", answer: "La vérification (KYC) protège les étudiants et la plateforme : elle confirme l'existence légale de l'organisation avant la publication de défis. Elle est traitée par un administrateur, généralement sous 48 heures." },
  { audience: "ETUDIANT", position: 1, question: "Qui peut s'inscrire en tant qu'étudiant ?", answer: "Tout étudiant inscrit dans un établissement d'enseignement supérieur. Vous renseignez votre établissement, votre filière, votre niveau, vos compétences et vos disponibilités ; ces informations alimentent le matching et votre portfolio." },
  { audience: "ETUDIANT", position: 2, question: "Les projets sont-ils reconnus par mon établissement ?", answer: "Les établissements partenaires disposent d'un espace référent pour valider les projets et attribuer des crédits (ECTS ou équivalent). Les modalités dépendent de votre établissement." },
  { audience: "ETABLISSEMENT", position: 1, question: "Comment devenir établissement partenaire ?", answer: "Un référent académique crée un compte et rattache son établissement. L'établissement est ensuite validé par l'équipe NEXBRIDGE, ce qui ouvre la gestion des cohortes, la validation des projets et les rapports pédagogiques." },
];

export interface SeedTemplate { name: string; sector: string; content: { context: string; objectives: string; deliverables: { title: string; format: "RAPPORT" | "PROTOTYPE" | "CODE" | "PRESENTATION" | "AUTRE" }[]; milestones: { title: string; targetWeek: number }[]; skills: string[]; sector: string; durationWeeks: number } }

const T = (name: string, sector: string, context: string, objectives: string, deliverables: SeedTemplate["content"]["deliverables"], skills: string[], weeks = 10): SeedTemplate => ({
  name, sector,
  content: { context, objectives, deliverables, skills, sector, durationWeeks: weeks, milestones: [{ title: "Cadrage et état des lieux", targetWeek: Math.max(1, Math.round(weeks * 0.2)) }, { title: "Livrable intermédiaire", targetWeek: Math.round(weeks * 0.6) }, { title: "Restitution finale", targetWeek: weeks }] },
});

/** Modèles de briefs sectoriels (textes d'aide à compléter : ce sont des trames, pas des défis réels). */
export const BRIEF_TEMPLATES: SeedTemplate[] = [
  T("Finance & FinTech — Analyse d'un parcours client", "Finance & FinTech", "[Décrivez votre activité financière, le parcours ou le produit concerné et le problème constaté (abandon, coût, délai, risque)…]\nContexte chiffré si possible : volume d'utilisateurs, période, indicateurs actuels.", "[Ex. identifier les 3 principales causes du problème, proposer des solutions priorisées et mesurables…]", [{ title: "Rapport d'analyse et recommandations", format: "RAPPORT" }, { title: "Maquette du parcours proposé", format: "PROTOTYPE" }, { title: "Présentation de restitution", format: "PRESENTATION" }], ["FinTech & paiement mobile", "UX / UI Design", "Analyse de données"]),
  T("Agriculture & Agro-industrie — Valorisation de données de terrain", "Agriculture & Agro-industrie", "[Décrivez la filière, les acteurs (producteurs, coopératives, transformateurs) et les données disponibles (météo, rendements, prix…)]", "[Ex. produire un outil d'aide à la décision simple et utilisable sur le terrain…]", [{ title: "Analyse des données et méthodologie", format: "RAPPORT" }, { title: "Outil ou tableau de bord", format: "PROTOTYPE" }, { title: "Guide d'utilisation", format: "RAPPORT" }], ["Analyse de données", "AgriTech", "Agro-industrie"]),
  T("Santé — Amélioration d'un service numérique", "Santé & Biotechnologies", "[Décrivez la structure de santé, le service concerné et les contraintes (confidentialité, connexion, personnel)…]", "[Ex. concevoir un prototype répondant à un besoin identifié auprès des utilisateurs…]", [{ title: "Étude des besoins utilisateurs", format: "RAPPORT" }, { title: "Prototype", format: "PROTOTYPE" }], ["Santé numérique", "UX / UI Design", "Étude de marché"]),
  T("Technologies — Développement d'un prototype web ou mobile", "Technologies & Numérique", "[Décrivez le produit, les utilisateurs cibles, l'existant technique et les contraintes (réseau limité, appareils, budget)…]", "[Ex. livrer un prototype fonctionnel couvrant les 3 fonctionnalités prioritaires, documenté et testé…]", [{ title: "Spécifications fonctionnelles", format: "RAPPORT" }, { title: "Prototype fonctionnel", format: "CODE" }, { title: "Documentation technique", format: "RAPPORT" }], ["Développement web", "Développement mobile", "UX / UI Design"], 12),
  T("Éducation — Conception d'un dispositif pédagogique", "Éducation & Formation", "[Décrivez l'établissement ou l'organisme, le public apprenant et la difficulté pédagogique à résoudre…]", "[Ex. concevoir un parcours ou un outil, avec une méthode d'évaluation de son efficacité…]", [{ title: "Cahier pédagogique", format: "RAPPORT" }, { title: "Prototype de contenu", format: "PROTOTYPE" }], ["EdTech", "Communication", "Gestion de projet"], 8),
  T("Énergie & Environnement — Étude et sensibilisation", "Énergie & Environnement", "[Décrivez le site, l'activité ou la communauté concernés, la consommation ou l'impact actuels et les objectifs de réduction…]", "[Ex. quantifier la situation actuelle et proposer un plan d'actions chiffré…]", [{ title: "Diagnostic chiffré", format: "RAPPORT" }, { title: "Plan d'actions et estimation des gains", format: "PRESENTATION" }], ["Énergies renouvelables", "Développement durable & RSE", "Analyse de données"]),
  T("Commerce — Stratégie d'acquisition et de fidélisation", "Commerce & Distribution", "[Décrivez l'activité, la clientèle actuelle, les canaux utilisés et les résultats observés…]", "[Ex. définir une stratégie de contenu et d'acquisition sur 3 mois, avec indicateurs de suivi…]", [{ title: "Étude de marché", format: "RAPPORT" }, { title: "Plan marketing et calendrier de contenu", format: "PRESENTATION" }], ["Marketing digital", "Étude de marché", "Communication"], 6),
  T("Transport & Logistique — Optimisation d'un flux", "Transport & Logistique", "[Décrivez le flux (collecte, transport, livraison), les volumes, les délais et les points de blocage…]", "[Ex. cartographier le flux actuel et proposer des améliorations mesurables…]", [{ title: "Cartographie du flux et diagnostic", format: "RAPPORT" }, { title: "Outil de suivi (maquette ou prototype)", format: "PROTOTYPE" }], ["Gestion de la chaîne logistique", "Logistique urbaine", "Analyse de données"]),
  T("Tourisme & Culture — Valorisation d'une offre", "Tourisme & Culture", "[Décrivez le site, l'offre actuelle, la fréquentation et les publics visés…]", "[Ex. proposer un plan de valorisation et des supports de communication adaptés…]", [{ title: "Diagnostic de l'offre", format: "RAPPORT" }, { title: "Supports de communication", format: "AUTRE" }], ["Tourisme durable", "Communication", "Marketing digital"], 8),
  T("Industrie — Pilotage de la qualité et de la production", "Industrie & Mines", "[Décrivez la ligne de production, les indicateurs suivis aujourd'hui, les outils utilisés et les écarts constatés…]", "[Ex. centraliser les données et visualiser les écarts par lot et par ligne…]", [{ title: "Audit des données existantes", format: "RAPPORT" }, { title: "Tableau de bord", format: "PROTOTYPE" }], ["Business intelligence", "Qualité & amélioration continue", "Bases de données & SQL"], 9),
];

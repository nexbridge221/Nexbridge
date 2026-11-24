/**
 * Défis de démonstration « réalistes » : des sujets inspirés de besoins concrets en Afrique de l'Ouest, portés par des
 * organisations FICTIVES (préfixe « [Démo] », drapeau isDemo). Ils servent à montrer les types de projets possibles ;
 * de vrais défis sont déposés par de vraies entreprises depuis l'assistant NexBrief. Jamais chargés en production.
 */
export interface DemoCompany { owner: string; first: string; last: string; name: string; sector: string; city: string; description: string }

export const DEMO_COMPANIES: DemoCompany[] = [
  { owner: "entreprise3@demo.nexbridge.test", first: "Démo", last: "Entreprise3", name: "[Démo] Solaire Teranga SAS", sector: "Énergie & Environnement", city: "Dakar", description: "Installateur et exploitant de systèmes solaires pour villages et PME (organisation de démonstration)." },
  { owner: "entreprise4@demo.nexbridge.test", first: "Démo", last: "Entreprise4", name: "[Démo] Clinique Médina Santé", sector: "Santé & Biotechnologies", city: "Dakar", description: "Clinique privée de proximité (organisation de démonstration)." },
  { owner: "entreprise5@demo.nexbridge.test", first: "Démo", last: "Entreprise5", name: "[Démo] Savoir Plus Éducation", sector: "Éducation & Formation", city: "Thiès", description: "Réseau de cours de soutien et de formation d'enseignants (organisation de démonstration)." },
  { owner: "entreprise6@demo.nexbridge.test", first: "Démo", last: "Entreprise6", name: "[Démo] Baobab Distribution", sector: "Commerce & Distribution", city: "Dakar", description: "Grossiste approvisionnant des boutiques de quartier (organisation de démonstration)." },
  { owner: "entreprise7@demo.nexbridge.test", first: "Démo", last: "Entreprise7", name: "[Démo] Teranga Évasion", sector: "Tourisme & Culture", city: "Saint-Louis", description: "Agence de tourisme culturel et de découverte (organisation de démonstration)." },
  { owner: "entreprise8@demo.nexbridge.test", first: "Démo", last: "Entreprise8", name: "[Démo] Association Eau pour Tous", sector: "Secteur public & ONG", city: "Kaolack", description: "ONG d'accès à l'eau potable en milieu rural (organisation de démonstration)." },
];

export interface DemoChallenge {
  /** Nom de l'organisation (DEMO_COMPANIES ou organisations déjà présentes dans le seed). */
  company: string;
  title: string;
  sector: string;
  weeks: number;
  team: number;
  level: "L3" | "M1" | "M2";
  budget: number;
  skills: string[];
  keywords: string[];
  context: string;
  objectives: string;
  deliverables: { title: string; format: "RAPPORT" | "PROTOTYPE" | "CODE" | "PRESENTATION" | "AUTRE"; description: string }[];
  milestones: { title: string; description: string; targetWeek: number }[];
}

export const DEMO_CHALLENGES: DemoChallenge[] = [
  {
    company: "[Démo] Solaire Teranga SAS", title: "Dimensionner une mini-centrale solaire pour un village de 400 foyers", sector: "Énergie & Environnement", weeks: 10, team: 4, level: "M1", budget: 1_600_000,
    skills: ["Énergies renouvelables", "Analyse de données", "Finance & comptabilité", "Rédaction technique"], keywords: ["solaire", "électrification rurale", "mini-réseau"],
    context: "Un village de 400 foyers n'est pas raccordé au réseau. Nous envisageons une mini-centrale solaire avec stockage, financée en partie par des paiements mensuels des ménages. Nous avons des relevés de consommation approximatifs et un ensoleillement moyen, mais pas d'étude de dimensionnement ni de modèle économique solide.",
    objectives: "Estimer la demande d'énergie par type d'usage (ménages, commerces, pompe à eau).\nDimensionner panneaux, batteries et onduleurs pour trois scénarios de service.\nÉvaluer le coût par foyer et le seuil de rentabilité, avec une grille tarifaire réaliste.\nIdentifier les risques techniques et sociaux et proposer des mesures.",
    deliverables: [
      { title: "Étude de dimensionnement technique", format: "RAPPORT", description: "Hypothèses, calculs et trois scénarios comparés." },
      { title: "Modèle financier sur 10 ans", format: "AUTRE", description: "Tableur documenté : investissement, exploitation, recettes, sensibilité." },
      { title: "Présentation de restitution", format: "PRESENTATION", description: "Synthèse et recommandation pour la direction." },
    ],
    milestones: [
      { title: "Cadrage et collecte des données", description: "Données de consommation, ensoleillement, contraintes du site.", targetWeek: 2 },
      { title: "Estimation de la demande", description: "Profils de charge par usage.", targetWeek: 4 },
      { title: "Scénarios techniques et financiers", description: "Trois scénarios chiffrés.", targetWeek: 8 },
      { title: "Restitution finale", description: "Rapport, modèle et présentation.", targetWeek: 10 },
    ],
  },
  {
    company: "[Démo] Solaire Teranga SAS", title: "Tableau de bord de suivi à distance de la production d'installations solaires", sector: "Technologies & Numérique", weeks: 12, team: 4, level: "M1", budget: 2_200_000,
    skills: ["Développement web", "Bases de données & SQL", "Électronique & IoT", "UX / UI Design"], keywords: ["monitoring", "IoT", "maintenance"],
    context: "Nos installations remontent leur production par des boîtiers simples, mais les données arrivent dans des fichiers dispersés. Les techniciens découvrent les pannes quand le client appelle. Nous voulons voir en un coup d'œil l'état de chaque site, être alertés des anomalies et planifier les tournées de maintenance.",
    objectives: "Centraliser les données de production dans une base unique.\nAfficher une carte et un tableau de bord par site (production, état, alertes).\nDétecter automatiquement les anomalies simples (production nulle, baisse anormale).\nFonctionner avec une connexion mobile instable.",
    deliverables: [
      { title: "Application web de supervision (prototype)", format: "PROTOTYPE", description: "Carte des sites, tableau de bord, liste d'alertes." },
      { title: "Code source et documentation d'installation", format: "CODE", description: "Dépôt documenté et script de déploiement." },
      { title: "Guide utilisateur pour les techniciens", format: "RAPPORT", description: "Pas à pas illustré." },
    ],
    milestones: [
      { title: "Cahier des besoins et maquettes", description: "Entretiens avec les techniciens, maquettes validées.", targetWeek: 3 },
      { title: "Chaîne de collecte des données", description: "Import des mesures et modèle de données.", targetWeek: 6 },
      { title: "Tableau de bord et alertes", description: "Version utilisable par un technicien.", targetWeek: 10 },
      { title: "Tests terrain et livraison", description: "Retours utilisateurs intégrés.", targetWeek: 12 },
    ],
  },
  {
    company: "[Démo] Clinique Médina Santé", title: "Réduire les rendez-vous manqués grâce à des rappels par SMS", sector: "Santé & Biotechnologies", weeks: 8, team: 3, level: "L3", budget: 900_000,
    skills: ["Santé numérique", "Analyse de données", "UX / UI Design", "Communication"], keywords: ["rendez-vous", "SMS", "patients"],
    context: "Environ un rendez-vous sur quatre n'est pas honoré dans notre clinique, ce qui désorganise les consultations et retarde les soins. Les rendez-vous sont notés dans un tableur. Nous souhaitons comprendre les causes des absences et tester un système de rappel adapté à nos patients, dont beaucoup n'ont qu'un téléphone basique.",
    objectives: "Analyser un an d'historique de rendez-vous pour identifier les profils et créneaux à risque.\nConcevoir des messages de rappel courts, en français et en wolof, et un calendrier d'envoi.\nMettre en place un prototype d'envoi de rappels et mesurer son effet sur un échantillon.\nRespecter la confidentialité des données de santé.",
    deliverables: [
      { title: "Analyse des absences", format: "RAPPORT", description: "Chiffres clés, profils à risque, recommandations." },
      { title: "Prototype d'envoi de rappels", format: "PROTOTYPE", description: "Outil simple d'envoi à partir du tableur." },
      { title: "Bilan du test et plan de déploiement", format: "PRESENTATION", description: "Résultats mesurés et prochaines étapes." },
    ],
    milestones: [
      { title: "Cadrage et accès aux données anonymisées", description: "Règles de confidentialité validées.", targetWeek: 2 },
      { title: "Analyse des absences", description: "Principaux facteurs identifiés.", targetWeek: 4 },
      { title: "Test des rappels", description: "Test sur un échantillon de patients.", targetWeek: 7 },
      { title: "Restitution", description: "Résultats et recommandations.", targetWeek: 8 },
    ],
  },
  {
    company: "[Démo] Clinique Médina Santé", title: "Cartographier le parcours patient aux urgences et réduire l'attente", sector: "Santé & Biotechnologies", weeks: 9, team: 4, level: "M1", budget: 1_300_000,
    skills: ["Qualité & amélioration continue", "Business intelligence", "Analyse de données", "Résolution de problèmes"], keywords: ["urgences", "parcours patient", "temps d'attente"],
    context: "Aux heures de pointe, l'attente aux urgences dépasse deux heures et génère des plaintes. Nous ne savons pas précisément où le temps est perdu : accueil, tri, examens, résultats ou sortie. Nous voulons une vision chiffrée du parcours et des actions simples à tester.",
    objectives: "Cartographier le parcours du patient de l'arrivée à la sortie.\nMesurer les durées à chaque étape sur deux semaines d'observation.\nIdentifier les goulots d'étranglement et leurs causes.\nProposer et prioriser cinq améliorations réalistes à faible coût.",
    deliverables: [
      { title: "Cartographie du parcours et mesures", format: "RAPPORT", description: "Schéma du parcours, durées par étape, graphiques." },
      { title: "Plan d'actions priorisé", format: "PRESENTATION", description: "Cinq actions, gains attendus, effort estimé." },
      { title: "Tableau de suivi des délais", format: "AUTRE", description: "Tableur réutilisable par l'équipe." },
    ],
    milestones: [
      { title: "Cadrage et protocole d'observation", description: "Étapes définies, grille de relevé.", targetWeek: 2 },
      { title: "Collecte des mesures", description: "Deux semaines de relevés.", targetWeek: 5 },
      { title: "Analyse et causes racines", description: "Goulots identifiés.", targetWeek: 7 },
      { title: "Restitution", description: "Plan d'actions présenté à la direction.", targetWeek: 9 },
    ],
  },
  {
    company: "[Démo] Savoir Plus Éducation", title: "Plateforme de soutien scolaire utilisable hors ligne pour le collège", sector: "Éducation & Formation", weeks: 12, team: 5, level: "M1", budget: 2_400_000,
    skills: ["EdTech", "Développement mobile", "UX / UI Design", "Gestion de projet"], keywords: ["hors ligne", "mathématiques", "collège"],
    context: "Nos élèves de collège ont souvent un smartphone d'entrée de gamme et une connexion qui coupe. Nous voulons une application de révisions (mathématiques et sciences) qui télécharge des exercices lorsque le réseau est disponible, puis fonctionne sans connexion et synchronise les résultats ensuite.",
    objectives: "Concevoir l'expérience élève : exercices courts, progression, retours immédiats.\nDévelopper un prototype fonctionnant hors ligne avec synchronisation.\nPréparer 60 exercices avec corrigés à partir des programmes.\nTester avec une classe et ajuster.",
    deliverables: [
      { title: "Prototype d'application mobile", format: "PROTOTYPE", description: "Version utilisable hors ligne, avec synchronisation." },
      { title: "Banque de 60 exercices", format: "AUTRE", description: "Énoncés, corrigés, niveaux de difficulté." },
      { title: "Rapport de test en classe", format: "RAPPORT", description: "Usages observés et améliorations." },
    ],
    milestones: [
      { title: "Entretiens et maquettes", description: "Besoins élèves et enseignants, maquettes validées.", targetWeek: 3 },
      { title: "Socle hors ligne", description: "Téléchargement, stockage et synchronisation.", targetWeek: 7 },
      { title: "Exercices et parcours", description: "Contenu intégré, progression.", targetWeek: 10 },
      { title: "Test en classe et livraison", description: "Retours intégrés.", targetWeek: 12 },
    ],
  },
  {
    company: "[Démo] Savoir Plus Éducation", title: "Mesurer l'impact des formations d'enseignants sur les résultats des élèves", sector: "Éducation & Formation", weeks: 6, team: 3, level: "L3", budget: 700_000,
    skills: ["Étude de marché", "Analyse de données", "Communication", "Esprit critique"], keywords: ["évaluation", "formation continue", "enquête"],
    context: "Nous formons chaque année des centaines d'enseignants, mais nous n'avons aucune mesure de l'effet sur leurs pratiques et sur les résultats des élèves. Nous souhaitons un protocole d'évaluation simple et crédible, testé sur une promotion récente.",
    objectives: "Définir des indicateurs d'impact réalistes (pratiques en classe, résultats, satisfaction).\nConcevoir les questionnaires et le plan d'enquête.\nCollecter et analyser les réponses d'une promotion.\nRecommander ce qu'il faut suivre chaque année.",
    deliverables: [
      { title: "Protocole d'évaluation", format: "RAPPORT", description: "Indicateurs, outils de collecte, plan d'échantillonnage." },
      { title: "Analyse des résultats de la promotion test", format: "RAPPORT", description: "Résultats, limites, recommandations." },
      { title: "Présentation à l'équipe pédagogique", format: "PRESENTATION", description: "Synthèse illustrée." },
    ],
    milestones: [
      { title: "Cadrage et indicateurs", description: "Indicateurs validés.", targetWeek: 2 },
      { title: "Questionnaires prêts", description: "Outils testés.", targetWeek: 3 },
      { title: "Collecte et analyse", description: "Réponses analysées.", targetWeek: 5 },
      { title: "Restitution", description: "Rapport et présentation.", targetWeek: 6 },
    ],
  },
  {
    company: "[Démo] Baobab Distribution", title: "Digitaliser le réassort des boutiques de quartier", sector: "Commerce & Distribution", weeks: 10, team: 4, level: "M1", budget: 1_800_000,
    skills: ["Commerce de proximité", "Développement mobile", "Logistique urbaine", "UX / UI Design"], keywords: ["boutiques", "commandes", "WhatsApp"],
    context: "Nous livrons environ 600 boutiques de quartier. Les commandes arrivent par appel et messages vocaux, ce qui provoque des erreurs et des ruptures. Les gérants utilisent surtout WhatsApp. Nous cherchons un moyen simple de passer commande, de suivre les livraisons et de proposer un réassort basé sur les ventes habituelles.",
    objectives: "Comprendre les habitudes de commande de dix gérants de boutique.\nConcevoir un parcours de commande très simple (catalogue, panier, confirmation).\nRéaliser un prototype testable par les gérants.\nÉvaluer le gain de temps et la baisse des erreurs.",
    deliverables: [
      { title: "Étude des usages des gérants", format: "RAPPORT", description: "Entretiens, besoins, contraintes." },
      { title: "Prototype de commande", format: "PROTOTYPE", description: "Parcours cliquable ou version fonctionnelle simple." },
      { title: "Plan de déploiement progressif", format: "PRESENTATION", description: "Étapes, coûts et risques." },
    ],
    milestones: [
      { title: "Entretiens terrain", description: "Dix gérants rencontrés.", targetWeek: 3 },
      { title: "Maquettes validées", description: "Parcours validé avec les gérants.", targetWeek: 5 },
      { title: "Prototype testable", description: "Test avec cinq boutiques.", targetWeek: 8 },
      { title: "Restitution", description: "Résultats du test et plan.", targetWeek: 10 },
    ],
  },
  {
    company: "[Démo] Baobab Distribution", title: "Prévoir la demande et optimiser les stocks d'un entrepôt", sector: "Commerce & Distribution", weeks: 10, team: 4, level: "M2", budget: 2_000_000,
    skills: ["Data science", "Gestion de la chaîne logistique", "Analyse de données", "Bases de données & SQL"], keywords: ["prévision", "stocks", "ruptures"],
    context: "Notre entrepôt connaît à la fois des ruptures sur les produits les plus vendus et des surstocks sur d'autres, notamment avant les fêtes et le Ramadan. Nous disposons de deux ans d'historique de ventes par produit. Nous voulons une méthode de prévision simple et des seuils de réapprovisionnement par famille de produits.",
    objectives: "Nettoyer et analyser l'historique de ventes.\nConstruire et comparer des modèles de prévision simples et explicables.\nDéfinir des seuils de réapprovisionnement et un stock de sécurité par famille.\nQuantifier le gain attendu (ruptures évitées, capital immobilisé).",
    deliverables: [
      { title: "Analyse exploratoire des ventes", format: "RAPPORT", description: "Saisonnalité, tendances, anomalies." },
      { title: "Modèle de prévision documenté", format: "CODE", description: "Notebook ou script reproductible." },
      { title: "Règles de réapprovisionnement", format: "PRESENTATION", description: "Seuils par famille, gains estimés." },
    ],
    milestones: [
      { title: "Données nettoyées", description: "Jeu de données exploitable.", targetWeek: 3 },
      { title: "Premiers modèles comparés", description: "Erreurs de prévision mesurées.", targetWeek: 6 },
      { title: "Règles de stock", description: "Seuils proposés.", targetWeek: 8 },
      { title: "Restitution", description: "Rapport, code et présentation.", targetWeek: 10 },
    ],
  },
  {
    company: "[Démo] Teranga Évasion", title: "Audioguide multilingue pour la découverte d'un site patrimonial", sector: "Tourisme & Culture", weeks: 10, team: 4, level: "L3", budget: 1_400_000,
    skills: ["Tourisme durable", "UX / UI Design", "Développement mobile", "Communication"], keywords: ["patrimoine", "visite", "multilingue"],
    context: "Nous accueillons des groupes sur un site patrimonial sans signalétique ni audioguide. Les guides sont peu nombreux et les visiteurs étrangers repartent avec peu d'informations. Nous voulons un parcours de visite sur smartphone, en français, anglais et wolof, qui fonctionne sans connexion une fois téléchargé.",
    objectives: "Définir le parcours de visite et rédiger les contenus avec les guides locaux.\nProduire les textes et enregistrements en trois langues.\nRéaliser un prototype d'application ou de page web utilisable hors ligne.\nTester avec des visiteurs et des guides.",
    deliverables: [
      { title: "Parcours et contenus rédigés", format: "RAPPORT", description: "Étapes du parcours, textes, sources vérifiées." },
      { title: "Prototype de visite guidée", format: "PROTOTYPE", description: "Version utilisable hors ligne, trois langues." },
      { title: "Bilan des tests et recommandations", format: "PRESENTATION", description: "Retours visiteurs et guides." },
    ],
    milestones: [
      { title: "Repérage et entretiens avec les guides", description: "Parcours esquissé.", targetWeek: 3 },
      { title: "Contenus en trois langues", description: "Textes et audios validés.", targetWeek: 6 },
      { title: "Prototype testable", description: "Première version.", targetWeek: 9 },
      { title: "Restitution", description: "Résultats du test.", targetWeek: 10 },
    ],
  },
  {
    company: "[Démo] Association Eau pour Tous", title: "Cartographier et suivre l'entretien des points d'eau villageois", sector: "Secteur public & ONG", weeks: 10, team: 4, level: "M1", budget: 1_100_000,
    skills: ["Analyse de données", "Développement durable & RSE", "Développement mobile", "Gestion de projet"], keywords: ["eau", "cartographie", "maintenance"],
    context: "Nous avons installé plus de 300 forages et puits dans la région, mais nous ne savons pas lesquels fonctionnent encore. Les pannes sont signalées par téléphone et traitées au cas par cas. Nous voulons un inventaire géolocalisé, un moyen simple de signaler une panne et un suivi des interventions.",
    objectives: "Constituer un inventaire géolocalisé à partir des listes existantes et d'une collecte terrain.\nConcevoir un moyen de signalement simple (SMS, formulaire mobile ou appel).\nSuivre les interventions et calculer le taux de fonctionnement par village.\nProposer des indicateurs pour les bailleurs.",
    deliverables: [
      { title: "Inventaire géolocalisé des points d'eau", format: "AUTRE", description: "Base de données et carte." },
      { title: "Prototype de signalement et de suivi", format: "PROTOTYPE", description: "Outil pour signaler une panne et suivre l'intervention." },
      { title: "Tableau d'indicateurs", format: "RAPPORT", description: "Taux de fonctionnement, délais d'intervention." },
    ],
    milestones: [
      { title: "Consolidation des données existantes", description: "Listes nettoyées.", targetWeek: 3 },
      { title: "Collecte terrain sur un échantillon", description: "Quinze villages visités.", targetWeek: 6 },
      { title: "Outil de signalement", description: "Prototype testé.", targetWeek: 9 },
      { title: "Restitution", description: "Indicateurs et recommandations.", targetWeek: 10 },
    ],
  },
  {
    company: "[Démo] AgriTech Sahel SARL", title: "Valoriser les déchets de transformation de la mangue et de l'arachide", sector: "Agriculture & Agro-industrie", weeks: 9, team: 4, level: "M1", budget: 1_300_000,
    skills: ["Agro-industrie", "Développement durable & RSE", "Finance & comptabilité", "Étude de marché"], keywords: ["valorisation", "économie circulaire", "déchets"],
    context: "Notre unité de transformation produit chaque semaine des tonnes de noyaux de mangue, de peaux et de coques d'arachide, aujourd'hui jetés ou brûlés. Nous voulons savoir s'il existe des débouchés viables : alimentation animale, combustible, compost, cosmétique.",
    objectives: "Quantifier les volumes et la qualité des déchets par produit.\nRecenser les filières de valorisation possibles et leurs acheteurs potentiels.\nÉvaluer l'investissement et la rentabilité des deux options les plus prometteuses.\nIdentifier les exigences réglementaires et sanitaires.",
    deliverables: [
      { title: "Étude des filières de valorisation", format: "RAPPORT", description: "Options, marchés, contraintes." },
      { title: "Analyse économique de deux options", format: "AUTRE", description: "Tableur d'investissement et de rentabilité." },
      { title: "Présentation à la direction", format: "PRESENTATION", description: "Recommandation argumentée." },
    ],
    milestones: [
      { title: "Cadrage et mesure des volumes", description: "Volumes et qualités estimés.", targetWeek: 2 },
      { title: "Recensement des filières", description: "Liste argumentée.", targetWeek: 5 },
      { title: "Analyse économique", description: "Deux options chiffrées.", targetWeek: 8 },
      { title: "Restitution", description: "Recommandation finale.", targetWeek: 9 },
    ],
  },
  {
    company: "[Démo] Teranga Finance SA", title: "Détecter les transactions de paiement mobile suspectes : analyse exploratoire", sector: "Finance & FinTech", weeks: 10, team: 3, level: "M2", budget: 2_100_000,
    skills: ["Data science", "Gestion des risques", "FinTech & paiement mobile", "Cybersécurité"], keywords: ["fraude", "paiement mobile", "détection d'anomalies"],
    context: "Nous observons des schémas de fraude sur notre service de paiement mobile : multiplication de petits transferts, comptes ouverts puis vidés en quelques heures. Nous mettons à disposition un jeu de données anonymisé et simulé pour explorer des méthodes de détection avant tout projet industriel.",
    objectives: "Explorer le jeu de données et caractériser les comportements normaux et suspects.\nConstruire et comparer deux approches de détection (règles et apprentissage).\nMesurer les performances avec les bonnes métriques (faux positifs, rappel).\nDécrire les limites et les conditions de passage à un usage réel (confidentialité, supervision humaine).",
    deliverables: [
      { title: "Analyse exploratoire", format: "RAPPORT", description: "Comportements types, signaux faibles." },
      { title: "Prototypes de détection comparés", format: "CODE", description: "Code reproductible et résultats chiffrés." },
      { title: "Note sur les risques et la mise en production", format: "PRESENTATION", description: "Limites, éthique, étapes suivantes." },
    ],
    milestones: [
      { title: "Prise en main des données", description: "Jeu de données compris.", targetWeek: 3 },
      { title: "Règles de détection", description: "Première série de règles évaluée.", targetWeek: 5 },
      { title: "Modèle d'apprentissage", description: "Comparaison des approches.", targetWeek: 8 },
      { title: "Restitution", description: "Résultats et recommandations.", targetWeek: 10 },
    ],
  },
];

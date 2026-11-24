-- Données de DÉMONSTRATION (référentiels, 13 comptes fictifs, défis, un projet). Générées par le seed local ; mots de passe dans .nexbridge-local/demo-accounts-netlify.txt (ignoré par Git).





INSERT INTO public."Company" (id, "legalName", sector, size, country, city, description, website, "logoFileId", ninea, rccm, "kycStatus", "kycRejectionReason", "trustIndex", "isDemo", "createdAt", "updatedAt") VALUES
	('01a20ef6-e5cd-71bc-835c-eb522810311e', '[Démo] AgriTech Sahel SARL', 'Agriculture & Agro-industrie', 'PME', 'Sénégal', 'Dakar', 'Organisation de démonstration.', NULL, NULL, 'v1.Jqs05yp1g49TmN0V.-koMWF43imzWJ3rHSZoPiA.3InH8P5rgkEi9g', 'v1.eWekuWXSIEAJ6R_r.DD9AdvDa_cWRmXQqxwadOg.uMtWzdAY2viZDmZ8DsOdIg-X', 'VALIDE', NULL, NULL, true, '2026-11-24 19:09:51.437', '2026-11-24 19:09:51.437'),
	('01a20ef6-e72c-7772-8b9d-66199eec8994', '[Démo] Teranga Finance SA', 'Finance & FinTech', 'PME', 'Sénégal', 'Dakar', 'Organisation de démonstration.', NULL, NULL, 'v1.pzDgyeF2vgfQx7g1.nKCHpvFmW67hTMfH-JX92w.2v5vzDl87J5Udg', 'v1.SNoiW-qVY6Lv5XU-.74QUyMmsklGLv6VE-qShbw.4OCL9lveozUX6_fcE_nSxje5', 'VALIDE', NULL, NULL, true, '2026-11-24 19:09:51.788', '2026-11-24 19:09:51.788');



INSERT INTO public."Sector" (id, name, slug) VALUES
	('01a20ef6-d37e-71ad-9382-ebf00dad9a02', 'Finance & FinTech', 'finance-fintech'),
	('01a20ef6-d39a-714c-98ad-e3b389d83ca5', 'Agriculture & Agro-industrie', 'agriculture-agro-industrie'),
	('01a20ef6-d39d-7520-b712-69de6f45957e', 'Santé & Biotechnologies', 'sante-biotechnologies'),
	('01a20ef6-d39f-774b-b58e-fa6b11d70c95', 'Technologies & Numérique', 'technologies-numerique'),
	('01a20ef6-d3a3-76cd-a6ca-dbe344a08a97', 'Éducation & Formation', 'education-formation'),
	('01a20ef6-d3a5-702e-8e34-2426d99d3c2c', 'Énergie & Environnement', 'energie-environnement'),
	('01a20ef6-d3a7-712b-9e86-06da4ae5128e', 'Commerce & Distribution', 'commerce-distribution'),
	('01a20ef6-d3a9-7717-845b-42916163503b', 'Transport & Logistique', 'transport-logistique'),
	('01a20ef6-d3ac-7558-9913-ee2eea34f8ad', 'Tourisme & Culture', 'tourisme-culture'),
	('01a20ef6-d3af-702a-a282-d491bf76f9a7', 'Industrie & Mines', 'industrie-mines'),
	('01a20ef6-d3b1-74d9-a75e-b704b9fd6761', 'Télécommunications', 'telecommunications'),
	('01a20ef6-d3b3-7754-866e-055c4ca289c8', 'Secteur public & ONG', 'secteur-public-ong');



INSERT INTO public."Challenge" (id, "companyId", "createdById", title, slug, context, objectives, "sectorId", keywords, "teamSize", "minStudyLevel", "desiredStart", "durationWeeks", "budgetAmount", "budgetCurrency", "budgetPublic", "paymentTerms", status, "rejectionReason", "publishedAt", "closedAt", "closeReason", "isDemo", "createdAt", "updatedAt") VALUES
	('01a20ef6-e73b-7006-9899-a8520525ddd5', '01a20ef6-e5cd-71bc-835c-eb522810311e', '01a20ef6-e5c2-762b-9afc-1241b5527f81', 'Prévoir les rendements agricoles à partir de données météo', 'demo-prevoir-les-rendements-agricoles-a-partir-de-donnees-meteo', 'Nous collectons des données météo et de sol auprès de coopératives. Nous cherchons un modèle simple et explicable pour estimer les rendements de la prochaine saison et alerter les producteurs.', NULL, '01a20ef6-d39a-714c-98ad-e3b389d83ca5', '{}', 4, NULL, NULL, 10, 1500000, 'XOF', false, NULL, 'PUBLIE', NULL, '2026-11-24 19:09:51.797', NULL, NULL, true, '2026-11-24 19:09:51.802', '2026-11-24 19:09:51.802'),
	('01a20ef6-e746-73a5-b1dd-eb6fbbfa6928', '01a20ef6-e5cd-71bc-835c-eb522810311e', '01a20ef6-e5c2-762b-9afc-1241b5527f81', 'Application mobile de suivi de livraison pour coopératives', 'demo-application-mobile-de-suivi-de-livraison-pour-cooperatives', 'Les coopératives suivent leurs livraisons sur papier. Nous voulons un prototype d''application mobile fonctionnant avec une connexion limitée, pour déclarer et suivre les livraisons.', NULL, '01a20ef6-d3a9-7717-845b-42916163503b', '{}', 5, NULL, NULL, 12, 2000000, 'XOF', false, NULL, 'PUBLIE', NULL, '2026-11-24 19:09:51.81', NULL, NULL, true, '2026-11-24 19:09:51.813', '2026-11-24 19:09:51.813'),
	('01a20ef6-e74f-772f-aae4-8b0d1a74a5dc', '01a20ef6-e72c-7772-8b9d-66199eec8994', '01a20ef6-e726-70c5-89ae-096135f5c4cc', 'Parcours d''inscription simplifié pour un service de paiement mobile', 'demo-parcours-d-inscription-simplifie-pour-un-service-de-paiement', 'Notre taux d''abandon à l''inscription est élevé. Nous souhaitons analyser le parcours actuel et proposer un parcours repensé, testé auprès de vrais utilisateurs.', NULL, '01a20ef6-d37e-71ad-9382-ebf00dad9a02', '{}', 3, NULL, NULL, 8, NULL, 'XOF', false, NULL, 'PUBLIE', NULL, '2026-11-24 19:09:51.821', NULL, NULL, true, '2026-11-24 19:09:51.822', '2026-11-24 19:09:51.822'),
	('01a20ef6-e758-735b-acf2-a06f9a63bede', '01a20ef6-e72c-7772-8b9d-66199eec8994', '01a20ef6-e726-70c5-89ae-096135f5c4cc', 'Stratégie de contenu et d''acquisition pour une offre d''épargne digitale', 'demo-strategie-de-contenu-et-d-acquisition-pour-une-offre-d-eparg', 'Nous lançons une offre d''épargne digitale destinée aux jeunes actifs. Nous attendons un plan de contenu sur trois mois et des recommandations de canaux d''acquisition.', NULL, '01a20ef6-d37e-71ad-9382-ebf00dad9a02', '{}', 3, NULL, NULL, 6, 900000, 'XOF', false, NULL, 'PUBLIE', NULL, '2026-11-24 19:09:51.83', NULL, NULL, true, '2026-11-24 19:09:51.832', '2026-11-24 19:09:51.832'),
	('01a20ef6-e762-7079-871d-1a6dd31e9aae', '01a20ef6-e5cd-71bc-835c-eb522810311e', '01a20ef6-e5c2-762b-9afc-1241b5527f81', 'Tableau de bord de suivi qualité pour une unité de transformation', 'demo-tableau-de-bord-de-suivi-qualite-pour-une-unite-de-transform', 'Les mesures de qualité sont saisies dans des fichiers Excel dispersés. Nous voulons centraliser ces données et visualiser les écarts par lot et par ligne de production.', NULL, '01a20ef6-d3af-702a-a282-d491bf76f9a7', '{}', 4, NULL, NULL, 9, 1200000, 'XOF', false, NULL, 'PUBLIE', NULL, '2026-11-24 19:09:51.839', NULL, NULL, true, '2026-11-24 19:09:51.842', '2026-11-24 19:09:51.842');



INSERT INTO public."Institution" (id, name, country, city, website, "logoFileId", status, "validatedById", "isDemo", "createdAt", "updatedAt") VALUES
	('01a20ef6-d76c-736b-aff2-927fda67fc8f', '[Démo] Institut Supérieur des Sciences Appliquées', 'Sénégal', 'Dakar', NULL, NULL, 'VALIDE', NULL, true, '2026-11-24 19:09:47.754', '2026-11-24 19:09:47.754'),
	('01a20ef6-d770-742c-b5e6-ce512f6a577a', '[Démo] École Supérieure de Gestion et d''Innovation', 'Sénégal', 'Thiès', NULL, NULL, 'VALIDE', NULL, true, '2026-11-24 19:09:47.759', '2026-11-24 19:09:47.759');


















INSERT INTO public."User" (id, email, "passwordHash", role, status, "firstName", "lastName", phone, locale, "avatarFileId", "emailVerifiedAt", "twoFactorEnabled", "twoFactorSecret", "failedLogins", "lockedUntil", "lastLoginAt", "isDemo", "createdAt", "updatedAt") VALUES
	('01a20ef6-d601-74da-9adf-c2acbe18b810', 'super.admin@demo.nexbridge.test', '$2b$12$MMmga8FIwCZM/gVvBYYqL.FY2J4U9wDlOwLE07RjrO99xcYKMaNyO', 'SUPER_ADMIN', 'ACTIF', 'Démo', 'SuperAdmin', NULL, 'fr', NULL, '2026-11-24 19:09:47.39', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:47.393', '2026-11-24 19:09:47.393'),
	('01a20ef6-d763-753f-8262-6274f29df189', 'admin@demo.nexbridge.test', '$2b$12$KOvzeu81xPO6vCd7LcWfoOm958aThIRt5MiZLPMsB3U9ZyB/ybORm', 'ADMIN', 'ACTIF', 'Démo', 'Admin', NULL, 'fr', NULL, '2026-11-24 19:09:47.746', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:47.747', '2026-11-24 19:09:47.747'),
	('01a20ef6-d8cd-7099-81eb-c9b07ff98732', 'referent@demo.nexbridge.test', '$2b$12$E1P2nXpWZBp9KEcCfK0D1eF35u4RYi0QOTdTidGgermFzwQcJvXty', 'REFERENT_ACADEMIQUE', 'ACTIF', 'Démo', 'Référent', NULL, 'fr', NULL, '2026-11-24 19:09:48.108', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:48.109', '2026-11-24 19:09:48.109'),
	('01a20ef6-da40-725f-b69a-51b1fe0a1ee4', 'etudiant1@demo.nexbridge.test', '$2b$12$G1fBEFpODt3KCHqEZpvyROygjKCKZ6FngcuuxO50kfijOyLXsKzKG', 'ETUDIANT', 'ACTIF', 'Aminata', 'Diop', NULL, 'fr', NULL, '2026-11-24 19:09:48.478', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:48.48', '2026-11-24 19:09:48.48'),
	('01a20ef6-dbbd-703c-8c08-b2cdd0640d25', 'etudiant2@demo.nexbridge.test', '$2b$12$l6LndqPvwLTI/ibvRNvg5.bcyBtagUsagF4X0QgepmrIXNeuZm/BG', 'ETUDIANT', 'ACTIF', 'Moussa', 'Ndiaye', NULL, 'fr', NULL, '2026-11-24 19:09:48.86', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:48.861', '2026-11-24 19:09:48.861'),
	('01a20ef6-dd2b-7181-9143-1d0b29f8230b', 'etudiant3@demo.nexbridge.test', '$2b$12$FMLeWShTp6y.I3zWVjoAruA5KFuV/fNN7PFya/1lC6Y2bfp24LAXC', 'ETUDIANT', 'ACTIF', 'Fatou', 'Sow', NULL, 'fr', NULL, '2026-11-24 19:09:49.226', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:49.227', '2026-11-24 19:09:49.227'),
	('01a20ef6-dea7-718a-ae1b-5beb6b88b161', 'etudiant4@demo.nexbridge.test', '$2b$12$.Dcln8S8P0PVAVL02O0GBOOD0cQkZIfgnceEmR/8lSHT3Edb1/50m', 'ETUDIANT', 'ACTIF', 'Ibrahima', 'Fall', NULL, 'fr', NULL, '2026-11-24 19:09:49.605', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:49.607', '2026-11-24 19:09:49.607'),
	('01a20ef6-e01b-74bc-94fa-b239e2866f0e', 'etudiant5@demo.nexbridge.test', '$2b$12$Si.JAjAvNUeauA0tCD970eagCb1CxIiZz8eUYVom2dAeMDCCPlo86', 'ETUDIANT', 'ACTIF', 'Awa', 'Ba', NULL, 'fr', NULL, '2026-11-24 19:09:49.978', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:49.979', '2026-11-24 19:09:49.979'),
	('01a20ef6-e187-7489-9c0e-6a80d5baaa28', 'etudiant6@demo.nexbridge.test', '$2b$12$.N0hj5hzsD8yL/uu9akMaOs96OyvHWvZjFwnV5Tr5aNmg9CbGm752', 'ETUDIANT', 'ACTIF', 'Cheikh', 'Sy', NULL, 'fr', NULL, '2026-11-24 19:09:50.342', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:50.343', '2026-11-24 19:09:50.343'),
	('01a20ef6-e2f7-77a8-a358-be02666b526f', 'mentor1@demo.nexbridge.test', '$2b$12$Kx6D0np/Rsm9whN5yG2bQO5waklFMPGFIanp6w19nD.oY91VU/HzO', 'MENTOR', 'ACTIF', 'Mariama', 'Kane', NULL, 'fr', NULL, '2026-11-24 19:09:50.709', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:50.711', '2026-11-24 19:09:50.711'),
	('01a20ef6-e45c-76f6-a888-75c54cc650a9', 'mentor2@demo.nexbridge.test', '$2b$12$PHID88yqXFizzPdPcxwfseFYS8NwcgmB9E8yyg9CpJiJ2j4YQS9Ri', 'MENTOR', 'ACTIF', 'Ousmane', 'Gueye', NULL, 'fr', NULL, '2026-11-24 19:09:51.066', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:51.068', '2026-11-24 19:09:51.068'),
	('01a20ef6-e5c2-762b-9afc-1241b5527f81', 'entreprise1@demo.nexbridge.test', '$2b$12$rJafyRW/ehY.W7E0uhZw0eniGivjH7WezIWqh67wQfnK4LwtpF3CO', 'ENTREPRISE', 'ACTIF', 'Démo', 'Entreprise1', NULL, 'fr', NULL, '2026-11-24 19:09:51.425', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:51.426', '2026-11-24 19:09:51.426'),
	('01a20ef6-e726-70c5-89ae-096135f5c4cc', 'entreprise2@demo.nexbridge.test', '$2b$12$hy8N.NKCHvqt/aarFAMDEOfyWFNo6SpYapNGqbpcLZ5Zdc5GShjVa', 'ENTREPRISE', 'ACTIF', 'Démo', 'Entreprise2', NULL, 'fr', NULL, '2026-11-24 19:09:51.78', false, NULL, 0, NULL, NULL, true, '2026-11-24 19:09:51.782', '2026-11-24 19:09:51.782');



INSERT INTO public."StudentProfile" (id, "userId", "institutionId", "programId", "studyLevel", bio, city, country, availability, "availabilityNotes", "sectorPreferences", "reliabilityIndex", "isPortfolioPublic", slug, "onboardingDone", "createdAt", "updatedAt") VALUES
	('01a20ef6-da46-75b8-9286-7672b3cb89cc', '01a20ef6-da40-725f-b69a-51b1fe0a1ee4', '01a20ef6-d76c-736b-aff2-927fda67fc8f', NULL, 'L3', 'Profil de démonstration.', 'Dakar', 'Sénégal', 'PARTIEL', NULL, '{}', NULL, false, 'demo-aminata-diop', true, '2026-11-24 19:09:48.484', '2026-11-24 19:09:48.484'),
	('01a20ef6-dbc4-712b-aee1-0a4c7398f0e1', '01a20ef6-dbbd-703c-8c08-b2cdd0640d25', '01a20ef6-d76c-736b-aff2-927fda67fc8f', NULL, 'M1', 'Profil de démonstration.', 'Dakar', 'Sénégal', 'PARTIEL', NULL, '{}', NULL, false, 'demo-moussa-ndiaye', true, '2026-11-24 19:09:48.867', '2026-11-24 19:09:48.867'),
	('01a20ef6-dd31-7414-94d3-2c9e003b892a', '01a20ef6-dd2b-7181-9143-1d0b29f8230b', '01a20ef6-d770-742c-b5e6-ce512f6a577a', NULL, 'L3', 'Profil de démonstration.', 'Dakar', 'Sénégal', 'PARTIEL', NULL, '{}', NULL, false, 'demo-fatou-sow', true, '2026-11-24 19:09:49.232', '2026-11-24 19:09:49.232'),
	('01a20ef6-deac-7607-ae8d-9e6a6023f797', '01a20ef6-dea7-718a-ae1b-5beb6b88b161', '01a20ef6-d76c-736b-aff2-927fda67fc8f', NULL, 'M1', 'Profil de démonstration.', 'Dakar', 'Sénégal', 'PARTIEL', NULL, '{}', NULL, false, 'demo-ibrahima-fall', true, '2026-11-24 19:09:49.611', '2026-11-24 19:09:49.611'),
	('01a20ef6-e01f-77cf-8ca3-32c79d1729d5', '01a20ef6-e01b-74bc-94fa-b239e2866f0e', '01a20ef6-d770-742c-b5e6-ce512f6a577a', NULL, 'L3', 'Profil de démonstration.', 'Dakar', 'Sénégal', 'PARTIEL', NULL, '{}', NULL, false, 'demo-awa-ba', true, '2026-11-24 19:09:49.983', '2026-11-24 19:09:49.983'),
	('01a20ef6-e18c-711b-a489-a55b0cc26c6a', '01a20ef6-e187-7489-9c0e-6a80d5baaa28', '01a20ef6-d76c-736b-aff2-927fda67fc8f', NULL, 'M1', 'Profil de démonstration.', 'Dakar', 'Sénégal', 'PARTIEL', NULL, '{}', NULL, false, 'demo-cheikh-sy', true, '2026-11-24 19:09:50.347', '2026-11-24 19:09:50.347');
























INSERT INTO public."BriefTemplate" (id, name, sector, content, active, "position") VALUES
	('01a20ef6-d436-7408-895c-10ad911ef0a7', 'Finance & FinTech — Analyse d''un parcours client', 'Finance & FinTech', '{"sector": "Finance & FinTech", "skills": ["FinTech & paiement mobile", "UX / UI Design", "Analyse de données"], "context": "[Décrivez votre activité financière, le parcours ou le produit concerné et le problème constaté (abandon, coût, délai, risque)…]\nContexte chiffré si possible : volume d''utilisateurs, période, indicateurs actuels.", "milestones": [{"title": "Cadrage et état des lieux", "targetWeek": 2}, {"title": "Livrable intermédiaire", "targetWeek": 6}, {"title": "Restitution finale", "targetWeek": 10}], "objectives": "[Ex. identifier les 3 principales causes du problème, proposer des solutions priorisées et mesurables…]", "deliverables": [{"title": "Rapport d''analyse et recommandations", "format": "RAPPORT"}, {"title": "Maquette du parcours proposé", "format": "PROTOTYPE"}, {"title": "Présentation de restitution", "format": "PRESENTATION"}], "durationWeeks": 10}', true, 0),
	('01a20ef6-d436-7408-895c-17f9cd4c0680', 'Agriculture & Agro-industrie — Valorisation de données de terrain', 'Agriculture & Agro-industrie', '{"sector": "Agriculture & Agro-industrie", "skills": ["Analyse de données", "AgriTech", "Agro-industrie"], "context": "[Décrivez la filière, les acteurs (producteurs, coopératives, transformateurs) et les données disponibles (météo, rendements, prix…)]", "milestones": [{"title": "Cadrage et état des lieux", "targetWeek": 2}, {"title": "Livrable intermédiaire", "targetWeek": 6}, {"title": "Restitution finale", "targetWeek": 10}], "objectives": "[Ex. produire un outil d''aide à la décision simple et utilisable sur le terrain…]", "deliverables": [{"title": "Analyse des données et méthodologie", "format": "RAPPORT"}, {"title": "Outil ou tableau de bord", "format": "PROTOTYPE"}, {"title": "Guide d''utilisation", "format": "RAPPORT"}], "durationWeeks": 10}', true, 1),
	('01a20ef6-d436-7408-895c-1a49541c3360', 'Santé — Amélioration d''un service numérique', 'Santé & Biotechnologies', '{"sector": "Santé & Biotechnologies", "skills": ["Santé numérique", "UX / UI Design", "Étude de marché"], "context": "[Décrivez la structure de santé, le service concerné et les contraintes (confidentialité, connexion, personnel)…]", "milestones": [{"title": "Cadrage et état des lieux", "targetWeek": 2}, {"title": "Livrable intermédiaire", "targetWeek": 6}, {"title": "Restitution finale", "targetWeek": 10}], "objectives": "[Ex. concevoir un prototype répondant à un besoin identifié auprès des utilisateurs…]", "deliverables": [{"title": "Étude des besoins utilisateurs", "format": "RAPPORT"}, {"title": "Prototype", "format": "PROTOTYPE"}], "durationWeeks": 10}', true, 2),
	('01a20ef6-d436-7408-895c-1d12ef68972f', 'Technologies — Développement d''un prototype web ou mobile', 'Technologies & Numérique', '{"sector": "Technologies & Numérique", "skills": ["Développement web", "Développement mobile", "UX / UI Design"], "context": "[Décrivez le produit, les utilisateurs cibles, l''existant technique et les contraintes (réseau limité, appareils, budget)…]", "milestones": [{"title": "Cadrage et état des lieux", "targetWeek": 2}, {"title": "Livrable intermédiaire", "targetWeek": 7}, {"title": "Restitution finale", "targetWeek": 12}], "objectives": "[Ex. livrer un prototype fonctionnel couvrant les 3 fonctionnalités prioritaires, documenté et testé…]", "deliverables": [{"title": "Spécifications fonctionnelles", "format": "RAPPORT"}, {"title": "Prototype fonctionnel", "format": "CODE"}, {"title": "Documentation technique", "format": "RAPPORT"}], "durationWeeks": 12}', true, 3),
	('01a20ef6-d436-7408-895c-216cb350ad21', 'Éducation — Conception d''un dispositif pédagogique', 'Éducation & Formation', '{"sector": "Éducation & Formation", "skills": ["EdTech", "Communication", "Gestion de projet"], "context": "[Décrivez l''établissement ou l''organisme, le public apprenant et la difficulté pédagogique à résoudre…]", "milestones": [{"title": "Cadrage et état des lieux", "targetWeek": 2}, {"title": "Livrable intermédiaire", "targetWeek": 5}, {"title": "Restitution finale", "targetWeek": 8}], "objectives": "[Ex. concevoir un parcours ou un outil, avec une méthode d''évaluation de son efficacité…]", "deliverables": [{"title": "Cahier pédagogique", "format": "RAPPORT"}, {"title": "Prototype de contenu", "format": "PROTOTYPE"}], "durationWeeks": 8}', true, 4),
	('01a20ef6-d436-7408-895c-24afe37d05f8', 'Énergie & Environnement — Étude et sensibilisation', 'Énergie & Environnement', '{"sector": "Énergie & Environnement", "skills": ["Énergies renouvelables", "Développement durable & RSE", "Analyse de données"], "context": "[Décrivez le site, l''activité ou la communauté concernés, la consommation ou l''impact actuels et les objectifs de réduction…]", "milestones": [{"title": "Cadrage et état des lieux", "targetWeek": 2}, {"title": "Livrable intermédiaire", "targetWeek": 6}, {"title": "Restitution finale", "targetWeek": 10}], "objectives": "[Ex. quantifier la situation actuelle et proposer un plan d''actions chiffré…]", "deliverables": [{"title": "Diagnostic chiffré", "format": "RAPPORT"}, {"title": "Plan d''actions et estimation des gains", "format": "PRESENTATION"}], "durationWeeks": 10}', true, 5),
	('01a20ef6-d436-7408-895c-28fd8faa6011', 'Commerce — Stratégie d''acquisition et de fidélisation', 'Commerce & Distribution', '{"sector": "Commerce & Distribution", "skills": ["Marketing digital", "Étude de marché", "Communication"], "context": "[Décrivez l''activité, la clientèle actuelle, les canaux utilisés et les résultats observés…]", "milestones": [{"title": "Cadrage et état des lieux", "targetWeek": 1}, {"title": "Livrable intermédiaire", "targetWeek": 4}, {"title": "Restitution finale", "targetWeek": 6}], "objectives": "[Ex. définir une stratégie de contenu et d''acquisition sur 3 mois, avec indicateurs de suivi…]", "deliverables": [{"title": "Étude de marché", "format": "RAPPORT"}, {"title": "Plan marketing et calendrier de contenu", "format": "PRESENTATION"}], "durationWeeks": 6}', true, 6),
	('01a20ef6-d436-7408-895c-2f4fd741794b', 'Transport & Logistique — Optimisation d''un flux', 'Transport & Logistique', '{"sector": "Transport & Logistique", "skills": ["Gestion de la chaîne logistique", "Logistique urbaine", "Analyse de données"], "context": "[Décrivez le flux (collecte, transport, livraison), les volumes, les délais et les points de blocage…]", "milestones": [{"title": "Cadrage et état des lieux", "targetWeek": 2}, {"title": "Livrable intermédiaire", "targetWeek": 6}, {"title": "Restitution finale", "targetWeek": 10}], "objectives": "[Ex. cartographier le flux actuel et proposer des améliorations mesurables…]", "deliverables": [{"title": "Cartographie du flux et diagnostic", "format": "RAPPORT"}, {"title": "Outil de suivi (maquette ou prototype)", "format": "PROTOTYPE"}], "durationWeeks": 10}', true, 7),
	('01a20ef6-d436-7408-895c-319066526d3f', 'Tourisme & Culture — Valorisation d''une offre', 'Tourisme & Culture', '{"sector": "Tourisme & Culture", "skills": ["Tourisme durable", "Communication", "Marketing digital"], "context": "[Décrivez le site, l''offre actuelle, la fréquentation et les publics visés…]", "milestones": [{"title": "Cadrage et état des lieux", "targetWeek": 2}, {"title": "Livrable intermédiaire", "targetWeek": 5}, {"title": "Restitution finale", "targetWeek": 8}], "objectives": "[Ex. proposer un plan de valorisation et des supports de communication adaptés…]", "deliverables": [{"title": "Diagnostic de l''offre", "format": "RAPPORT"}, {"title": "Supports de communication", "format": "AUTRE"}], "durationWeeks": 8}', true, 8),
	('01a20ef6-d436-7408-895c-3673e6458817', 'Industrie — Pilotage de la qualité et de la production', 'Industrie & Mines', '{"sector": "Industrie & Mines", "skills": ["Business intelligence", "Qualité & amélioration continue", "Bases de données & SQL"], "context": "[Décrivez la ligne de production, les indicateurs suivis aujourd''hui, les outils utilisés et les écarts constatés…]", "milestones": [{"title": "Cadrage et état des lieux", "targetWeek": 2}, {"title": "Livrable intermédiaire", "targetWeek": 5}, {"title": "Restitution finale", "targetWeek": 9}], "objectives": "[Ex. centraliser les données et visualiser les écarts par lot et par ligne…]", "deliverables": [{"title": "Audit des données existantes", "format": "RAPPORT"}, {"title": "Tableau de bord", "format": "PROTOTYPE"}], "durationWeeks": 9}', true, 9);















INSERT INTO public."Skill" (id, name, slug, category, active, "mergedIntoId", "createdAt") VALUES
	('01a20ef6-d3b6-7663-958e-0a4b9a6d4768', 'Analyse de données', 'analyse-de-donnees', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.806'),
	('01a20ef6-d3bb-752e-bb79-1193e3342e77', 'Data science', 'data-science', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.811'),
	('01a20ef6-d3bd-738e-89fb-99930642310f', 'Machine learning', 'machine-learning', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.813'),
	('01a20ef6-d3bf-7688-9d3b-0a4fc5e6a16a', 'Développement web', 'developpement-web', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.815'),
	('01a20ef6-d3c1-71ac-bca2-ff57547eb00a', 'Développement mobile', 'developpement-mobile', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.817'),
	('01a20ef6-d3c3-71d2-b979-566e0093458a', 'Bases de données & SQL', 'bases-de-donnees-sql', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.819'),
	('01a20ef6-d3c7-700d-a4ba-e32145479455', 'Cybersécurité', 'cybersecurite', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.823'),
	('01a20ef6-d3c9-71e4-a4a1-88498345cfca', 'Cloud & DevOps', 'cloud-devops', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.825'),
	('01a20ef6-d3cd-703b-9bd7-74f63c090ee9', 'UX / UI Design', 'ux-ui-design', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.829'),
	('01a20ef6-d3cf-734c-bdc3-db8c69821994', 'Design graphique', 'design-graphique', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.831'),
	('01a20ef6-d3d1-7592-add3-f711ebb80f8c', 'Intelligence artificielle', 'intelligence-artificielle', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.833'),
	('01a20ef6-d3d3-7795-bf52-8515fb1927cb', 'Business intelligence', 'business-intelligence', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.835'),
	('01a20ef6-d3d6-70ef-9610-513ef5d1b450', 'Électronique & IoT', 'electronique-iot', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.838'),
	('01a20ef6-d3d8-7468-afb9-4788c732f381', 'Modélisation 3D / CAO', 'modelisation-3d-cao', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.84'),
	('01a20ef6-d3d9-7058-8f73-34f83a520bb1', 'Rédaction technique', 'redaction-technique', 'TECHNIQUE', true, NULL, '2026-11-24 19:09:46.841'),
	('01a20ef6-d3db-762f-ae17-735fe2299a19', 'Marketing digital', 'marketing-digital', 'METIER', true, NULL, '2026-11-24 19:09:46.843'),
	('01a20ef6-d3dd-738d-b15a-d0e6224706df', 'Stratégie d''entreprise', 'strategie-d-entreprise', 'METIER', true, NULL, '2026-11-24 19:09:46.845'),
	('01a20ef6-d3df-7302-85da-fba163b36d6c', 'Finance & comptabilité', 'finance-comptabilite', 'METIER', true, NULL, '2026-11-24 19:09:46.847'),
	('01a20ef6-d3e1-757e-8c0a-8ed20ca5efb1', 'Gestion de la chaîne logistique', 'gestion-de-la-chaine-logistique', 'METIER', true, NULL, '2026-11-24 19:09:46.849'),
	('01a20ef6-d3e3-7698-89dc-58412e1b9e10', 'Ressources humaines', 'ressources-humaines', 'METIER', true, NULL, '2026-11-24 19:09:46.851'),
	('01a20ef6-d3e6-70fa-8b0f-5d0549037488', 'Vente & développement commercial', 'vente-developpement-commercial', 'METIER', true, NULL, '2026-11-24 19:09:46.854'),
	('01a20ef6-d3e8-717a-94fb-822aa25a6068', 'Communication', 'communication', 'METIER', true, NULL, '2026-11-24 19:09:46.856'),
	('01a20ef6-d3ea-7420-822a-2bfa357cabf7', 'Étude de marché', 'etude-de-marche', 'METIER', true, NULL, '2026-11-24 19:09:46.858'),
	('01a20ef6-d3ec-77a3-8a47-1a3fdbd93dcc', 'Gestion des risques', 'gestion-des-risques', 'METIER', true, NULL, '2026-11-24 19:09:46.86'),
	('01a20ef6-d3ee-71eb-966b-bcaefb9cf612', 'Droit des affaires', 'droit-des-affaires', 'METIER', true, NULL, '2026-11-24 19:09:46.862'),
	('01a20ef6-d3f0-7087-8a42-033790a45c6f', 'Qualité & amélioration continue', 'qualite-amelioration-continue', 'METIER', true, NULL, '2026-11-24 19:09:46.864'),
	('01a20ef6-d3f2-761e-9eee-d17a33edd49d', 'Entrepreneuriat', 'entrepreneuriat', 'METIER', true, NULL, '2026-11-24 19:09:46.866'),
	('01a20ef6-d3f4-727a-8567-2009dcdcf6c7', 'Gestion de projet', 'gestion-de-projet', 'TRANSVERSALE', true, NULL, '2026-11-24 19:09:46.868'),
	('01a20ef6-d3f7-74c8-a17e-d9ace5f21161', 'Communication orale', 'communication-orale', 'TRANSVERSALE', true, NULL, '2026-11-24 19:09:46.871'),
	('01a20ef6-d3f9-7468-b128-c81e19b2e046', 'Travail en équipe', 'travail-en-equipe', 'TRANSVERSALE', true, NULL, '2026-11-24 19:09:46.873'),
	('01a20ef6-d3fb-73eb-9fd5-9e96112c88d0', 'Résolution de problèmes', 'resolution-de-problemes', 'TRANSVERSALE', true, NULL, '2026-11-24 19:09:46.875'),
	('01a20ef6-d3fc-706c-a3e8-12dca69be391', 'Esprit critique', 'esprit-critique', 'TRANSVERSALE', true, NULL, '2026-11-24 19:09:46.876'),
	('01a20ef6-d3fe-756b-98ac-0f9ea071e0d1', 'Créativité & innovation', 'creativite-innovation', 'TRANSVERSALE', true, NULL, '2026-11-24 19:09:46.878'),
	('01a20ef6-d400-7789-9b00-9dc44444583c', 'Leadership', 'leadership', 'TRANSVERSALE', true, NULL, '2026-11-24 19:09:46.88'),
	('01a20ef6-d402-7321-a8c5-f95eb7af5c33', 'Gestion du temps', 'gestion-du-temps', 'TRANSVERSALE', true, NULL, '2026-11-24 19:09:46.882'),
	('01a20ef6-d404-77f9-9942-167e64c29d91', 'Négociation', 'negociation', 'TRANSVERSALE', true, NULL, '2026-11-24 19:09:46.884'),
	('01a20ef6-d407-765f-b0f5-8a38480b8c72', 'Adaptabilité', 'adaptabilite', 'TRANSVERSALE', true, NULL, '2026-11-24 19:09:46.887'),
	('01a20ef6-d409-70d0-a578-cfb5fde15e87', 'Présentation & storytelling', 'presentation-storytelling', 'TRANSVERSALE', true, NULL, '2026-11-24 19:09:46.889'),
	('01a20ef6-d40b-742d-9862-dcd67e76f6f8', 'FinTech & paiement mobile', 'fintech-paiement-mobile', 'SECTORIELLE', true, NULL, '2026-11-24 19:09:46.891'),
	('01a20ef6-d40c-70eb-88f3-c55c557c3cb5', 'Agro-industrie', 'agro-industrie', 'SECTORIELLE', true, NULL, '2026-11-24 19:09:46.892'),
	('01a20ef6-d40e-71f2-b3d2-46781ce6599c', 'AgriTech', 'agritech', 'SECTORIELLE', true, NULL, '2026-11-24 19:09:46.894'),
	('01a20ef6-d411-70cb-b4d3-7f491c247310', 'Santé numérique', 'sante-numerique', 'SECTORIELLE', true, NULL, '2026-11-24 19:09:46.897'),
	('01a20ef6-d413-7208-bc44-1af5c57efa18', 'Énergies renouvelables', 'energies-renouvelables', 'SECTORIELLE', true, NULL, '2026-11-24 19:09:46.899'),
	('01a20ef6-d415-711d-8cb3-42a6e7010941', 'EdTech', 'edtech', 'SECTORIELLE', true, NULL, '2026-11-24 19:09:46.901'),
	('01a20ef6-d418-77a0-a90e-cdcb8604e270', 'Logistique urbaine', 'logistique-urbaine', 'SECTORIELLE', true, NULL, '2026-11-24 19:09:46.904'),
	('01a20ef6-d41a-7678-acbe-19f5f84c196e', 'Commerce de proximité', 'commerce-de-proximite', 'SECTORIELLE', true, NULL, '2026-11-24 19:09:46.906'),
	('01a20ef6-d41c-7449-a618-7643e147bcf0', 'Développement durable & RSE', 'developpement-durable-rse', 'SECTORIELLE', true, NULL, '2026-11-24 19:09:46.908'),
	('01a20ef6-d41e-773f-a4ea-e62a6aebdd61', 'Tourisme durable', 'tourisme-durable', 'SECTORIELLE', true, NULL, '2026-11-24 19:09:46.91');



INSERT INTO public."ChallengeSkill" (id, "challengeId", "skillId", "minLevel", weight) VALUES
	('01a20ef6-e73c-73cd-be4d-90b271791028', '01a20ef6-e73b-7006-9899-a8520525ddd5', '01a20ef6-d3b6-7663-958e-0a4b9a6d4768', 'PRATICIEN', 1),
	('01a20ef6-e73c-73cd-be4d-97104235d8bb', '01a20ef6-e73b-7006-9899-a8520525ddd5', '01a20ef6-d3bd-738e-89fb-99930642310f', 'PRATICIEN', 1),
	('01a20ef6-e73c-73cd-be4d-9897667736e2', '01a20ef6-e73b-7006-9899-a8520525ddd5', '01a20ef6-d40e-71f2-b3d2-46781ce6599c', 'PRATICIEN', 1),
	('01a20ef6-e747-72d1-9033-8cb801547f59', '01a20ef6-e746-73a5-b1dd-eb6fbbfa6928', '01a20ef6-d3c1-71ac-bca2-ff57547eb00a', 'PRATICIEN', 1),
	('01a20ef6-e747-72d1-9033-938bb8ba6991', '01a20ef6-e746-73a5-b1dd-eb6fbbfa6928', '01a20ef6-d3cd-703b-9bd7-74f63c090ee9', 'PRATICIEN', 1),
	('01a20ef6-e747-72d1-9033-978646e5c042', '01a20ef6-e746-73a5-b1dd-eb6fbbfa6928', '01a20ef6-d3f4-727a-8567-2009dcdcf6c7', 'PRATICIEN', 1),
	('01a20ef6-e750-700a-8ec3-60e4d69b7dd5', '01a20ef6-e74f-772f-aae4-8b0d1a74a5dc', '01a20ef6-d3cd-703b-9bd7-74f63c090ee9', 'PRATICIEN', 1),
	('01a20ef6-e750-700a-8ec3-66c77abe9f86', '01a20ef6-e74f-772f-aae4-8b0d1a74a5dc', '01a20ef6-d40b-742d-9862-dcd67e76f6f8', 'PRATICIEN', 1),
	('01a20ef6-e750-700a-8ec3-68f34624f73d', '01a20ef6-e74f-772f-aae4-8b0d1a74a5dc', '01a20ef6-d3ea-7420-822a-2bfa357cabf7', 'PRATICIEN', 1),
	('01a20ef6-e759-752b-910b-0604a6ad6901', '01a20ef6-e758-735b-acf2-a06f9a63bede', '01a20ef6-d3db-762f-ae17-735fe2299a19', 'PRATICIEN', 1),
	('01a20ef6-e759-752b-910b-0ab72f4c05e8', '01a20ef6-e758-735b-acf2-a06f9a63bede', '01a20ef6-d3e8-717a-94fb-822aa25a6068', 'PRATICIEN', 1),
	('01a20ef6-e759-752b-910b-0e752bd42853', '01a20ef6-e758-735b-acf2-a06f9a63bede', '01a20ef6-d409-70d0-a578-cfb5fde15e87', 'PRATICIEN', 1),
	('01a20ef6-e763-77b9-b8a5-0b16774df89e', '01a20ef6-e762-7079-871d-1a6dd31e9aae', '01a20ef6-d3d3-7795-bf52-8515fb1927cb', 'PRATICIEN', 1),
	('01a20ef6-e763-77b9-b8a5-0cdea44a035f', '01a20ef6-e762-7079-871d-1a6dd31e9aae', '01a20ef6-d3c3-71d2-b979-566e0093458a', 'PRATICIEN', 1),
	('01a20ef6-e763-77b9-b8a5-114ed493c506', '01a20ef6-e762-7079-871d-1a6dd31e9aae', '01a20ef6-d3f0-7087-8a42-033790a45c6f', 'PRATICIEN', 1);


















INSERT INTO public."CompanyMember" (id, "userId", "companyId", "jobTitle", "contactRole", "isOwner", "createdAt") VALUES
	('01a20ef6-e5d0-75de-881c-fd828cbb0cd4', '01a20ef6-e5c2-762b-9afc-1241b5527f81', '01a20ef6-e5cd-71bc-835c-eb522810311e', NULL, 'AUTRE', true, '2026-11-24 19:09:51.44'),
	('01a20ef6-e72e-7635-931a-2346c02e055a', '01a20ef6-e726-70c5-89ae-096135f5c4cc', '01a20ef6-e72c-7772-8b9d-66199eec8994', NULL, 'AUTRE', true, '2026-11-24 19:09:51.79');










































INSERT INTO public."FaqItem" (id, question, answer, audience, published, "position", "createdAt") VALUES
	('01a20ef6-d42c-70f2-86eb-98649a934b63', 'Qu''est-ce que NEXBRIDGE ?', 'NEXBRIDGE est une plateforme d''innovation ouverte fondée sur l''apprentissage par projet. Des entreprises y déposent des défis réels, des équipes interdisciplinaires d''étudiants les relèvent avec l''accompagnement d''un expert ou mentor, et les établissements valident les compétences acquises.', 'GENERAL', true, 1, '2026-11-24 19:09:46.922'),
	('01a20ef6-d42c-70f2-86eb-9e969f045bc7', 'Comment fonctionne la mise en relation ?', 'Une fois un défi validé et publié, NexMatch propose à l''entreprise les équipes les plus adaptées selon les compétences, la formation, les disponibilités et l''historique des étudiants. Les étudiants peuvent aussi postuler librement. Chaque équipe est validée par l''entreprise, puis acceptée individuellement par les étudiants.', 'GENERAL', true, 2, '2026-11-24 19:09:46.922'),
	('01a20ef6-d42c-70f2-86eb-a07395dff06f', 'Mes données personnelles sont-elles protégées ?', 'Oui. NEXBRIDGE applique les principes du RGPD et de la loi sénégalaise sur la protection des données personnelles : consentement explicite, accès, export et suppression de vos données depuis votre espace, chiffrement des communications et des données sensibles.', 'GENERAL', true, 3, '2026-11-24 19:09:46.922'),
	('01a20ef6-d42c-70f2-86eb-a77d8f195a90', 'Comment déposer un défi ?', 'Créez un compte entreprise, faites valider votre organisation (NINEA et registre de commerce), puis utilisez l''assistant NexBrief en cinq étapes : contexte, périmètre, équipe, calendrier et budget. Votre défi est relu par l''équipe NEXBRIDGE avant publication.', 'ENTREPRISE', true, 1, '2026-11-24 19:09:46.922'),
	('01a20ef6-d42c-70f2-86eb-a846331f2b73', 'Pourquoi mon organisation doit-elle être validée ?', 'La vérification (KYC) protège les étudiants et la plateforme : elle confirme l''existence légale de l''organisation avant la publication de défis. Elle est traitée par un administrateur, généralement sous 48 heures.', 'ENTREPRISE', true, 2, '2026-11-24 19:09:46.922'),
	('01a20ef6-d42c-70f2-86eb-af1c5de3b2fb', 'Qui peut s''inscrire en tant qu''étudiant ?', 'Tout étudiant inscrit dans un établissement d''enseignement supérieur. Vous renseignez votre établissement, votre filière, votre niveau, vos compétences et vos disponibilités ; ces informations alimentent le matching et votre portfolio.', 'ETUDIANT', true, 1, '2026-11-24 19:09:46.922'),
	('01a20ef6-d42c-70f2-86eb-b03c8017332d', 'Les projets sont-ils reconnus par mon établissement ?', 'Les établissements partenaires disposent d''un espace référent pour valider les projets et attribuer des crédits (ECTS ou équivalent). Les modalités dépendent de votre établissement.', 'ETUDIANT', true, 2, '2026-11-24 19:09:46.922'),
	('01a20ef6-d42c-70f2-86eb-b7f34f00978d', 'Comment devenir établissement partenaire ?', 'Un référent académique crée un compte et rattache son établissement. L''établissement est ensuite validé par l''équipe NEXBRIDGE, ce qui ouvre la gestion des cohortes, la validation des projets et les rapports pédagogiques.', 'ETABLISSEMENT', true, 1, '2026-11-24 19:09:46.922');





















INSERT INTO public."MentorProfile" (id, "userId", bio, "yearsExperience", "indicativeHourlyRate", "maxConcurrentProjects", "expertiseSectors", certifications, "ratingAvg", "onboardingDone", "createdAt", "updatedAt") VALUES
	('01a20ef6-e2fd-7141-837b-0e2c6fff7d89', '01a20ef6-e2f7-77a8-a358-be02666b526f', 'Profil de démonstration.', 10, NULL, 3, '{"Technologies & Numérique"}', '{}', NULL, true, '2026-11-24 19:09:50.716', '2026-11-24 19:09:50.716'),
	('01a20ef6-e461-7299-97a4-6835c65c90f1', '01a20ef6-e45c-76f6-a888-75c54cc650a9', 'Profil de démonstration.', 10, NULL, 3, '{"Technologies & Numérique"}', '{}', NULL, true, '2026-11-24 19:09:51.072', '2026-11-24 19:09:51.072');







































INSERT INTO public."ReferentProfile" (id, "userId", "institutionId", "jobTitle", programs, "onboardingDone", "createdAt", "updatedAt") VALUES
	('01a20ef6-d8d4-762a-a926-97fe160848d8', '01a20ef6-d8cd-7099-81eb-c9b07ff98732', '01a20ef6-d76c-736b-aff2-927fda67fc8f', NULL, '{}', true, '2026-11-24 19:09:48.115', '2026-11-24 19:09:48.115');









INSERT INTO public."StudentSkill" (id, "studentId", "skillId", level, source, "createdAt") VALUES
	('01a20ef6-da4c-73bd-b8ef-cc3ca5d391cc', '01a20ef6-da46-75b8-9286-7672b3cb89cc', '01a20ef6-d3b6-7663-958e-0a4b9a6d4768', 'PRATICIEN', 'DECLARE', '2026-11-24 19:09:48.491'),
	('01a20ef6-da51-7438-a8b1-d40e92c1bec9', '01a20ef6-da46-75b8-9286-7672b3cb89cc', '01a20ef6-d3d3-7795-bf52-8515fb1927cb', 'CONFIRME', 'DECLARE', '2026-11-24 19:09:48.496'),
	('01a20ef6-da55-721d-b438-c4f51f96e708', '01a20ef6-da46-75b8-9286-7672b3cb89cc', '01a20ef6-d3f9-7468-b128-c81e19b2e046', 'SENSIBILISE', 'DECLARE', '2026-11-24 19:09:48.5'),
	('01a20ef6-dbc8-74ac-a66e-37a3304157ad', '01a20ef6-dbc4-712b-aee1-0a4c7398f0e1', '01a20ef6-d3bf-7688-9d3b-0a4fc5e6a16a', 'PRATICIEN', 'DECLARE', '2026-11-24 19:09:48.871'),
	('01a20ef6-dbcc-725b-be2c-7a3017072bee', '01a20ef6-dbc4-712b-aee1-0a4c7398f0e1', '01a20ef6-d3cd-703b-9bd7-74f63c090ee9', 'CONFIRME', 'DECLARE', '2026-11-24 19:09:48.875'),
	('01a20ef6-dbd0-72ee-ad8d-1d8c5608a579', '01a20ef6-dbc4-712b-aee1-0a4c7398f0e1', '01a20ef6-d3f4-727a-8567-2009dcdcf6c7', 'SENSIBILISE', 'DECLARE', '2026-11-24 19:09:48.879'),
	('01a20ef6-dd35-77f8-8f11-9b4c7407970c', '01a20ef6-dd31-7414-94d3-2c9e003b892a', '01a20ef6-d3db-762f-ae17-735fe2299a19', 'PRATICIEN', 'DECLARE', '2026-11-24 19:09:49.236'),
	('01a20ef6-dd43-7630-92c5-85fdc8dd384a', '01a20ef6-dd31-7414-94d3-2c9e003b892a', '01a20ef6-d3e8-717a-94fb-822aa25a6068', 'CONFIRME', 'DECLARE', '2026-11-24 19:09:49.241'),
	('01a20ef6-dd48-7321-b691-077f4920c8e8', '01a20ef6-dd31-7414-94d3-2c9e003b892a', '01a20ef6-d3ea-7420-822a-2bfa357cabf7', 'SENSIBILISE', 'DECLARE', '2026-11-24 19:09:49.255'),
	('01a20ef6-deb0-724d-9db5-3a9e30c731bc', '01a20ef6-deac-7607-ae8d-9e6a6023f797', '01a20ef6-d3bd-738e-89fb-99930642310f', 'PRATICIEN', 'DECLARE', '2026-11-24 19:09:49.615'),
	('01a20ef6-deb3-762d-a473-c11d7eb1a033', '01a20ef6-deac-7607-ae8d-9e6a6023f797', '01a20ef6-d3b6-7663-958e-0a4b9a6d4768', 'CONFIRME', 'DECLARE', '2026-11-24 19:09:49.618'),
	('01a20ef6-deb8-74cf-a2cc-5d845368db7c', '01a20ef6-deac-7607-ae8d-9e6a6023f797', '01a20ef6-d3fb-73eb-9fd5-9e96112c88d0', 'SENSIBILISE', 'DECLARE', '2026-11-24 19:09:49.623'),
	('01a20ef6-e024-745c-bd4b-cf566f9de200', '01a20ef6-e01f-77cf-8ca3-32c79d1729d5', '01a20ef6-d3df-7302-85da-fba163b36d6c', 'PRATICIEN', 'DECLARE', '2026-11-24 19:09:49.987'),
	('01a20ef6-e028-732c-ac09-9bb0740178f9', '01a20ef6-e01f-77cf-8ca3-32c79d1729d5', '01a20ef6-d40b-742d-9862-dcd67e76f6f8', 'CONFIRME', 'DECLARE', '2026-11-24 19:09:49.991'),
	('01a20ef6-e02c-73cb-898e-b54a922a5cd3', '01a20ef6-e01f-77cf-8ca3-32c79d1729d5', '01a20ef6-d409-70d0-a578-cfb5fde15e87', 'SENSIBILISE', 'DECLARE', '2026-11-24 19:09:49.995'),
	('01a20ef6-e191-7758-a4af-28398d650203', '01a20ef6-e18c-711b-a489-a55b0cc26c6a', '01a20ef6-d3c9-71e4-a4a1-88498345cfca', 'PRATICIEN', 'DECLARE', '2026-11-24 19:09:50.352'),
	('01a20ef6-e196-770f-aa08-32933c4a4f9e', '01a20ef6-e18c-711b-a489-a55b0cc26c6a', '01a20ef6-d3c7-700d-a4ba-e32145479455', 'CONFIRME', 'DECLARE', '2026-11-24 19:09:50.357'),
	('01a20ef6-e199-717a-adac-a09caf063cc0', '01a20ef6-e18c-711b-a489-a55b0cc26c6a', '01a20ef6-d3c3-71d2-b979-566e0093458a', 'SENSIBILISE', 'DECLARE', '2026-11-24 19:09:50.36');






























INSERT INTO public."Testimonial" (id, "authorName", "authorRole", organization, quote, published, "isDemo", "position", "createdAt") VALUES
	('01a20ef6-e768-7655-8c15-9d6514806b47', 'Personne fictive', 'Directrice innovation', '[Démo] Organisation', 'Exemple de témoignage — à remplacer par un vrai témoignage depuis le back-office.', true, true, 1, '2026-11-24 19:09:51.847'),
	('01a20ef6-e768-7655-8c15-a27844d5ccfe', 'Personne fictive', 'Étudiant en Master 1', '[Démo] Établissement', 'Exemple de témoignage — à remplacer par un vrai témoignage depuis le back-office.', true, true, 2, '2026-11-24 19:09:51.847');





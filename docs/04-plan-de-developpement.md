# NEXBRIDGE — Dossier de conception · Étape 1
## Document 4/4 — Plan de développement priorisé

Ce plan suit **vos 5 phases** et les met en correspondance avec les 6 sprints du CDC. Chaque phase se termine par une **livraison démontrable** que vous validez avant de passer à la suivante. Les tailles sont relatives (S / M / L / XL) ; les 12 semaines du CDC correspondent à une équipe humaine complète et ne sont pas un engagement ici : le rythme dépend de vos validations.

## 1. Priorisation (méthode)
Critères : (1) priorité CDC (CRITIQUE > HAUTE > MOYENNE), (2) dépendance technique (on construit d'abord ce dont les autres modules ont besoin), (3) risque (les points juridiques ou dépendant de tiers sont isolés derrière des interfaces), (4) valeur visible tôt.

| Rang | Bloc | Pourquoi à cette place |
|:-:|---|---|
| 1 | Fondations : dépôt, base, design system, shell | Tout en dépend |
| 2 | Auth + profils multi-rôles + RBAC | Prérequis de tout accès sécurisé |
| 3 | Landing + marketplace publique | Image de marque, entrée du tunnel d'inscription |
| 4 | NexBrief + validation admin | Source de la valeur (les défis) |
| 5 | Candidatures + NexMatch + équipes | Mise en relation = différenciateur |
| 6 | **NexSpace** | Cœur opérationnel, priorité majeure de votre brief |
| 7 | Évaluations, NexBadge, NexDash, back-office complet | Valorisation et pilotage |
| 8 | Paiement, IA avancée, visio, intégrations | Dépendent de contrats et validations externes |

## 2. Phases et incréments

### Phase 0 — Prérequis (avant tout code)
| | Livrable | Critère de sortie |
|---|---|---|
| 0.1 | Validation de ce dossier + décisions D1–D10 | Votre accord (ou vos modifications) |
| 0.2 | Installation de Node 24 LTS, pnpm, PostgreSQL 16, Redis ; initialisation du dépôt Git — **fait** (voir README) | `node -v`, `psql`, `redis-cli ping` répondent |
| 0.3 | Détourage du logo et de l'icône depuis la charte ; échantillonnage du bleu nuit | Fichiers `public/brand/*` prêts |

### Phase 1 — Fondations *(≈ CDC S1)*
| | Livrable | Taille |
|---|---|:-:|
| 1.1 | Monorepo pnpm, TypeScript, ESLint/Prettier, GitHub Actions (build, lint, tests), `.env.example`, schéma Prisma socle (identité, profils, compétences, audit, notifications, fichiers) | M |
| 1.2 | Design system : jetons, Plus Jakarta Sans, composants de base, shell d'application (sidebar, header, recherche, notifications), i18n FR | L |
| 1.3 | **Landing page complète** (sections 4.1 à 4.10 du brief) + pages thématiques + formulaires de contact / newsletter **enregistrés en base** ; pré-rendu | L |
| 1.4 | **Authentification** : inscription multi-rôles, vérification e-mail, mot de passe oublié (1 h), JWT RS256 + refresh rotatif, blacklist, 2FA TOTP, OAuth Google/LinkedIn (boutons « non configuré » sans clés), anti brute-force | XL |
| 1.5 | **RBAC** (matrice partagée API + UI) + gestion de session sécurisée | M |
| 1.6 | **Onboarding et profils** des 4 rôles métier, KYC entreprise (dépôt de pièces, statut), disponibilités, compétences avec niveaux, paramètres de confidentialité, notifications in-app (socle) | XL |
| **Sortie** | Un visiteur parcourt la landing, crée un compte de chaque rôle, vérifie son e-mail (en dev : boîte e-mails de développement), complète son profil, se reconnecte et retrouve ses données. Tests : unitaires auth, Supertest RBAC, Playwright « inscription → onboarding ». | |

### Phase 2 — Fonctionnalités principales *(≈ CDC S2 + S3)* — **livrée** (voir README)
| | Livrable | Taille |
|---|---|:-:|
| 2.1 | **NexBrief** : wizard 5 étapes, brouillon automatique, 10 templates sectoriels, soumission, historique de statuts | L |
| 2.2 | **Back-office minimal** : file de validation des briefs (checklist, refus motivé) et des KYC ; notifications de décision | M |
| 2.3 | **Marketplace** publique et connectée : liste, filtres (secteur, durée, compétences, budget), recherche plein texte PostgreSQL, détail d'un défi | M |
| 2.4 | **Candidatures** : candidature libre, suivi côté étudiant et côté entreprise | M |
| 2.5 | **NexMatch v1** : moteur de règles + explications + top 3 + mode manuel (voir §3) | XL |
| 2.6 | **Validation d'équipe** : entreprise → étudiants (72 h, relances 24 h, remplacement auto) → référent si requis → kick-off ; création automatique du projet et de ses membres | XL |
| 2.7 | Points d'accroche paiement (modèle `Escrow`/`Transaction`, déclencheur « équipe validée ») **sans flux d'argent** | S |
| **Sortie** | Parcours critique **Entreprise** (soumettre un défi) et **Admin** (valider un brief) de bout en bout ; équipe constituable ; projet créé. Données de démo en staging. | |

### Phase 3 — NexSpace *(≈ CDC S4, priorité majeure)* — **livrée** (voir README)
| | Livrable | Taille |
|---|---|:-:|
| 3.1 | Espace projet : membres/permissions, **vue générale**, progression, **tableau de bord du projet** | L |
| 3.2 | **Kanban** + tâches : glisser-déposer, fiche détaillée, sous-tâches, commentaires @, étiquettes, historique, priorités | XL |
| 3.3 | **Vue liste** (tri, filtres, export), **calendrier** (mois/semaine/jour), **jalons** et règles de validation | L |
| 3.4 | **Documents** : dossiers, versions (3), aperçu, droits, contrôles de fichiers | L |
| 3.5 | **Messagerie** temps réel : canaux, DM, fils, mentions, emojis, non lus, notifications | XL |
| 3.6 | **Fil d'activité**, **livrables** (workflow à 6 états, double validation), **réunions** (lien Jitsi, comptes rendus) | L |
| 3.7 | **Espace mentor** : projets supervisés, alertes, rapports hebdomadaires | M |
| **Sortie** | Parcours critique **Étudiant** (postuler et travailler) complet : tâche créée → déplacée → livrable soumis → approuvé par le mentor → validé par l'entreprise. Tests Playwright sur ce parcours ; tests de permissions sur chaque route NexSpace. | |

### Phase 4 — Pilotage *(≈ CDC S5 partiel + S6)*
| | Livrable | Taille |
|---|---|:-:|
| 4.1 | **Évaluations** finales (6 types), clôture de projet, validation académique et crédits | L |
| 4.2 | **NexBadge** : référentiel, badges automatiques, certifications, portfolio public, **attestation PDF** avec code de vérification | L |
| 4.3 | **NexDash** : 5 tableaux de bord sur données réelles (graphiques, radar des compétences, KPI) | XL |
| 4.4 | **Back-office complet** : utilisateurs, établissements, compétences, badges, modération, signalements, commissions, journaux d'audit, contenus (témoignages, FAQ, partenaires), exports CSV/PDF | XL |
| 4.5 | Espace **référent** (cohortes, étudiants, projets à valider, rapports) | L |
| 4.6 | Durcissement : revue OWASP, SAST, audit de dépendances, tests de charge légers, performance 3G (budgets de poids), accessibilité (axe) | L |
| **Sortie** | Les **5 espaces** sont opérationnels ; documentation technique, guide utilisateur (Entreprise, Étudiant, Admin au minimum), procédure de déploiement. | |

### Phase 5 — Intégrations *(≈ CDC S5 paiement + v2 sélectionné)*
| | Livrable | Condition |
|---|---|---|
| 5.1 | **Paiement** : Stripe (test puis live), virement avec rapprochement manuel, commissions, factures PDF, remboursements, historique | D2 tranchée, clés Stripe |
| 5.2 | Mobile Money (Orange Money, Wave, Free Money) | Contrats marchands + documentation API fournis |
| 5.3 | E-mails réels (SendGrid), notifications paramétrables (fréquence, types) | Clé SendGrid |
| 5.4 | **IA avancée** : service FastAPI, embeddings multilingues, diversité, remplacement du moteur de règles derrière `MatchingEngine` | Phase 2 stable |
| 5.5 | Visioconférence Jitsi embarquée | Choix auto-hébergé ou service géré |
| 5.6 | Intégrations académiques (Moodle), abonnements SaaS, Open Badges v2 / export LinkedIn, signature électronique | v2, à prioriser avec vous |

## 3. NexMatch v1 — spécification du moteur de règles
**Entrées** : exigences du défi (`ChallengeSkill`, secteur, durée, niveau, taille d'équipe) × profils étudiants (compétences et niveaux, filière, niveau d'études, disponibilité, préférences sectorielles, historique et notes de projets, charge actuelle).

**Score individuel (0–100)**, pondérations stockées en base et modifiables par le Super Admin :
| Composante | Poids initial | Calcul |
|---|:-:|---|
| Compétences requises | 50 % | Moyenne pondérée sur les compétences du défi : niveau de l'étudiant / niveau demandé (plafonné à 1), bonus si compétence **validée par un projet** ou certifiée |
| Formation et niveau d'études | 15 % | Filière pertinente pour le secteur ; niveau ≥ niveau minimal |
| Disponibilité | 10 % | Compatibilité plein temps / partiel / week-end avec la durée et la date de début |
| Préférence sectorielle | 10 % | Secteur du défi parmi les préférences |
| Historique et fiabilité | 15 % | Neutre (60) sans projet ; ensuite évaluations reçues et expérience (les évaluations arrivent en phase 4) |

**Pénalité de surcharge** : score ×0,70 si l'étudiant a déjà 2 projets actifs (CDC). **Exclusion** : étudiant non disponible ou ayant refusé ce défi.

**Constitution des équipes** : à partir des N meilleurs candidats, recherche d'équipes de la taille demandée qui **couvrent toutes les compétences requises** (sinon pénalité), puis score d'équipe = moyenne pondérée des scores individuels + **bonus de diversité** (≥ 3 filières) ; on garde les **3 meilleures équipes distinctes** (pas plus de 1 membre commun entre deux propositions quand c'est possible).

**Explication affichée** : pour chaque proposition, points forts (« couvre 4/5 compétences requises dont 2 au niveau Confirmé »), points d'attention (« 1 membre à 2 projets actifs »), diversité (« 3 filières »), disponibilités. Toutes les décisions sont dérivées des sous-scores stockés : **pas d'explication inventée**.

**Performance** : cible < 5 s (CDC), calcul asynchrone via BullMQ avec résultat mis en cache ; trace complète dans `MatchRun` (version du moteur, pondérations utilisées).
**Évolution** : `MatchingEngine { propose(challenge): Proposal[] }` ; `RulesEngine` (v1) et `RemoteAIEngine` (HTTP vers FastAPI, v2) interchangeables par configuration.

## 4. Stratégie de qualité
| Niveau | Outil | Portée | Cible |
|---|---|---|---|
| Unitaire | Jest | Matching, progression, machines à états, permissions, calculs de commission | > 70 % global, 90 % flux critiques |
| API | Supertest | Chaque route : succès, validation (400), non authentifié (401), **hors périmètre (403)** | 100 % des routes protégées |
| E2E | Playwright | 3 parcours critiques du CDC (Entreprise, Étudiant, Admin) + inscription par rôle | verts avant chaque livraison |
| Accessibilité | axe via Playwright | Pages clés | 0 violation critique |
| Sécurité | SAST (CodeQL ou SonarQube), `pnpm audit`, revue OWASP Top 10 | Chaque PR + hebdomadaire | 0 critique/haute non corrigée |
| Performance | Lighthouse (profil mobile lent), budgets de poids | Landing et marketplace | chargement < 2 s (4G simulée) |

**Definition of Done** (reprise du CDC, adaptée) : code relu ; tests écrits et verts ; documentation (OpenAPI) à jour ; testé sur Chrome, Firefox, Safari ; déployé en staging ; validé par vous.

## 5. Livrables finaux (rappel de votre brief) et où ils seront
| Livrable | Emplacement / forme |
|---|---|
| Landing page, application SaaS, 5 espaces, NexSpace, back-office | `apps/web`, `apps/api` |
| Base de données structurée | `apps/api/prisma/schema.prisma`, migrations, seed de démo (`apps/api/src/seed`) |
| Code documenté | README par application, commentaires ciblés |
| Instructions d'installation, variables d'environnement | `README.md`, `.env.example` commenté |
| Documentation technique et API | `docs/`, OpenAPI 3 servi par l'API |
| Tests | `**/*.test.ts`, `e2e/` |
| Guide utilisateur | `docs/guides/` (Entreprise, Étudiant, Mentor, Référent, Admin) |
| Procédure de déploiement | `docs/deploiement.md` + `infra/` |

## 6. Risques principaux
| Risque | Effet | Parade |
|---|---|---|
| Cadre juridique du séquestre / paiement des étudiants | Bloque 5.1 | D2 ; modèle prêt, flux réel seulement après validation |
| Contrats Mobile Money non signés | Pas de paiement local | Adaptateurs prêts, affichage « bientôt disponible », virement manuel en attendant |
| Logo sans source vectorielle | Rendu flou sur grands écrans | D1 ; version raster soignée en attendant |
| Réseau 3G | Pages lentes | Budgets de poids, code splitting, pagination, polices allégées |
| Périmètre très large | Dérive de planning | Phases validées, v2 explicitement écartée, « Bientôt disponible » visible |
| Qualité de la modération des défis | Défis faibles publiés | Checklist de validation, refus motivé, templates sectoriels |

## 7. Prochaine étape après votre validation
1. Installer l'environnement (Phase 0.2) avec votre accord sur chaque commande.
2. Initialiser le dépôt et le monorepo, puis enchaîner Phase 1 : design system → landing → authentification → profils.
3. Vous présenter la Phase 1 en fonctionnement (captures + comptes de test) avant d'aborder la Phase 2.

# NEXBRIDGE — Dossier de conception · Étape 1
## Document 1/4 — Synthèse fonctionnelle, incohérences et décisions à prendre

*Sources analysées : `NEXBRIDGE_CahierDesCharges.docx` (v1.0, avril 2025), `Charte graphique_NEXBRIDGE.png`, `Logo_NEXBRIDGE.jpeg`, `Logo_NEXBRIDGE_mobile.jpeg`, `Landing Page.jpeg`, `Interface.jpeg`, et votre brief de mission.*

Les quatre documents :
1. **Synthèse et décisions** (ce fichier)
2. Architecture, arborescences et parcours utilisateurs → `02-architecture-et-parcours.md`
3. NexSpace, base de données, design system → `03-nexspace-donnees-design.md`
4. Plan de développement priorisé → `04-plan-de-developpement.md`

---

## 1. Synthèse fonctionnelle

### 1.1 Proposition de valeur
NEXBRIDGE est une place de marché d'**innovation ouverte** fondée sur l'**apprentissage par projet** : des entreprises déposent de vrais défis, des équipes interdisciplinaires d'étudiants les traitent sous la supervision d'un mentor, et les établissements valident les acquis (crédits, attestations). Marché initial : Sénégal / Afrique de l'Ouest.

### 1.2 Rôles (6 valeurs techniques, 5 espaces)
| Rôle technique | Espace | Accès |
|---|---|---|
| `ENTREPRISE` (+ collaborateurs rattachés) | Espace Entreprise | Web (+ mobile v2) |
| `ETUDIANT` | Espace Étudiant | Web (+ mobile v2) |
| `MENTOR` | Espace Expert / Mentor | Web (+ mobile v2) |
| `REFERENT_ACADEMIQUE` | Espace Référent académique | Web |
| `ADMIN` | Back-office | Web |
| `SUPER_ADMIN` | Back-office + configuration avancée, droits, audit | Web |

Le brief parle de « cinq rôles » en regroupant Admin et Super Admin ; le cahier des charges (CDC) en liste six. Je retiens **six valeurs de rôle** (les permissions diffèrent) et **cinq espaces**.

### 1.3 Les 8 modules
| Module | Finalité | MVP (v1.0) | Reporté v2 (selon CDC) |
|---|---|---|---|
| **M1 Auth & Profils** | Inscription multi-rôles, connexion, KYC, profils | Email/mdp, vérif. email, reset 1 h, OAuth Google/LinkedIn, 2FA TOTP optionnel, KYC entreprise, 4 types de profil | CV export PDF (F-031) |
| **M2 NexBrief** | Créer, valider, publier les défis | Wizard 5 étapes, templates sectoriels, workflow de validation, marketplace | Assistant IA de brief (F-024) |
| **M3 NexMatch** | Matching équipes ↔ défis | Scoring par règles, top 3, mode manuel, candidature libre, validation multi-parties | Embeddings NLP + diversité (F-026) |
| **M4 NexSpace** | Gestion de projet collaborative | Kanban, jalons, chat, fichiers, livrables, activité, réunions, suivi mentor, évaluation | Gantt (F-027), wiki (F-028), visio intégrée Jitsi (F-025) |
| **M5 NexBadge** | Compétences, badges, attestations | Référentiel, badges auto, attestation PDF | Open Badges v2 / export LinkedIn (F-030) |
| **M6 NexDash** | Tableaux de bord par rôle | 5 dashboards sur données réelles | Analytics avancés (F-033) |
| **M7 Paiement** | Séquestre, commissions, factures | Architecture + modèle de données + Stripe test + virement | Abonnements SaaS (F-032) |
| **M8 Back-office** | Administration | Utilisateurs, KYC, briefs, compétences, badges, signalements, journaux, exports | — |

### 1.4 Cycle de vie bout en bout
```
Entreprise rédige un brief (BROUILLON)
  → soumis (EN_REVISION) → validé par un admin → PUBLIE (marketplace)
  → candidatures libres + propositions NexMatch (top 3)
  → validation : entreprise → chaque étudiant (72 h, relance /24 h, remplacement auto)
                 → référent académique (si nécessaire) → KICK-OFF
  → [dépôt de garantie / séquestre — sous réserve juridique, voir D2]
  → EN_COURS : le projet reçoit son espace NexSpace (membres = autorisations)
  → jalons + livrables (mentor valide AVANT transmission à l'entreprise)
  → évaluations croisées + validation académique (crédits)
  → CLOTURE : badges, attestation PDF, [libération des fonds, commission 15–20 %]
  → ARCHIVE (6 mois après clôture, livrables toujours accessibles)
```

### 1.5 Règles métier chiffrées extraites du CDC
| Règle | Valeur |
|---|---|
| Taille d'équipe | 2 à 8 étudiants |
| Délai de confirmation d'équipe | 72 h max, relances toutes les 24 h, remplacement automatique par le suivant du classement |
| Pénalité de surcharge (matching) | −30 % du score si l'étudiant a déjà 2 projets actifs |
| Bonus diversité | prime si ≥ 3 filières différentes dans l'équipe |
| Versions de documents conservées | 3 dernières |
| Pièces jointes chat / vidéos | ≤ 25 Mo / MP4 < 200 Mo |
| Commission NEXBRIDGE | 15 à 20 % du budget, déduite à la libération |
| Virement étudiants | ≤ 5 jours ouvrés après validation du livrable |
| Remboursement | ≤ 10 jours ouvrés |
| KYC entreprise | validation sous 48 h (NINEA, registre de commerce) |
| Sessions | JWT RS256, access 15 min, refresh 7 j en cookie HttpOnly avec rotation, blacklist |
| Anti brute-force | 5 tentatives / 15 min → blocage 30 min, CAPTCHA après 3 échecs |
| Mots de passe | bcrypt, cost 12 |
| Certification NEXBRIDGE | après 3 projets validés sur une même compétence |
| Badge « Top Performer » | évaluation > 4,5/5 ; « Leader » : 3 projets comme chef d'équipe ; badge sectoriel : 2 projets dans le secteur |
| Archivage d'un défi | 6 mois après clôture |
| Modification d'un défi | seulement en BROUILLON ou EN_REVISION |
| Performance | pages < 2 s (P95), API < 300 ms (P95), matching < 5 s |
| Couverture de tests | > 70 % services core, 90 % flux critiques |

---

## 2. Décisions à prendre par le commanditaire

Chaque ligne a une **recommandation par défaut** : si vous validez ce dossier sans commentaire, c'est elle qui s'applique.

| # | Sujet | Pourquoi c'est un point de décision | Recommandation par défaut |
|---|---|---|---|
| **D1** | **Logo officiel** | Trois visuels différents sont dans le dossier : (a) le logo de la charte (N bleu/violet avec arc, mot-symbole NEXBRIDGE navy/bleu), (b) `Logo_NEXBRIDGE.jpeg` (N « low-poly » violet avec pont, fond cyan), (c) `Logo_NEXBRIDGE_mobile.jpeg` (ruban abstrait bleu/violet/cyan, ne forme pas un N lisible). Ils ne sont pas cohérents entre eux. | Le **logo de la charte graphique** est l'officiel (il contient le slogan, l'icône d'app et les couleurs de la palette). Je le détoure depuis le PNG de la charte ; (b) et (c) ne sont pas utilisés. **Un fichier vectoriel (SVG) du logo est nécessaire** pour un rendu net partout. |
| **D2** | **Séquestre, paiement des étudiants, portefeuille** | Détenir des fonds pour compte de tiers, les reverser aux étudiants et proposer un « portefeuille rechargeable » relève de la monnaie électronique / services de paiement (BCEAO, agrément ou PSP agréé). Rémunérer des étudiants pose aussi la question du statut (stage, prestation, fiscalité). Vous l'avez dit vous-même : faisabilité à valider. | Je construis le **modèle de données et les interfaces** (Escrow, Transaction, Invoice, Refund, Commission) mais **aucun fonds n'est jamais simulé**. Tant qu'un prestataire n'est pas contractualisé, l'UI affiche « Paiement non configuré » ; seuls **Stripe en mode test** et le **virement bancaire avec rapprochement manuel par l'admin** (flux réels, non simulés) sont activables. Portefeuille NEXBRIDGE : **hors MVP**. |
| **D3** | **Simplification de la pile** | Le CDC prévoit microservices + PostgreSQL + MongoDB + Elasticsearch + RabbitMQ + Redis + Kubernetes. Votre brief demande d'« éviter les technologies inutiles ». | **Monolithe modulaire** Node/Express/TS + PostgreSQL (JSONB pour les profils, recherche plein texte `pg_trgm`/`tsvector`) + Redis (queues BullMQ, sessions, rate-limit) + **un seul service séparé : l'IA (FastAPI)**. MongoDB, Elasticsearch, RabbitMQ et Kubernetes sont retirés du MVP ; les modules gardent des frontières nettes pour une extraction ultérieure. Détail et argumentaire dans le document 2. |
| **D4** | **Landing page : intégrée ou site vitrine séparé ?** | Le CDC (§7.3) dit « landing hors scope dev produit — site vitrine séparé » ; votre brief demande une landing connectée à l'app (inscription, connexion, marketplace publique). | **Même dépôt, même design system**, routes publiques pré-rendues au build pour le référencement. Si le SEO devient critique, on isole la landing (Astro) sans toucher à l'app. |
| **D5** | **Hébergement et résidence des données** | Loi sénégalaise (CDP) + RGPD : le transfert hors du Sénégal demande des garanties. Le CDC cite AWS (région Afrique du Sud ou Europe) ; vous utilisez aussi Cloudflare. | Dev/staging sur un hébergement simple ; production : **AWS (af-south-1 ou eu-west-3) ou équivalent**, décision finale avec votre conseil juridique. Option Cloudflare Pages pour le front/CDN. |
| **D6** | **Langues** | CDC : FR + EN dès le MVP… mais backlog F-035 « support EN » en v2. Brief : FR au lancement. | **FR au lancement**, i18n (i18next) en place : tout le texte passe par des clés de traduction, l'EN s'ajoute sans refonte. |
| **D7** | **Propriété intellectuelle, confidentialité, convention** | Le CDC ne dit rien sur qui possède les livrables, ni sur les NDA / conventions de stage ou de projet, alors que des entreprises exposent des problèmes stratégiques à des étudiants. | Case d'acceptation obligatoire des CGU + « charte du projet » (confidentialité, cession de droits à définir) à l'entrée dans un projet. **Le contenu juridique est à fournir par vous / votre conseil** ; je prévois l'emplacement et l'horodatage de l'acceptation. Signature électronique : v2 (F-036). |
| **D8** | **Commission** | « 15 à 20 % » : fixe ? par palier ? à la charge de qui (déduite du budget étudiant ou ajoutée au prix entreprise) ? | Règle configurable en base (`CommissionRule`, bornée 15–20 %) modifiable par le Super Admin ; valeur initiale 15 %, **déduite du budget** comme décrit au CDC. |
| **D9** | **Comptes et clés d'API externes** | Stripe, Orange Money, Wave, Free Money (contrats marchands), Google/LinkedIn OAuth, SendGrid, AWS S3, Firebase… | À créer par vous. Chaque intégration est derrière une interface avec un **mode « non configuré / démonstration » clairement affiché** ; rien ne casse sans clé. |
| **D10** | **« Taux d'insertion » du dashboard référent** | Le CDC l'affiche (% d'étudiants ayant reçu une offre ou été recrutés via NEXBRIDGE) mais aucune fonctionnalité ne capture ces données. | J'ajoute une **déclaration d'offre / recrutement** (entreprise → étudiant, confirmée par l'étudiant) pour alimenter l'indicateur avec des données réelles. Sans elle, l'indicateur affiche « donnée non disponible ». |

---

## 3. Incohérences du CDC que je tranche (sauf objection)

| # | Constat | Décision retenue |
|---|---|---|
| I1 | **Statuts d'un défi** : §3.2.2 « Brouillon → En révision → Publié → En cours → Clôturé » ; §3.2.3 kanban « Ouvert / En cours / Clôturé / Archivé » ; brief ajoute « Archivé ». | Une seule machine à états : `BROUILLON → EN_REVISION → PUBLIE → EN_COURS → CLOTURE → ARCHIVE`, plus la branche `EN_REVISION → BROUILLON` (refus avec motif). Le libellé « Ouvert » = `PUBLIE`. |
| I2 | **Niveaux de compétence** : §3.1.3 « Débutant/Intermédiaire/Avancé/Expert » vs §3.5.1 « Sensibilisé/Praticien/Confirmé/Expert ». | **Une seule échelle** : Sensibilisé · Praticien · Confirmé · Expert (celle de NexBadge). |
| I3 | **« NexScore » a trois sens** : réputation entreprise (§3.1.2), score d'appariement équipe/défi (§3.3 et glossaire), évolution du score étudiant (§3.6.2). | `NexScore` = **score d'appariement** (glossaire). Réputation entreprise → **Indice de confiance**. Évolution étudiante → **Indice de fiabilité**. |
| I4 | **Jitsi** : « MVP » dans le tableau des intégrations (§9) mais F-025 « visio intégrée » en v2 ; brief : phase 5. | MVP : champ `lien de visioconférence` + **génération d'un lien de salle Jitsi** à la création d'une réunion. Intégration embarquée dans la page : phase 5. |
| I5 | **Matching v1** : l'algorithme §3.3.1 décrit déjà des embeddings NLP, mais le backlog sépare F-008 « scoring compétences » (MVP) de F-026 « embeddings + diversité » (v2). | v1 = **moteur de règles pondérées** (compétences, niveau, filière, disponibilité, secteur, historique, diversité, surcharge) ; interface `MatchingEngine` prête à brancher le service FastAPI (v2). |
| I6 | **Ordre des paiements** : CDC place le séquestre en S5 (MVP, critique) ; votre brief place les paiements en phase 5, après le reste. | On suit votre brief. Le **modèle de données et les points d'accroche** (déclencheurs « équipe validée » et « livrable validé ») sont posés dès la phase 2 pour ne rien refaire. |
| I7 | **Mobile** : « Web + Mobile » par rôle, mais application native = v2 (F-023). | Web responsive uniquement ; pas de push FCM ni de mode hors-ligne dans le MVP. Notifications : in-app + e-mail (+ push web optionnel plus tard). |
| I8 | **Vérification e-mail** « obligatoire avant accès complet » : « complet » n'est pas défini. | Avant vérification : accès au profil et à la marketplace en lecture seule. Après : candidature, dépôt de défi, NexSpace. |
| I9 | **Éléments évoqués dans les deux documents mais classés v2 par le CDC** : Gantt, wiki projet, abonnements SaaS. Votre brief n'en parle pas pour le MVP (sauf « gérer les abonnements » au back-office). | Gantt et wiki : non développés, signalés dans l'UI par « Bientôt disponible » (les dépendances entre tâches sont déjà prévues en base). Abonnements : modèle de données prévu, activation en phase 5. |
| I10 | **Chiffres de la landing** : le brief exige qu'ils soient réels ou clairement présentés comme exemples. | Les compteurs sont **calculés depuis la base** ; tant qu'elle est vide ils sont masqués. Les témoignages, partenaires et FAQ sont **administrables** (back-office), jamais codés en dur. |

---

## 4. Dépendances techniques et prérequis

### 4.1 Environnement de cette machine (vérifié)
| Outil | État |
|---|---|
| Node.js / npm / pnpm | **absents** |
| PostgreSQL | **absent** |
| Redis | **absent** |
| Docker | **absent** |
| Git | présent (le dossier n'est pas encore un dépôt) |
| Python 3 | présent (système) |
| Wrangler (Cloudflare) | **non installé** : l'installation Homebrew lancée plus tôt a dépassé 10 min puis a été interrompue |

**Action avant la Phase 1** : installer Node 20 LTS, pnpm, PostgreSQL 16 et Redis. Je préfère des installations légères et rapides (Node via `fnm`, PostgreSQL via Postgres.app ou Homebrew, Redis via Homebrew) plutôt que Docker Desktop. Je lancerai ces installations moi-même, étape par étape, après votre feu vert.

### 4.2 Dépendances entre modules
```
M1 Auth/Profils ─┬─► M2 NexBrief ─► M3 NexMatch ─► M4 NexSpace ─┬─► M5 NexBadge
                 │                                              ├─► M6 NexDash (lit tout)
                 └─► M8 Back-office (valide M1 KYC, M2 briefs)  └─► M7 Paiement (déclencheurs)
Transversal : Notifications (événements), Audit (journal), Fichiers (S3/local), i18n
```
Le back-office est donc **livré par morceaux** dès la phase 2 (file de validation des briefs, KYC) puis complété en phase 4.

### 4.3 Références visuelles : à ne pas copier
- `Landing Page.jpeg` est une maquette d'une autre marque (« Nexus »), avec des logos Spotify, Slack, Dropbox, Zoom et la mention « Trusted by 2000 companies ». **Rien de tout cela n'apparaîtra** sur NEXBRIDGE (ni logos tiers, ni chiffres inventés). Je m'en inspire pour la structure : navigation en pastille, héros sombre avec visuel à droite, double CTA.
- `Interface.jpeg` est une maquette d'outil de gestion de projet (« Scopeboard ») : kanban à colonnes, étiquettes de priorité colorées, barre de progression, pile d'avatars. Inspiration d'ergonomie pour NexSpace, **sans reproduction à l'identique**.

---

## 5. Ce que je m'interdis (conformément à votre brief)
- Simuler une transaction réelle ou présenter des fonds fictifs comme réels.
- Afficher des statistiques inventées comme des données réelles.
- Laisser une page inachevée sans mention explicite (« Bientôt disponible »).
- Mettre des données de démonstration en production : le script de seed refuse de s'exécuter si `NODE_ENV=production`, et les environnements de démo affichent un bandeau permanent « Données de démonstration ».

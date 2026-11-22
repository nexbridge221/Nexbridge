# NEXBRIDGE — Connect. Innovate. Transform.

Plateforme d'innovation ouverte et d'apprentissage par projet (entreprises · étudiants · établissements · experts).
Le dossier de conception est dans [`docs/`](docs/). **État : Phases 1 (fondations), 2 (NexBrief, NexMatch, équipes), 3 (NexSpace) et 4 (pilotage) livrées ; Phase 5 (intégrations) partiellement livrée** — voir « État d'avancement ».

## Prérequis
| Outil | Version | Remarque |
|---|---|---|
| Node.js | 24 LTS | le CDC mentionnait Node 20, désormais en fin de vie |
| pnpm | ≥ 10 | `npm i -g pnpm` |
| PostgreSQL | 16 | |
| Redis | 7+ | blacklist de jetons ; l'API démarre sans (dégradation signalée dans les logs) |

Sur la machine de développement actuelle, ces outils sont installés **sans droits administrateur** dans `~/.nexbridge/tools/` ;
`source scripts/env.sh` les ajoute au `PATH`.

## Démarrage rapide
```bash
source scripts/env.sh                 # PATH vers node, PostgreSQL, Redis (machine de dev actuelle)
pnpm install
cp .env.example .env                  # puis adapter si besoin
pnpm services:start                   # PostgreSQL (port 5433) + Redis (port 6380), données dans .nexbridge-local/
pnpm --filter @nexbridge/api db:migrate   # applique les migrations
pnpm db:seed                          # référentiels + données de DÉMONSTRATION (si DEMO_MODE=true)
pnpm dev                              # API http://localhost:4000 · Web http://localhost:5173
```
Les comptes de démonstration (mots de passe générés aléatoirement) sont écrits dans `.nexbridge-local/demo-accounts.txt` (ignoré par Git).
Les e-mails ne sont **pas envoyés** tant que `SENDGRID_API_KEY` est vide : ils sont déposés dans `.nexbridge-local/outbox/` (liens de vérification, réinitialisation…).

## Commandes
| Commande | Rôle |
|---|---|
| `pnpm dev` | API + front en mode développement |
| `pnpm typecheck` | TypeScript strict sur les 3 paquets |
| `pnpm test` | tests (Jest + Supertest) sur la base `nexbridge_test` |
| `pnpm --filter @nexbridge/web build` | build de production du front |
| `pnpm services:start / stop / status` | PostgreSQL + Redis locaux |

## Structure
```
apps/api        API Express + Prisma (schéma : apps/api/prisma/schema.prisma)
apps/web        React + Vite + Tailwind (landing, authentification, application)
packages/shared schémas Zod, énumérations et matrice de permissions (RBAC) partagés API/UI
scripts/        env.sh, services.sh
docs/           dossier de conception (étape 1)
```

## Variables d'environnement
Toutes documentées dans [`.env.example`](.env.example). Points d'attention :
- **Production** : `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` (RS256), `ENCRYPTION_KEY` (AES-256, `openssl rand -base64 32`) et `COOKIE_SECURE=true` sont **obligatoires** ; `DEMO_MODE=true` est **refusé** (l'API ne démarre pas, le seed non plus).
- En développement, les clés JWT et la clé de chiffrement sont générées une fois dans `.nexbridge-local/keys/` (ignoré par Git).
- Réseaux sociaux du pied de page : `VITE_SOCIAL_LINKEDIN`, `VITE_SOCIAL_FACEBOOK`, `VITE_SOCIAL_X`, `VITE_SOCIAL_INSTAGRAM`, `VITE_SOCIAL_YOUTUBE` (un lien n'est affiché que s'il est renseigné).

## État d'avancement

### Phase 5 — Intégrations (partielle)
**Fait (106 tests d'API, dont 8 pour les paiements et les intégrations)**
- **Paiements — registre du séquestre, sans aucun flux d'argent simulé.** NEXBRIDGE n'exécute aucun virement. L'entreprise voit budget + commission (15–20 %, taux du Super Admin) et la référence à indiquer, puis **déclare** son virement ; un administrateur **constate** le dépôt sur le relevé bancaire (ou rejette), puis **enregistre** la libération (projet terminé uniquement) ou le remboursement. Registre `PaymentEvent`, notifications et journal d'audit. Coordonnées bancaires saisies par le Super Admin. Vérifié dans le navigateur : onglet « Paiement » entreprise et déclaration ; le reste du parcours est couvert par les tests d'API.
- **Stripe (carte)** : création de session Checkout et webhook à signature vérifiée et idempotent, **actifs seulement si `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` sont fournis**. Le webhook est testé avec une signature simulée localement ; **aucun appel réel à Stripe n'a été fait**.
- **Stockage S3** (AWS, R2, MinIO via `S3_ENDPOINT`) : adaptateur écrit, **non testé** faute de compartiment.
- **Visioconférence** : salle Jitsi Meet intégrée à la page « Réunions » (chargée au clic seulement).
- **Connexion Google / LinkedIn** (OpenID Connect, PKCE, état anti-CSRF) : réservée aux **comptes existants** dont l'e-mail est confirmé par le fournisseur, refusée si la double authentification est active. **Non testée contre les vrais fournisseurs.** La création de compte par OAuth n'est pas faite.
- **Tâches de fond** : file BullMQ (Redis) pour les échéances d'équipe, avec repli sur un minuteur sans Redis. Vérifiée au démarrage de l'API.
- **État des intégrations** dans Configuration (Super Admin) : actif / non configuré, sans jamais afficher de secret.

**Pas fait dans cette passe**
- Mobile Money (Orange Money, Wave) ; IA avancée (service FastAPI, embeddings) ; intégrations académiques (Moodle) ; notifications push/SMS. L'envoi réel d'e-mails (SendGrid) existe mais n'a jamais été exécuté faute de clé.
- Réserves de la Phase 4 traitées ensuite (voir « Correctifs après Phase 5 ») ; Playwright et la migration zod 4 restent à faire.
- Pas de téléversement en flux vers S3 (fichiers en mémoire, jusqu'à 200 Mo).

### Phase 4 — Pilotage : évaluations, NexBadge, NexDash, back-office (livrée, avec réserves)
**Fait (98 tests d'API)**
- **Clôture et évaluations** : le mentor ou l'entreprise clôture le projet (tous les livrables validés) → phase « En évaluation ». Six types d'évaluation (entreprise→projet, entreprise→étudiant, mentor→étudiant, expérience étudiant, pair anonyme et étudiant→mentor, ces deux derniers facultatifs) avec compétences démontrées. Le projet passe à « Terminé » seulement quand toutes les évaluations requises et les validations académiques sont décidées.
- **NexBadge** : à la clôture, badges de compétence, certification (3 projets), excellence (top performer > 4,5, innovateur, leader), sectoriels, indice de fiabilité, attestation PDF avec code de vérification, badges au format Open Badges v2 (destinataire haché). Portfolio public opt-in (`/portfolio/:slug`) et page de vérification (`/verifier/:code`).
- **Référent académique** : validation des crédits, cohortes, liste des étudiants, exports CSV et rapport pédagogique PDF.
- **NexDash** : tableaux de bord réels par rôle (entreprise, étudiant, mentor, admin). Une valeur indisponible s'affiche « — », jamais inventée. Le chiffre d'affaires reste « non disponible » (paiements en phase 5).
- **Back-office** : utilisateurs (suspension, promotion/rétrogradation réservée au Super Admin), référentiel de compétences (ajout, désactivation, fusion), badges, modération des évaluations et signalements, contenus du site (témoignages, partenaires, FAQ, messages de contact), journal d'audit et configuration (commission 15–20 %, pondérations NexMatch) réservés au Super Admin, exports CSV journalisés.

**Limites connues de la Phase 4**
- Parcours vérifiés dans le navigateur : pages du back-office, tableau de bord admin, clôture de projet, dépôt d'une évaluation (mentor). **Non rejoués dans le navigateur** (couverts par les tests d'API seulement) : évaluations entreprise/étudiant, écran Badges, portfolio public, vérification d'attestation, validation de crédits par le référent, cohortes, signalement.
- Le bouton « Signaler » a été ajouté ensuite (défi et projet).
- Les routes `/app/admin/*` ne sont pas masquées côté interface pour les autres rôles : seule l'API refuse l'accès (403) ; à corriger.
- Accessibilité : audit axe exécuté ensuite (voir « Correctifs après Phase 5 »). Tests Playwright non écrits.
- `pnpm audit` : une alerte haute restante sur `zod` 3.x (consommation mémoire sur collections très grandes) ; le correctif impose la migration vers zod 4, à planifier. L'alerte `effect` est corrigée par une surcharge de version.
- Performance : JavaScript initial ≈ 160 Ko gzip, au-dessus de l'objectif 3G ; découpage supplémentaire à faire.
- Un projet sans aucun livrable officiel ne peut plus être clôturé (code `NO_DELIVERABLES`).

### Phase 3 — NexSpace (livrée)
**Fait (80 tests d'API ; Kanban, tâches, messagerie en temps réel et calendrier vérifiés dans le navigateur)**
- **Espace projet** créé au lancement : jalons et livrables repris du brief, canal de discussion général, fil d'activité. Droits dérivés de l'appartenance au projet : un étranger reçoit 404 partout ; l'admin et le référent (si un de ses étudiants est membre) sont en **lecture seule** ; l'entreprise commente mais ne modifie pas les tâches ; la messagerie est réservée aux membres.
- **Tâches** : Kanban (glisser-déposer à la souris **et au clavier**, mise à jour optimiste, ordre par insertion entre deux cartes), liste triable/filtrable avec export CSV, **calendrier** mois/semaine/jour (tâches, réunions, jalons, livrables), fiche détaillée (sous-tâches sur un niveau, commentaires, étiquettes, pièces jointes, historique des modifications), progression calculée côté serveur.
- **Jalons** avec règle de validation du projet (mentor / entreprise / les deux) ; statut calculé (Prêt, Manqué).
- **Documents** : dossiers, dépôt par glisser-déposer, **contrôle du type réel du fichier**, versions (3 conservées), visibilité par document (tous / équipe et mentor / équipe seule), aperçu PDF-image-vidéo, droits revérifiés à chaque téléchargement.
- **Messagerie** : canal général, canaux thématiques, messages directs privés, fils de réponses, @mentions notifiées, réactions, fichiers (≤ 25 Mo), non lus, **temps réel** (Socket.IO, repli par interrogation périodique).
- **Livrables** : workflow à 6 états avec double validation (équipe → mentor → entreprise), historique des relectures et versions.
- **Réunions** (lien Jitsi généré, réponses, compte rendu, export .ics), **espace mentor** (santé des projets, alertes, rapports hebdomadaires à visibilité réglable).

**Limites connues de la Phase 3**
- Non vérifiés visuellement dans le navigateur (couverts par les tests d'API seulement) : écrans Jalons, Documents (dépôt), Livrables, Réunions, Rapports et espace mentor.
- Dépôt de fichiers en mémoire (jusqu'à 200 Mo pour une vidéo) : à remplacer par un flux vers S3 en production ; antivirus non configuré (statut « non analysé »).
- Hors périmètre MVP : Gantt et wiki (v2), visioconférence embarquée (phase 5), évaluation finale (phase 4). Modification d'un message : seul l'indicateur « modifié » est conservé.
- Pas de test automatisé du temps réel (Socket.IO) ni de Playwright.

### Phase 2 — NexBrief, marketplace, candidatures, NexMatch, équipes (livrée)
**Fait et vérifié (59 tests d'API ; parcours complet rejoué dans le navigateur avec les comptes de démonstration)**
- **NexBrief** : assistant en 5 étapes avec enregistrement automatique, 10 modèles sectoriels, contrôle de complétude avant envoi (y compris refus des passages d'aide non remplacés), soumission réservée aux organisations validées, historique des statuts, retrait de la file, clôture motivée d'un défi publié.
- **Back-office (partiel)** : file de validation des défis (critères + motif de refus obligatoire), validation des organisations (KYC, identifiants déchiffrés pour l'admin uniquement), validation des établissements, affectation des mentors (plafond de projets simultanés respecté), indicateurs réels.
- **Candidatures** libres (une par défi), invitations d'équipe, notifications in-app + e-mail (boîte de développement).
- **NexMatch v1** : scoring par règles (compétences 50 %, formation 15 %, disponibilité 10 %, secteur 10 %, historique 15 % ; pénalité de surcharge −30 % ; bonus de diversité ≥ 3 filières), 3 équipes distinctes classées par score, avec explications dérivées des sous-scores ; mode manuel ; traçabilité (`MatchRun` : version du moteur, pondérations). Calcul < 100 ms sur le jeu de démonstration, < 5 s sur 300 candidats (testé).
- **Validation d'équipe** : entreprise → étudiants (72 h, relance toutes les 24 h, remplacement automatique par le suivant du classement) → référent académique (seulement si son établissement est validé) → lancement : projet créé, membres et rôles, défi « En cours ».
- **Point d'accroche paiement** : un `Escrow` « non déposé » est créé avec le projet. **Aucun flux d'argent, aucune transaction.**

**Limites connues de la Phase 2**
- Les échéances d'équipe sont traitées par un minuteur (toutes les 10 min) dans le processus API ; passage à une file BullMQ avec worker dédié prévu.
- Les évaluations n'existant pas encore, l'« historique » du matching ne contient que le nombre de projets terminés (neutre = 60/100 sans historique) : aucune note n'est inventée.
- Pondérations de NexMatch modifiables en base (`SystemSetting`, clé `nexmatch.weights`) mais sans écran de configuration (Super Admin, phase 4).
- Clôture d'un projet en cours, évaluations, remboursements : phases 3 à 5. Gestion des utilisateurs, compétences/badges, journal d'audit côté back-office : phase 4.
- Tests E2E Playwright et accessibilité automatisée (axe) toujours à écrire ; le parcours a été vérifié manuellement.

### Phase 1 — fondations (livrée)
**Fait et vérifié**
- Landing page complète (sections 4.1 → 4.10 du brief), pages thématiques, marketplace publique (filtres, détail), formulaires contact / newsletter (double opt-in) enregistrés en base.
- Authentification : inscription multi-rôles, vérification e-mail, mot de passe oublié (1 h), JWT RS256 15 min + refresh rotatif en cookie HttpOnly avec détection de réutilisation, blocage après 5 échecs, 2FA TOTP, anti-énumération de comptes, RBAC (matrice partagée API/UI).
- Profils des 4 rôles, onboarding guidé, KYC entreprise (identifiants chiffrés, dépôt de pièces contrôlé par contenu), collaborateurs, notifications in-app, préférences, export des données et suppression (anonymisation).
- Design system (jetons de la charte, composants accessibles), i18n (français ; l'anglais s'ajoute par fichiers de traduction).

**Volontairement non actif (affiché « Bientôt disponible », jamais simulé)**
- Connexion Google / LinkedIn : boutons présents, « Non configuré » tant que les identifiants OAuth ne sont pas fournis ; le flux OAuth lui-même sera branché avec eux.
- Envoi réel d'e-mails (SendGrid), antivirus de fichiers (statut « non analysé »), CAPTCHA, stockage S3.
- NexSpace, NexBadge, NexDash, back-office complet, paiements : phases 3 à 5 (voir `docs/04-plan-de-developpement.md`).

**Écarts connus (à traiter en phase 4)**
- Poids du JavaScript initial ≈ 155 Ko gzip (+ chunks) : au-dessus de l'objectif « < 2 s en 3G » ; découpage et allègement à faire.
- Tests Playwright (E2E) et axe (accessibilité) non encore écrits ; le parcours a été vérifié manuellement dans le navigateur.
- Logo : version raster extraite de la charte (source vectorielle SVG à fournir).
- Pages juridiques : modèles provisoires à compléter par l'éditeur et son conseil.

### Correctifs après Phase 5
- **Routes admin** : `/app/admin/*` renvoie vers le tableau de bord pour tout rôle autre qu'Admin ; audit et configuration réservés au Super Admin (l'API reste l'autorité). Vérifié dans le navigateur avec un compte étudiant.
- **Signalement** : bouton « Signaler » (motif de 10 caractères minimum) sur la fiche d'un défi et dans l'espace projet, traité dans la modération. Testé côté API ; la fenêtre du navigateur n'a pas permis de rejouer le clic.
- **Clôture** : refusée si le projet n'a aucun livrable officiel.
- **Accessibilité** : axe-core 4 (WCAG 2.1 A/AA, installé en dev) exécuté dans le navigateur sur les pages publiques et les principales pages connectées (admin, défis, projets, profil). Trois défauts corrigés (nom du menu de compte, liste de définitions du tableau de bord, tableau d'audit non atteignable au clavier) ; 0 violation ensuite. Non audités : espace projet détaillé, pages étudiant/mentor/référent, thème mobile.
- **Responsive** : logo d'en-tête réduit sous 640 px (icône et texte), logo ajouté dans la barre mobile de la plateforme, boutons à texte long qui passent à la ligne, grilles à colonne unique explicite (plus d'élargissement par le contenu), onglets défilables, radar adaptatif, menu des notifications borné à la largeur de l'écran. Contrôle automatisé de débordement horizontal à 320 px (pages publiques, étudiant, espace projet, back-office) et à 768 px : aucun débordement. Contrôle visuel limité à 320, 375, 768 et 1100 px sur quelques pages ; pas de test sur appareils réels.
- **Responsive, suite** : cartes de statistiques sur deux colonnes sur mobile (tableaux de bord, pilotage admin, référent, liste des défis, aperçu projet), la dernière carte impaire occupant toute la largeur ; bouton d'inscription (ou « Mon espace ») à côté du menu entre 640 et 1023 px ; liste des défis (entreprise) et tableau des étudiants (référent) affichés en cartes sur mobile ; barre de progression du projet sans retour à la ligne. Examen visuel à 360 px des pages entreprise, mentor et référent (tableau de bord, défis, projet, suivi, étudiants) ; les autres onglets du référent (cohortes, crédits, rapports) et les formulaires n'ont été contrôlés que par détection de débordement.

### Console d'administration (utilisateurs, défis, projets)
- **Utilisateurs** (`/app/admin/utilisateurs`) : modifier le profil (nom, e-mail, téléphone), suspendre/réactiver, envoyer un lien de réinitialisation du mot de passe (jamais vu par l'admin), supprimer = **anonymiser** (droit à l'oubli, irréversible), et pour le Super Admin : promouvoir/rétrograder et **créer un administrateur** (il choisit son mot de passe via un e-mail). Garde-fous : on ne peut pas se modifier soi-même, un admin ne touche pas aux autres admins, un Super Admin ne peut pas être supprimé, le rôle d'un compte métier n'est pas convertible.
- **Défis** (`/app/admin/defis`, « Gestion des défis ») : tous les statuts + recherche ; modifier les champs principaux (titre, contexte, objectifs, équipe, durée, budget), **publier** (brouillon/archivé), **dépublier** (motif obligatoire, l'entreprise est prévenue), **supprimer** (refusé tant qu'un projet est lié). La file « à valider » avec checklist reste en place. L'édition des compétences, livrables et jalons n'est pas dans l'écran admin.
- **Projets** (`/app/admin/projets`, « Gestion des projets ») : modifier nom, description, dates, statut (Planifié, En cours, En pause, Annulé ; le statut d'un projet en évaluation ou terminé est verrouillé), affecter un mentor, **supprimer** (cascade tâches/documents/messages/livrables ; le défi est archivé ; **refusé** si le séquestre a été mouvementé ou si des attestations/badges existent : annuler à la place). Les membres sont prévenus.
- Toutes ces actions sont journalisées (audit) et couvertes par 6 tests d'API ; l'interface a été vérifiée dans le navigateur (ouverture des écrans et des fenêtres de modification), sans exécuter de suppression réelle sur les données de démonstration.
- Les projets n'ont pas de notion de « publication » : « publier » s'applique aux défis.

### Déploiement
Site sur Cloudflare Pages, API + PostgreSQL + Redis sur Render : voir `docs/05-deploiement-cloudflare.md` (fichiers : `render.yaml`, `apps/api/Dockerfile`, `apps/web/functions/`, `apps/web/wrangler.toml`). Non déployé à ce jour ; l image Docker n a pas pu être construite localement (Docker absent).

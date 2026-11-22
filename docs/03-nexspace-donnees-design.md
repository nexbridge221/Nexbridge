# NEXBRIDGE — Dossier de conception · Étape 1
## Document 3/4 — NexSpace (conception détaillée), base de données, design system

---

# A. NexSpace — conception détaillée

NexSpace est le cœur opérationnel. Un **espace est créé automatiquement** au lancement officiel d'un projet (équipe validée) ; l'accès est dérivé de la table `ProjectMember`.

## A.1 Principes
1. **Une source de vérité pour les droits** : `ProjectMember(projectId, userId, projectRole)`. Aucun accès à un projet sans ligne dans cette table (hors Admin en lecture).
2. **Tout changement produit un événement** (`ActivityEvent`) qui alimente le fil d'activité, les notifications, les indicateurs et les alertes : une seule écriture, plusieurs consommateurs.
3. **Interface optimiste** : un déplacement de carte s'affiche immédiatement, l'API confirme ou annule (message d'erreur clair, carte remise à sa place).
4. **Pas d'écran blanc** : squelettes de chargement partout, pagination par curseur, état vide explicite avec action.
5. **Accessible au clavier** : déplacement d'une carte au clavier (dnd-kit), annonces pour lecteur d'écran, focus géré dans les panneaux.

## A.2 Rôles dans un projet et permissions
| Action | Entreprise | Chef de projet (étudiant) | Étudiant | Mentor | Référent | Admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Voir tout l'espace | ✔ | ✔ | ✔ | ✔ | ✔ (lecture) | ✔ (lecture) |
| Créer / modifier / déplacer des tâches | commenter seulement | ✔ | ✔ (les siennes + non assignées) | ✔ | – | – |
| Supprimer une tâche | – | ✔ | créateur seulement | ✔ | – | – |
| Définir jalons | proposer | ✔ | – | ✔ | – | – |
| Valider un jalon | selon règle du projet | – | – | selon règle du projet | – | – |
| Déposer des documents | ✔ | ✔ | ✔ | ✔ | – | – |
| Soumettre un livrable | – | ✔ | ✔ (responsable) | – | – | – |
| Approuver un livrable (étape mentor) | – | – | – | ✔ | – | – |
| Valider un livrable (étape entreprise) | ✔ | – | – | – | – | – |
| Écrire dans le chat | ✔ | ✔ | ✔ | ✔ | canaux ouverts | – |
| Planifier une réunion | ✔ | ✔ | ✔ | ✔ | – | – |
| Rapport hebdomadaire | lecture | lecture | – | ✔ rédige | lecture | lecture |
| Évaluations de fin de projet | ✔ | ✔ | ✔ | ✔ | lecture | modération |

La **règle de validation des jalons** est un paramètre du projet : `MENTOR`, `ENTREPRISE` ou `LES_DEUX` (CDC : « selon les règles du projet »).

## A.3 Vue générale (`/apercu`)
Nom, description, entreprise commanditaire, équipe (avatars), chef de projet, mentor, dates (début, fin prévue), statut, budget, **progression globale**, prochaine échéance, dernière activité.
**Progression** = `tâches de premier niveau terminées / tâches de premier niveau` (les sous-tâches alimentent la barre de la carte mais pas la progression globale). Calculée côté serveur, mise en cache dans `Project.progressPct` et recalculée à chaque changement de statut.
**Tâche en retard** = `dueDate < maintenant` ET `statut ≠ TERMINE`.

## A.4 Tableau de bord du projet (`/tableau-de-bord`)
Cartes : progression · à faire / en cours / en révision / terminées · en retard · jalons à venir (3) · derniers messages (5) · derniers documents (5) · activité récente (10) · alertes.
**Modes d'affichage** : cartes synthétiques, ou liste dense ; widgets repliables ; préférence mémorisée par utilisateur.
**Alertes** (job quotidien) : aucune activité depuis 7 jours · jalon manqué · plus de 30 % de tâches en retard · livrable en retard · membre inactif. Chaque alerte a un niveau (info / attention / critique) et remonte aussi au mentor.

## A.5 Kanban (`/taches?vue=kanban`)
- **Colonnes** : À faire · En cours · En révision · Terminé (statuts fixes en base ; libellés et ordre configurables ensuite, cf. CDC « colonnes configurables »).
- **Carte** : titre, priorité (étiquette colorée), assignés (avatars), échéance (rouge si en retard), compteur de sous-tâches, pièces jointes, commentaires, étiquettes.
- **Actions** : créer (rapide en bas de colonne ou formulaire complet), modifier, **supprimer avec confirmation**, glisser-déposer entre colonnes et dans une colonne, assigner à un ou plusieurs membres.
- **Ordre** : champ `position` de type *rang lexicographique* (fractional indexing) : déplacer une carte ne modifie qu'une seule ligne, sans renumérotation, et supporte les mouvements simultanés.
- **Fiche de tâche** (panneau latéral au clic) : description riche (Markdown simplifié) · priorité (Basse, Normale, Haute, Urgente) · dates de début et d'échéance · responsables · étiquettes · **sous-tâches** (cases à cocher, un niveau) · **pièces jointes** (via la bibliothèque documentaire, mêmes contrôles) · **commentaires** avec @mentions · **historique des modifications** (champ, ancienne valeur, nouvelle valeur, auteur, date) · jalon associé.
- **Filtres** persistants : responsable, priorité, étiquette, échéance, texte.
- **Règle** : passer une tâche à *Terminé* renseigne `completedAt` ; la remettre en arrière l'efface. Une tâche *En révision* notifie les relecteurs (mentor, chef de projet).

## A.6 Vue Liste
Colonnes : tâche · responsable · statut · priorité · début · échéance · progression (sous-tâches) · dernière modification. Tri sur toutes les colonnes, filtres (responsable, statut, priorité, échéance), édition en ligne du statut et de l'échéance, export CSV. Même jeu de données que le Kanban (une seule requête, deux présentations).

## A.7 Calendrier
Vues **mois / semaine / jour** ; affiche échéances de tâches, réunions, jalons, dates clés (début, fin prévue). Code couleur par type, clic = ouverture de l'élément, glisser une échéance pour la déplacer. Implémentation légère maison (date-fns) plutôt qu'une bibliothèque lourde, pour tenir le budget de 3G. Fuseau horaire : Africa/Dakar par défaut, stockage en UTC.

## A.8 Jalons
Titre · description · date cible · tâches associées · responsable · statut · livrable attendu.
**Statuts** : À venir → En cours → Prêt pour validation → **Validé** (ou **Manqué** si la date passe sans validation).
Un jalon passe en « Prêt pour validation » quand toutes ses tâches sont terminées et son livrable (s'il existe) est approuvé ; la validation suit la règle du projet (A.2) et déclenche notification + entrée d'activité.

## A.9 Bibliothèque documentaire
- Dossiers imbriqués ; dépôt par glisser-déposer ; **téléchargement par URL signée** après contrôle de droits.
- **Formats** : PDF, Word, Excel, PowerPoint, PNG/JPG, MP4 (< 200 Mo), ZIP. Contrôle par contenu (pas seulement l'extension), plafond de taille par type, nom de stockage aléatoire, analyse antivirus.
- **Aperçu** intégré pour PDF, images, vidéo ; pour Office : téléchargement (aperçu Office : v2, dépend d'un service tiers).
- **Versions** : une nouvelle version d'un même nom s'ajoute ; **les 3 dernières sont conservées** (les plus anciennes sont supprimées par un job), avec auteur, date, taille, empreinte SHA-256.
- **Droits par dossier ou document** : `TOUS` (y compris entreprise) · `EQUIPE_ET_MENTOR` · `EQUIPE_SEULE`. Le référent académique suit la visibilité `TOUS`.

## A.10 Messagerie collaborative
- **Canaux** : `#général` (créé automatiquement), canaux thématiques optionnels, **messages directs** entre membres.
- **Fonctions** : réponses (fil), **@mentions** (notification ciblée), partage de fichiers (≤ 25 Mo, mêmes contrôles), **emojis** (sélecteur + réactions), horodatage, modification/suppression de son message (trace conservée), historique paginé.
- **Non lus** : `ChannelMember.lastReadAt` ; compteur par canal et total dans la barre latérale ; marquage au défilement.
- **Temps réel** : Socket.IO ; si la connexion échoue, bascule transparente sur l'interrogation périodique (réseaux instables).
- **Notifications** : mention = in-app immédiat + e-mail différé s'il n'est pas lu sous 15 min (paramétrable).

## A.11 Fil d'activité
Journal chronologique **non modifiable**, filtrable par type et par auteur : tâche créée / modifiée / changement de statut · fichier déposé · commentaire · jalon validé · nouveau membre · livrable soumis / approuvé / validé · réunion planifiée · message épinglé. Chaque ligne : auteur, action, objet cliquable, date relative (+ date complète au survol).

## A.12 Livrables officiels
Nom · description · format attendu · date limite · responsable · fichier déposé · date de soumission · statut.

```
À PRODUIRE ──► EN PRÉPARATION ──► SOUMIS ──► EN RÉVISION ──┬──► À CORRIGER ──► (retour EN PRÉPARATION / re-soumission)
 (créé)         (responsable)     (équipe)    (mentor)      │
                                                            └──► VALIDÉ  = approuvé par le mentor PUIS validé par l'entreprise
```
- Le **mentor** relit, annote, **demande des corrections ou approuve** ; seule son approbation rend le livrable visible dans la file de validation de l'entreprise.
- L'**entreprise** valide ou demande une correction (avec commentaire).
- Chaque soumission est une **version** conservée (fichier + auteur + date) ; l'historique des relectures est lisible par tous les membres.
- Le jalon lié passe automatiquement en « Prêt pour validation » à l'approbation.

## A.13 Réunions
Création (titre, date/heure, durée, participants, ordre du jour, description, type : kick-off / jalon / soutenance / courante), **lien de visioconférence** (généré Jitsi ou saisi), réponse des participants (accepte/refuse), **compte rendu** (Markdown) rédigé après coup, historique. Les réunions apparaissent dans le calendrier et déclenchent des rappels. Intégration Jitsi embarquée : phase 5 ; invitation `.ics` téléchargeable.

## A.14 Espace de suivi du mentor
Vue consolidée de ses projets : état de santé (vert / orange / rouge calculé), progression, retards, dernière activité, livrables à relire, jalons à valider. Actions : commenter les livrables, valider les étapes, **rapport hebdomadaire** (résumé, risques, prochaines étapes, appréciation ; visibilité entreprise et référent), **évaluation individuelle** des étudiants à la clôture.

## A.15 Évaluation finale
À la clôture, six formulaires, chacun avec échelle 1–5, commentaire et compétences démontrées :
évaluation **du projet par l'entreprise** · **de chaque étudiant par l'entreprise** · **de chaque étudiant par le mentor** · **du mentor par l'équipe** · **de l'expérience par chaque étudiant** · **croisée entre membres** (soft skills, investissement, collaboration).
Clôture possible quand : tous les livrables officiels sont validés, les évaluations obligatoires soumises, et (si requis) la validation académique effectuée. Elle déclenche : attribution des badges, mise à jour des compétences et de l'indice de fiabilité, génération des attestations PDF, notification des fonds à libérer (selon D2), archivage différé à 6 mois.

---

# B. Structure de la base de données (PostgreSQL + Prisma)

## B.1 Conventions
- Identifiants **UUID** (v7, triables par date) ; `createdAt` / `updatedAt` partout ; heures en UTC.
- **Montants en entiers** dans la plus petite unité (XOF n'a pas de décimales ; EUR en centimes) + colonne `currency` ; jamais de flottants pour l'argent.
- **Suppression** : pas de suppression physique des données partagées ; RGPD par **anonymisation** de l'utilisateur ; `deletedAt` pour les contenus (messages, tâches).
- **Énumérations** en base (type `enum` Prisma) pour tous les statuts listés ci-dessous.
- **Index** systématiques sur les clés étrangères et sur (`projectId`, `status`), (`projectId`, `createdAt DESC`), (`userId`, `readAt`).
- **Isolation** (voir B.4) : toutes les requêtes passent par des services qui filtrent par appartenance ; test automatique par route.

## B.2 Entités par domaine

### Identité, sécurité, notifications
| Entité | Champs clés | Relations / contraintes |
|---|---|---|
| `User` | email (unique, insensible à la casse), passwordHash (nullable si OAuth), role, status (`EN_ATTENTE_EMAIL`/`ACTIF`/`SUSPENDU`/`ANONYMISE`), emailVerifiedAt, locale, twoFactorEnabled, twoFactorSecret (chiffré), lastLoginAt | 1–1 avec le profil de son rôle |
| `OAuthAccount` | provider (`GOOGLE`/`LINKEDIN`), providerAccountId | unique (provider, providerAccountId) |
| `RefreshToken` | tokenHash, familyId, expiresAt, revokedAt, replacedById, userAgent, ipHash | index (userId), (familyId) |
| `EmailToken` | type (`VERIFICATION`/`RESET`), tokenHash, expiresAt (1 h pour reset), usedAt | à usage unique |
| `Consent` | type, version, grantedAt, revokedAt | historique conservé |
| `AuditLog` | actorId, action, entityType, entityId, metadata (JSONB), ipHash, createdAt | **append-only** (aucun UPDATE/DELETE applicatif) |
| `Notification` | userId, type, payload (JSONB), channel, readAt | index (userId, readAt) |
| `NotificationPreference` | userId, type, inApp, email, digest | unique (userId, type) |
| `FileObject` | key, ownerId, mime, size, sha256, scanStatus, createdAt | registre central des fichiers (logos, KYC, documents) |

### Organisations et profils
| Entité | Champs clés | Relations / contraintes |
|---|---|---|
| `Company` | legalName, sector, size, country, city, description, logo, website, ninea et rccm (chiffrés), kycStatus (`NON_SOUMIS`/`EN_VERIFICATION`/`VALIDE`/`REFUSE`), trustIndex | |
| `CompanyMember` | userId, companyId, jobTitle, contactRole (`DRH`/`DIR_INNOVATION`/`CHEF_PROJET`/`AUTRE`), isOwner | unique (userId, companyId) ; au moins un propriétaire |
| `KycDocument` | companyId, type (`NINEA`/`RCCM`/`AUTRE`), fileId, status, reviewedById, reviewedAt, rejectionReason | |
| `Institution` | name, country, city, logo, status (`EN_ATTENTE`/`VALIDE`), validatedById | validé par l'admin |
| `Program` | institutionId, name, level | filière |
| `Cohort` / `CohortMember` | institutionId, programId, name, academicYear / cohortId, studentId | unique (cohortId, studentId) |
| `StudentProfile` | userId (unique), institutionId, programId, studyLevel, bio, city, country, availability (`PLEIN_TEMPS`/`PARTIEL`/`WEEK_END`), availabilityNotes, sectorPreferences, reliabilityIndex, isPortfolioPublic, slug | |
| `PortfolioItem` | studentId, title, description, url/fileId, projectId (si issu de NEXBRIDGE), isPublic | |
| `MentorProfile` | userId (unique), bio, yearsExperience, certifications (JSONB), indicativeHourlyRate, maxConcurrentProjects, ratingAvg | |
| `MentorExpertise` | mentorId, sectorId ou skillId | |
| `ReferentProfile` | userId (unique), institutionId, programs | |

### Compétences
| Entité | Champs clés | Relations / contraintes |
|---|---|---|
| `Sector` | name, slug | |
| `Skill` | name, slug (unique), category (`TECHNIQUE`/`METIER`/`TRANSVERSALE`/`SECTORIELLE`), active, mergedIntoId | fusion de tags (back-office) |
| `StudentSkill` | studentId, skillId, level (`SENSIBILISE`/`PRATICIEN`/`CONFIRME`/`EXPERT`), source (`DECLARE`/`PROJET`/`CERTIFIE`) | unique (studentId, skillId) |

### Défis (NexBrief)
| Entité | Champs clés | Relations / contraintes |
|---|---|---|
| `Challenge` | companyId, createdById, title, slug, context, objectives, sectorId, keywords[], teamSize, minStudyLevel, desiredStart, durationWeeks, budgetAmount, budgetCurrency (`XOF`/`EUR`), budgetPublic, paymentTerms, status, rejectionReason, publishedAt, closedAt, closeReason | `CHECK (teamSize BETWEEN 2 AND 8)` ; modifiable seulement `BROUILLON`/`EN_REVISION` (règle de service) |
| `ChallengeSkill` | challengeId, skillId, minLevel, weight | unique (challengeId, skillId) |
| `ChallengeDeliverable` | challengeId, title, format (`RAPPORT`/`PROTOTYPE`/`CODE`/`PRESENTATION`/`AUTRE`), description | |
| `ChallengeMilestone` | challengeId, title, description, targetWeek | |
| `ChallengeReview` | challengeId, adminId, decision, comment, checklist (JSONB) | historique des décisions |
| `ChallengeStatusHistory` | challengeId, from, to, actorId, at | |
| `BriefTemplate` | sectorId, name, content (JSONB), active | 10 templates sectoriels initiaux |

### Candidatures, matching, équipes
| Entité | Champs clés | Relations / contraintes |
|---|---|---|
| `Application` | challengeId, studentId, motivation, source (`LIBRE`/`NEXMATCH`), status (`SOUMISE`/`PRE_SELECTIONNEE`/`ACCEPTEE`/`REFUSEE`/`RETIREE`) | unique (challengeId, studentId) |
| `MatchRun` | challengeId, engine (`REGLES`/`IA`), engineVersion, weights (JSONB snapshot), durationMs | trace reproductible |
| `MatchProposal` | matchRunId, rank (1–3), totalScore, diversityScore, explanation (JSONB), status | |
| `MatchProposalMember` | proposalId, studentId, skillScores (JSONB), penalties (JSONB) | |
| `Team` | challengeId, origin (`NEXMATCH`/`MANUELLE`), status (`EN_FORMATION`/`EN_VALIDATION`/`VALIDEE`/`ANNULEE`), proposalId | 1 équipe active par défi |
| `TeamMember` | teamId, studentId, isLead, status (`INVITE`/`ACCEPTE`/`DECLINE`/`REMPLACE`), invitedAt, respondedAt, deadlineAt, replacedById | unique (teamId, studentId) |
| `TeamValidationStep` | teamId, step (`ENTREPRISE`/`ETUDIANTS`/`ACADEMIQUE`), required, status, actorId, decidedAt | ordre imposé par le service |

### Projets et NexSpace
| Entité | Champs clés | Relations / contraintes |
|---|---|---|
| `Project` | challengeId (unique), teamId (unique), companyId, name, description, status (`PLANIFIE`/`EN_COURS`/`EN_PAUSE`/`TERMINE`/`ANNULE`), startDate, plannedEndDate, endedAt, budgetAmount, budgetCurrency, milestoneRule (`MENTOR`/`ENTREPRISE`/`LES_DEUX`), progressPct, lastActivityAt | 1 projet par défi |
| `ProjectMember` | projectId, userId, projectRole (`CONTACT_ENTREPRISE`/`CHEF_PROJET`/`ETUDIANT`/`MENTOR`/`REFERENT`), joinedAt, leftAt | **unique (projectId, userId)** ; base de toute autorisation |
| `Milestone` | projectId, title, description, targetDate, ownerId, status, deliverableId, validatedById, validatedAt | |
| `Task` | projectId, milestoneId, parentTaskId (sous-tâche, un niveau), title, description, status (`A_FAIRE`/`EN_COURS`/`EN_REVISION`/`TERMINE`), priority (`BASSE`/`NORMALE`/`HAUTE`/`URGENTE`), startDate, dueDate, position (rang lexicographique), createdById, completedAt, deletedAt | index (projectId, status, position) |
| `TaskAssignee` | taskId, userId | unique (taskId, userId), doit être membre du projet |
| `Label` / `TaskLabel` | projectId, name, color / taskId, labelId | |
| `TaskComment` | taskId, authorId, body, parentId, editedAt, deletedAt | |
| `TaskHistory` | taskId, actorId, field, oldValue, newValue, at | |
| `TaskDependency` | taskId, dependsOnId | **réservé v2 (Gantt)**, non exposé |
| `Folder` | projectId, parentId, name, visibility | |
| `Document` | projectId, folderId, name, visibility, currentVersionId, createdById | |
| `DocumentVersion` | documentId, versionNo, fileId, uploadedById, createdAt | **3 dernières conservées** |
| `Channel` / `ChannelMember` | projectId, type (`GENERAL`/`THEMATIQUE`/`DIRECT`), name / channelId, userId, lastReadAt | unique (channelId, userId) |
| `Message` | channelId, authorId, body, parentId, editedAt, deletedAt | index (channelId, createdAt DESC) |
| `MessageMention` / `MessageAttachment` / `MessageReaction` | messageId, userId / fileId / emoji | |
| `ActivityEvent` | projectId, actorId, type, entityType, entityId, metadata (JSONB), createdAt | **append-only** ; index (projectId, createdAt DESC) |
| `Deliverable` | projectId, milestoneId, name, description, expectedFormat, dueDate, ownerId, status, mentorApprovedAt, validatedAt | statuts : voir A.12 |
| `DeliverableSubmission` | deliverableId, versionNo, documentVersionId, submittedById, submittedAt | |
| `DeliverableReview` | submissionId, reviewerId, reviewerRole (`MENTOR`/`ENTREPRISE`), decision (`COMMENTAIRE`/`CORRECTION`/`APPROUVE`/`VALIDE`), comment | |
| `Meeting` / `MeetingParticipant` | projectId, title, type, startsAt, durationMin, agenda, description, videoUrl, minutes, createdById / meetingId, userId, rsvp | |
| `MentorReport` | projectId, mentorId, weekStart, summary, risks, nextSteps, health, visibleToCompany, visibleToReferent | unique (projectId, weekStart) |

### Évaluations, badges, validation académique
| Entité | Champs clés | Relations / contraintes |
|---|---|---|
| `Evaluation` | projectId, type (6 types, cf. A.15), evaluatorId, subjectUserId, rating (1–5), comment, criteria (JSONB), moderationStatus, submittedAt | unique (projectId, type, evaluatorId, subjectUserId) |
| `EvaluationSkill` | evaluationId, skillId, demonstratedLevel | alimente `StudentSkill` |
| `BadgeDefinition` | code, name, type (`COMPETENCE`/`EXCELLENCE`/`SECTORIEL`), criteria (JSONB), skillId, sectorId, imageFileId, active | critères : Top Performer > 4,5 ; Leader = 3 projets en chef ; sectoriel = 2 projets |
| `BadgeAward` | badgeId, studentId, projectId, awardedAt, evidence (JSONB), revokedAt, assertion (JSONB, **Open Badges v2, préparé**) | unique (badgeId, studentId, projectId) |
| `Certification` | studentId, skillId, level, issuedAt, basedOnProjects | émise après 3 projets validés |
| `AcademicValidation` | projectId, studentId, referentId, status, credits (décimal), comment, decidedAt | |
| `Attestation` | projectId, studentId, fileId, verificationCode (unique), issuedAt | lien de vérification publique |

### Paiements et facturation (architecture, cf. D2)
| Entité | Champs clés | Relations / contraintes |
|---|---|---|
| `Plan` / `Subscription` | code, prix mensuel/annuel (−15 % annuel), limites (JSONB) / ownerType, ownerId, planId, interval, status, cancelAtPeriodEnd | v2 |
| `Escrow` | projectId (unique), amountHeld, currency, status (`NON_DEPOSE`/`DEPOSE`/`LIBERE`/`REMBOURSE_PARTIEL`/`REMBOURSE`) | **n'existe en `DEPOSE` que sur confirmation réelle d'un prestataire** |
| `Transaction` | projectId, payerId, type (`DEPOT`/`LIBERATION`/`COMMISSION`/`VIREMENT_ETUDIANT`/`REMBOURSEMENT`/`ABONNEMENT`), amount, currency, status, provider (`STRIPE`/`ORANGE`/`WAVE`/`FREE`/`VIREMENT`), providerRef (unique), idempotencyKey (unique) | idempotence obligatoire |
| `PayoutSplit` | projectId, studentId, shareBps | somme = 10 000 pb ; parts égales par défaut |
| `CommissionRule` | rateBps (**CHECK 1500–2000**), effectiveFrom, createdById | historisée |
| `Invoice` | number (séquentiel unique par année), companyId, transactionId, lines (JSONB), subtotal, tax, total, currency, fileId, issuedAt | conforme fiscalité sénégalaise/OHADA (modèle à valider par un comptable) |
| `Refund` | transactionId, amount, reason, status, processedAt | délai ≤ 10 jours ouvrés |
| `ProviderEvent` | provider, eventId (unique), payload, processedAt | webhooks idempotents |

### Plateforme et contenus
`Testimonial`, `Partner`, `FaqItem`, `ContactMessage`, `NewsletterSubscriber` (consentement + double opt-in), `Report` (signalement : cible, motif, statut), `SystemSetting` (clé/valeur JSONB, modifié par), `IntegrationConfig` (provider, statut, configuration chiffrée), `EmailTemplate` (clé, langue, sujet, corps).

## B.3 Relations principales
```
Company 1─* Challenge 1─* Application *─1 StudentProfile *─1 User
Challenge 1─* ChallengeSkill *─1 Skill *─* StudentSkill
Challenge 1─* MatchRun 1─* MatchProposal 1─* MatchProposalMember
Challenge 1─1 Team 1─* TeamMember          Team 1─1 Project
Project 1─* ProjectMember *─1 User         (clé de tous les accès NexSpace)
Project 1─* Milestone / Task / Deliverable / Folder / Channel / Meeting / ActivityEvent / Evaluation
Task 1─* (TaskAssignee, TaskComment, TaskHistory, Subtask)
Document 1─* DocumentVersion *─1 FileObject
Project 1─1 Escrow 1─* Transaction ; Transaction 1─* Invoice / Refund
Institution 1─* (Program, Cohort, ReferentProfile, StudentProfile)
```

## B.4 Règles d'accès (appliquées par le code, vérifiées par des tests)
| Donnée | Qui y accède |
|---|---|
| Défi `PUBLIE` | tout visiteur (champs publics seulement : budget si `budgetPublic`) |
| Défi non publié | membres de l'entreprise propriétaire + admins |
| Candidature | l'étudiant concerné + l'entreprise propriétaire du défi + admins |
| Proposition NexMatch | entreprise propriétaire + admins (les étudiants ne voient que leur propre invitation) |
| Données d'un projet | uniquement les `ProjectMember` ; admins en lecture |
| Document `EQUIPE_SEULE` | étudiants du projet (+ mentor si `EQUIPE_ET_MENTOR`) |
| Profil étudiant public | seulement si `isPortfolioPublic` et champs autorisés |
| KYC, NINEA, pièces | entreprise concernée + admins, jamais exposés en clair dans les journaux |
| Étudiants d'un établissement | référents de cet établissement + admins |
| Transactions / factures | entreprise payeuse, étudiant bénéficiaire (ses lignes), admins |
| `AuditLog`, `IntegrationConfig`, `SystemSetting` | Admin (lecture) ; Super Admin (configuration) |

---

# C. Design system

*Extrait de `Charte graphique_NEXBRIDGE.png`. Les contrastes ont été calculés (WCAG 2.1) ; là où la couleur de marque ne passe pas le seuil AA pour du texte, un **dérivé plus foncé** est prescrit.*

## C.1 Identité
- **Logo** : N stylisé bleu → violet traversé d'un arc blanc (le « pont »), mot-symbole **NEX** en bleu nuit + **BRIDGE** en bleu Nexus, slogan *Connect. Innovate. Transform.* en capitales espacées. **Icône d'application** : le N sur carré arrondi bleu nuit. (Voir D1 : source vectorielle à fournir.)
- **Valeurs** : Innovation · Collaboration · Impact durable.
- **Univers graphique** : fonds bleu nuit, grandes courbes dégradées bleu → violet, pictogrammes au trait blanc (fusée, équipe, poignée de main, toque, trophée, graphique).
- **Ton** : professionnel, chaleureux, tourné vers l'action ; tutoiement exclu sur les pages institutionnelles, vouvoiement par défaut.

## C.2 Couleurs
| Jeton | Hex | Usage | Contraste sur blanc |
|---|---|---|---|
| `brand.nexus` — Bleu Nexus | `#0B5FFF` | Couleur d'action principale (boutons, liens, focus) | **5,13** ✔ AA texte |
| `brand.innovation` — Bleu Innovation | `#3B82F6` | Dégradés, illustrations, éléments graphiques | 3,68 → **pas pour du texte** ; OK ≥ 3:1 pour composants graphiques |
| `brand.impact` — Violet Impact | `#8B5CF6` | Dégradés, accents, rôle Étudiant | 4,23 → pas pour du texte normal |
| `brand.collab` — Vert Collaboration | `#14B8A6` | Succès, rôle Établissement | 2,49 → **pas pour du texte ni de fond de bouton blanc** |
| `brand.cloud` — Gris Élégant | `#F8FAFC` | Fond de l'application | — |
| `brand.night` — Bleu nuit | à échantillonner sur la charte (≈ bleu très foncé du fond et du mot « NEX ») | Fonds sombres, texte fort | à calculer une fois la valeur exacte fixée |

**Dérivés accessibles (contrastes vérifiés sur blanc)** : texte violet `#6D28D9` (**7,10**) · texte vert `#0F766E` (**5,47**) · bleu foncé `#1D4ED8` (**6,70**) · texte ambre `#B45309` (**5,02**). Règle : le texte et les boutons pleins avec texte blanc utilisent **Bleu Nexus** ou un dérivé foncé ; les couleurs vives servent aux fonds clairs, pastilles, graphiques et dégradés.

**Couleurs par rôle** (reprises des pastilles de la charte) : Entreprise = bleu · Étudiant = violet · Établissement = vert-bleu · Expert & Mentor = ambre/orange.

**Statuts et priorités** (fond très clair + texte foncé, jamais la couleur seule : toujours un libellé et/ou une icône)
| Priorité | Teinte | | Statut de tâche | Teinte |
|---|---|---|---|---|
| Basse | teal | | À faire | gris |
| Normale | bleu | | En cours | bleu |
| Haute | ambre | | En révision | violet |
| Urgente | rouge | | Terminé | vert |

## C.3 Typographie
**Plus Jakarta Sans** (Moderne · Lisible · Professionnelle), auto-hébergée, graisses 400/500/600/700/800, sous-ensemble latin + accents.
| Style | Taille / interligne | Graisse |
|---|---|---|
| Display (hero) | 56 / 60 (mobile 36 / 40) | 800 |
| H1 | 40 / 46 (mobile 30 / 36) | 700 |
| H2 | 30 / 38 | 700 |
| H3 | 22 / 30 | 600 |
| Corps | 16 / 26 | 400 |
| Petit / légende | 14 / 20 · 12 / 16 | 500 |
| Chiffres de tableau | tabulaires (`font-variant-numeric: tabular-nums`) | 500 |

## C.4 Espacement, formes, mouvement
- Grille de **4 px** ; conteneur max 1200 px ; points de rupture **320 / 768 / 1024 / 1440** (CDC).
- Rayons : 8 px (champs, étiquettes), 12 px (boutons, cartes), 20–24 px (panneaux et icône d'app).
- Ombres douces à faible opacité ; contours 1 px `#E2E8F0`.
- Mouvement : transitions 150–250 ms, animation du hero légère ; **`prefers-reduced-motion` respecté** (animations coupées).

## C.5 Mise en page
- **Landing** : fond bleu nuit avec courbes dégradées (comme la bannière de la charte), contenu en blanc, CTA principal plein bleu Nexus, CTA secondaire contour blanc ; sections claires alternées (`#F8FAFC` / blanc) ensuite.
- **Application** (inspiration d'ergonomie : `Interface.jpeg`) : **barre latérale** à gauche (logo, navigation, projets récents, espace de travail), **en-tête** avec recherche globale, notifications, avatar ; fil d'Ariane ; contenu sur fond `#F8FAFC` avec cartes blanches ; pile d'avatars et barre de progression dans l'en-tête de projet. Sur mobile : barre latérale en tiroir, navigation basse pour 4–5 actions fréquentes.

## C.6 Composants (bibliothèque shadcn/ui personnalisée avec les jetons ci-dessus)
Boutons (primaire, secondaire, fantôme, destructif, avec icône, en chargement) · champs, listes, cases, interrupteurs, sélecteur multi-étiquettes de compétences, sélecteur de dates · **cartes** (défi, statistique, projet, équipe NexMatch, badge) · **tableaux** (tri, filtres, pagination, sélection) · **badges de statut** · **modales** et panneaux latéraux · **menus contextuels** · onglets · fil d'Ariane · barre de progression · **avatars et piles** · étapes (wizard) · calendrier · graphiques (barres, courbe, radar, anneau) · **squelettes de chargement** · **états vides** · **toasts** (confirmation, erreur) · bannières (démonstration, intégration non configurée, e-mail non vérifié) · confirmations de suppression.

## C.7 Accessibilité (WCAG 2.1 AA)
Contrastes vérifiés (C.2) · navigation clavier complète et **anneau de focus visible** (2 px Bleu Nexus + décalage) · `label` et `aria-*` sur tous les champs, erreurs liées par `aria-describedby` · cibles tactiles ≥ 44 px · hiérarchie de titres cohérente · lien « Aller au contenu » · textes alternatifs · aucune information portée par la couleur seule · tests automatisés (axe) dans Playwright sur les pages clés.

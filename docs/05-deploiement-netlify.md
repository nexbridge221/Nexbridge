# Déploiement sur Netlify

Tout tourne sur Netlify : le site, l'API et la base de données.

```
Navigateur ──► Netlify (CDN) : site React (apps/web/dist) + réécritures SPA (netlify.toml)
                 └─ /api/*, /socket.io/*  ─► Netlify Server (apps/api/netlify/server/index.ts) : l'API Express telle quelle
                                                └─► Netlify Database (PostgreSQL)
Planificateur ──► netlify/functions/team-deadlines.mts (toutes les 10 min) ─► POST /api/internal/team-deadlines
```

- **Même origine** pour le site et l'API : le cookie de session (`SameSite=Strict`) et le jeton CSRF fonctionnent comme en local.
- **Netlify Server** est en **accès anticipé** (API susceptible de changer) et réservé aux plans à crédits.
- **Netlify Database** : les migrations sont les fichiers de `netlify/database/migrations/` (appliqués par le déploiement) : `..._init` (schéma, généré depuis `apps/api/prisma/schema.prisma`) et `..._seed_demo` et `..._demo_challenges` (données de **démonstration** : 13 comptes, 17 défis publiés dont 12 « réalistes » de `apps/api/src/seed/demo-challenges.ts`). Prisma n'exécute pas de migrations sur Netlify.
- **Prisma sans moteur natif** (`engineType = "client"` + `@prisma/adapter-pg`) pour que l'API soit empaquetable ; l'URL de la base est `NETLIFY_DB_URL` (utilisée si `DATABASE_URL` est absente).

## Variables d'environnement (Project configuration → Environment variables)

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `staging` (la démo est interdite en `production`) |
| `DEMO_MODE` | `true` pour la démonstration ; `false` pour de vraies données |
| `COOKIE_SECURE` | `true` |
| `APP_URL` | adresse publique du site (liens d'e-mails, origines autorisées) |
| `TRUST_PROXY` | `1` |
| `ENCRYPTION_KEY` | secret, 32 octets en base64 (`openssl rand -base64 32`), **à ne jamais changer** |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | paire RSA (secret) |
| `CRON_SECRET` | secret ≥ 16 caractères, partagé avec la fonction planifiée |
| `STORAGE_LOCAL_DIR` | `/tmp/uploads` (éphémère ; voir limites) |
| `DB_POOL_MAX` | `5` |

Les secrets se posent avec `netlify env:set NOM --secret --context production -- "valeur"` (lancer la commande hors du dépôt, avec `--site <id>` et `</dev/null`).

## Déployer

```bash
source scripts/env.sh
netlify deploy --prod --site <id-du-projet> --filter @nexbridge/api
```
Le premier déploiement provisionne la base et applique les migrations. Le dossier `.netlify/` (lien local) est ignoré par Git.

## Limites connues
- **Pas de Redis** : limites de débit et liste de jetons révoqués en mémoire par instance (dégradé) ; pas de file BullMQ.
- **Fichiers déposés** : le disque est éphémère (`/tmp`). Pour un usage réel, utiliser un stockage S3 compatible (`STORAGE_DRIVER=s3`) ; l'adaptateur S3 n'a jamais été testé contre un service réel.
- **E-mails** : sans `SENDGRID_API_KEY`, aucun e-mail n'est envoyé ; les nouveaux inscrits ne peuvent pas confirmer leur adresse.
- **Données de démonstration** : les NINEA/RCCM des organisations de démo ont été chiffrés avec la clé locale, pas celle de Netlify : ils sont illisibles côté Netlify (affichés vides).
- **Visibilité** : un nouveau projet Netlify est privé par défaut (connexion Netlify requise). Pour un lien public : Project configuration → Access & security → Visitor access.
- **Paiements** : le registre de séquestre ne déplace aucun argent ; Stripe n'a jamais été testé avec les vrais services.

- **Empaquetage de l'API** : le paquet partagé (TypeScript) est regroupé dans le bundle ; les dépendances npm restent externes. Le client Prisma sans moteur natif lit son module WebAssembly sur disque : il est embarqué via `includedFiles` dans `server-entry.ts`.

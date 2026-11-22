# Déploiement : site sur Cloudflare Pages, API sur Render

## Architecture

```
Navigateur ──► Cloudflare Pages (site React + Pages Functions)
                 │  /api/*  et  /socket.io/*  relayés par apps/web/functions/
                 ▼
              API Express (Docker) ──► PostgreSQL ──► Redis        (hébergés sur Render)
                 └─► fichiers : disque local (démo) ou Cloudflare R2 (recommandé)
```

- Le **site** est statique : Cloudflare Pages le sert partout dans le monde, sans serveur à gérer.
- L'**API** (Express + Prisma + PostgreSQL + Redis + BullMQ) ne peut pas tourner telle quelle sur Cloudflare Workers : elle est hébergée sur un service qui exécute des conteneurs. Le fichier `render.yaml` décrit l'API, la base PostgreSQL et Redis pour Render.
- Les **Pages Functions** (`apps/web/functions/`) relaient `/api` et `/socket.io` vers l'API. Le navigateur ne voit qu'une origine : le cookie de session (`SameSite=Strict`) et le jeton CSRF fonctionnent comme en local, sans configuration CORS.

Ce qui est vérifié : l'API démarre dans les conditions du conteneur (sans fichier `.env`, `NODE_ENV=staging`) et répond sur `/api/health` ; le relais Pages Function transmet bien une requête à l'API. **Jamais vérifié** : le build de l'image Docker (Docker n'est pas installé sur la machine de développement), le déploiement réel sur Cloudflare et Render, le WebSocket à travers Pages.

## 1. API sur Render

1. **Dépôt GitHub** (privé) : Render déploie depuis Git. Dans le dossier du projet :
   ```bash
   git add -A && git commit -m "NEXBRIDGE"
   git remote add origin git@github.com:<vous>/nexbridge.git && git push -u origin main
   ```
   Le fichier `.gitignore` exclut `.env` et `.nexbridge-local/` (secrets, comptes de démonstration).
2. **Clés JWT (RS256)** : à générer une fois, à ne jamais commiter.
   ```bash
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-private.pem
   openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem
   awk 'NF {printf "%s\\n", $0}' jwt-private.pem   # valeur de JWT_PRIVATE_KEY (une seule ligne avec des \n)
   awk 'NF {printf "%s\\n", $0}' jwt-public.pem    # valeur de JWT_PUBLIC_KEY
   ```
3. **Render → New → Blueprint** → choisir le dépôt. Render lit `render.yaml` et crée l'API, PostgreSQL et Redis. Renseigner les variables demandées : `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, et `APP_URL` (provisoirement `https://nexbridge.pages.dev`, à corriger à l'étape 3). `ENCRYPTION_KEY` est générée par Render : **ne la changez jamais** (elle chiffre NINEA/RCCM et secrets 2FA).
4. Au démarrage, l'image applique les migrations (`prisma migrate deploy`) puis lance l'API. Vérifier `https://<votre-api>.onrender.com/api/health` → `{"status":"ok"}`.
5. **Données de démonstration** (instance de démo uniquement), dans l'onglet *Shell* du service :
   ```bash
   cd apps/api && ./node_modules/.bin/tsx src/seed/seed.ts && cat /app/.nexbridge-local/demo-accounts.txt
   ```
   Le fichier affiche les comptes de démonstration et leurs mots de passe générés.

Plans : `starter` et `basic-256mb` sont des plans payants d'entrée de gamme : vérifiez les tarifs actuels. Alternatives gratuites ou moins chères : base PostgreSQL chez Neon et Redis chez Upstash (renseigner alors `DATABASE_URL` / `REDIS_URL` à la main et retirer les blocs correspondants de `render.yaml`).

## 2. Site sur Cloudflare Pages

Depuis la racine du projet (les outils sont chargés par `scripts/env.sh`) :
```bash
source scripts/env.sh
pnpm install && pnpm --filter @nexbridge/web build
cd apps/web
npx wrangler login                                   # ouvre le navigateur : vous autorisez l'accès à votre compte
npx wrangler pages project create nexbridge --production-branch main
npx wrangler pages deploy dist --project-name nexbridge
```
`wrangler pages deploy` publie `dist/` **et** les fonctions de `functions/`. L'adresse obtenue est de la forme `https://nexbridge.pages.dev`.

## 3. Relier le site et l'API

1. Dans Cloudflare → *Workers & Pages* → `nexbridge` → *Settings* → *Variables and Secrets* : ajouter `API_ORIGIN` = `https://<votre-api>.onrender.com` (sans `/` final), pour *Production*. En ligne de commande : `npx wrangler pages secret put API_ORIGIN --project-name nexbridge`. Puis redéployer (`npx wrangler pages deploy dist --project-name nexbridge`).
2. Sur Render, mettre `APP_URL` = l'adresse Pages (ou votre domaine) et redéployer l'API : les liens des e-mails et la liste d'origines autorisées en dépendent.
3. Ouvrir l'adresse Pages : l'accueil s'affiche, `/api/health` répond, la connexion fonctionne.

Domaine personnalisé : *Pages → Custom domains*. Mettre ensuite `APP_URL` à jour.

## 4. Points d'attention

| Sujet | Ce qu'il faut savoir |
|---|---|
| **Fichiers déposés** | Sur Render, le disque du conteneur est effacé à chaque déploiement. Pour de vrais usages : bucket **Cloudflare R2** (compatible S3) → `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION=auto`, `S3_ENDPOINT=https://<id-compte>.r2.cloudflarestorage.com`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. L'adaptateur S3 n'a jamais été testé contre un vrai service. |
| **E-mails** | Sans `SENDGRID_API_KEY`, aucun e-mail n'est envoyé : les nouveaux inscrits ne peuvent pas confirmer leur adresse. Configurer SendGrid et un expéditeur validé (`MAIL_FROM`). |
| **Adresse IP des visiteurs** | Les limites de débit se basent sur l'IP. `TRUST_PROXY=2` (Cloudflare + Render) la lit correctement ; si vous changez de chaîne de proxys, ajustez cette valeur. |
| **Temps réel** | Les mises à jour en direct utilisent socket.io. Si le WebSocket n'est pas relayé, l'interface retombe sur l'actualisation périodique (indicateur « Temps réel inactif »). |
| **Production réelle** | `NODE_ENV=production` impose `DEMO_MODE=false`, `COOKIE_SECURE=true`, des clés JWT et `ENCRYPTION_KEY` fournies. Ne lancez jamais le seed en production. Ajoutez sauvegardes PostgreSQL, supervision et un antivirus (`CLAMAV_HOST`) avant d'accueillir de vrais utilisateurs. |
| **Paiements** | Le registre de séquestre ne déplace aucun argent. Stripe n'est actif qu'avec `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` (webhook : `https://<site>/api/payments/stripe-webhook`) ; il n'a jamais été testé avec les vrais services. |
| **API lancée avec `tsx`** | Le paquet partagé est en TypeScript : l'image exécute donc l'API avec `tsx` plutôt qu'un build compilé. Un vrai build (bundle) reste à mettre en place pour optimiser le démarrage. |

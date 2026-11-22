# Image de l'API NEXBRIDGE (contexte de build = racine du dépôt).
#   docker build -f apps/api/Dockerfile -t nexbridge-api .
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@12.21.0
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @nexbridge/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN node ./node_modules/prisma/build/index.js generate
ENV NODE_ENV=staging API_PORT=4000
EXPOSE 4000
# Migrations appliquées au démarrage, puis API (l'API s'exécute avec tsx : le paquet partagé est en TypeScript).
CMD ["sh", "-c", "node ./node_modules/prisma/build/index.js migrate deploy && ./node_modules/.bin/tsx src/server.ts"]

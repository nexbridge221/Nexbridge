import { createApp } from "./app";
import { config } from "./config";
import { getRedis, logger, prisma } from "./platform/core";
import { mail } from "./platform/mail";
import { storage } from "./platform/storage";
import { startBackgroundJobs } from "./platform/queue";
import { attachRealtime } from "./platform/realtime";

const app = createApp();
getRedis(); // amorce la connexion (dégradation silencieuse si indisponible)

const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      env: config.env,
      demoMode: config.demoMode,
      mail: mail.name,
      storage: storage.name,
      oauth: config.oauth,
    },
    `API NEXBRIDGE démarrée sur http://localhost:${config.port}`,
  );
});

attachRealtime(server);

// Tâches de fond (échéances d'équipe) : file BullMQ si Redis est disponible, sinon minuteur local.
const stopJobs = startBackgroundJobs().catch((e) => { logger.error({ err: e.message }, "Impossible de démarrer les tâches de fond"); return async () => undefined; });

async function shutdown(signal: string) {
  await (await stopJobs)();
  logger.info(`${signal} reçu, arrêt en cours…`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

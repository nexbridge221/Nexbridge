import { Queue, Worker } from "bullmq";
import { config } from "../config";
import { logger } from "./core";
import { processTeamDeadlines } from "../modules/teams/service";

/**
 * Tâches de fond : file BullMQ (Redis) avec tâche répétée toutes les 10 minutes — plusieurs instances de l'API
 * peuvent tourner sans doubler le traitement. Sans Redis : repli sur un minuteur local (une seule instance).
 */
const QUEUE = "nexbridge-jobs";
const EVERY_MS = 10 * 60_000;

async function runDeadlines() {
  const r = await processTeamDeadlines();
  if (r.expired || r.reminded) logger.info(r, "Échéances d'équipe traitées");
}

export async function startBackgroundJobs(): Promise<() => Promise<void>> {
  if (config.isTest) return async () => undefined;
  if (!config.redisUrl) {
    logger.warn("Redis absent : tâches de fond exécutées par un minuteur local (une seule instance de l'API).");
    const t = setInterval(() => runDeadlines().catch((e) => logger.error({ err: e.message }, "Échec du traitement des échéances")), EVERY_MS);
    return async () => clearInterval(t);
  }
  const u = new URL(config.redisUrl);
  const connection = { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, username: u.username || undefined, tls: u.protocol === "rediss:" ? {} : undefined, maxRetriesPerRequest: null as null };
  const queue = new Queue(QUEUE, { connection });
  queue.on("error", (e) => logger.warn({ err: e.message }, "File de tâches : erreur Redis"));
  await queue.upsertJobScheduler("team-deadlines", { every: EVERY_MS }, { name: "team-deadlines", opts: { removeOnComplete: 20, removeOnFail: 50 } });
  const worker = new Worker(QUEUE, async (job) => { if (job.name === "team-deadlines") await runDeadlines(); }, { connection, concurrency: 1 });
  worker.on("failed", (job, e) => logger.error({ job: job?.name, err: e.message }, "Tâche de fond en échec"));
  worker.on("error", (e) => logger.warn({ err: e.message }, "Worker : erreur Redis"));
  logger.info("Tâches de fond : file BullMQ active (échéances d'équipe toutes les 10 min).");
  return async () => { await worker.close(); await queue.close(); };
}

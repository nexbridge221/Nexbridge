import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { unauthorized } from "../../platform/core";
import { processTeamDeadlines } from "../teams/service";

/** Routes réservées à l'infrastructure (tâches planifiées). Désactivées sans CRON_SECRET ; secret comparé en temps constant. */
export const internalRouter = Router();

internalRouter.post("/team-deadlines", async (req, res) => {
  const expected = process.env.CRON_SECRET;
  const given = String(req.headers["x-cron-secret"] ?? "");
  if (!expected || expected.length < 16) throw unauthorized("Tâches planifiées non configurées");
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw unauthorized("Secret invalide");
  res.json(await processTeamDeadlines());
});

import type { Config } from "@netlify/functions";

/** Traite les échéances d'équipe toutes les 10 minutes en appelant la route interne de l'API (protégée par CRON_SECRET). */
export default async () => {
  const base = process.env.URL;
  if (!base || !process.env.CRON_SECRET) { console.warn("URL ou CRON_SECRET absent : tâche ignorée"); return; }
  const res = await fetch(`${base}/api/internal/team-deadlines`, { method: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET, "x-requested-with": "nexbridge" } });
  console.log("team-deadlines", res.status, await res.text());
};

export const config: Config = { schedule: "*/10 * * * *" };

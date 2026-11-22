import { paymentsRouter, stripeWebhook } from "./modules/payments/routes";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { config } from "./config";
import { logger, prisma } from "./platform/core";
import { errorHandler, notFoundHandler } from "./platform/http";
import { authRouter } from "./modules/auth/routes";
import { profileRouter } from "./modules/profiles/routes";
import { publicRouter } from "./modules/public/routes";
import { notificationRouter } from "./modules/notifications/routes";
import { challengeRouter } from "./modules/challenges/routes";
import { adminRouter } from "./modules/admin/routes";
import { mentorRouter, projectsRouter } from "./modules/nexspace";
import { academicPilotRouter, attestationsRouter, badgesRouter, reportsRouter } from "./modules/pilotage/userRoutes";
import { dashboardsRouter } from "./modules/pilotage/dashboards";
import { backofficeRouter } from "./modules/pilotage/backoffice";
import { publicPilotageRouter } from "./modules/pilotage/publicRoutes";
import { receivedEvaluationsHandler } from "./modules/pilotage/evaluations";
import { academicRouter, applicationRouter, matchRouter, teamRouter } from "./modules/teams/routes";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1)); // 2 derrière Cloudflare Pages + un hébergeur (voir docs/05-deploiement-cloudflare.md)

  app.use(
    helmet({
      // L'API ne sert que du JSON et des fichiers téléchargés : CSP minimale et stricte.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.use(cors({ origin: [config.appUrl], credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"] }));
  app.use(pinoHttp({ logger, autoLogging: !config.isTest }));
  app.use("/api/payments/stripe-webhook", stripeWebhook); // corps brut : avant express.json
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "degraded" });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/public", publicPilotageRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/challenges", challengeRouter);
  app.use("/api/challenges", matchRouter);
  app.use("/api/teams", teamRouter);
  app.use("/api/applications", applicationRouter);
  app.use("/api/academic", academicRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/admin", backofficeRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/badges", badgesRouter);
  app.use("/api/attestations", attestationsRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/dashboards", dashboardsRouter);
  app.get("/api/evaluations/received", ...receivedEvaluationsHandler);
  app.use("/api/academic", academicPilotRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/mentor", mentorRouter);
  app.use("/api", profileRouter); // /api/me, /api/company, /api/files

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

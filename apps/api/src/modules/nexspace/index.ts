import { Router } from "express";
import { deliverablesRouter } from "./deliverables";
import { documentsRouter } from "./documents";
import { meetingsRouter } from "./meetings";
import { messagingRouter } from "./messaging";
import { reportsRouter } from "./mentor";
import { overviewRouter } from "./overview";
import { closeProject, evaluationsRouter } from "../pilotage/evaluations";
import { milestonesRouter, tasksRouter } from "./tasks";

/** Tout NexSpace est monté sous /api/projects. */
export const projectsRouter = Router();
projectsRouter.use("/:projectId/tasks", tasksRouter);
projectsRouter.use("/:projectId/milestones", milestonesRouter);
projectsRouter.use("/:projectId/documents", documentsRouter);
projectsRouter.use("/:projectId", messagingRouter); // /channels…
projectsRouter.use("/:projectId/deliverables", deliverablesRouter);
projectsRouter.use("/:projectId/meetings", meetingsRouter);
projectsRouter.use("/:projectId/reports", reportsRouter);
projectsRouter.use("/:projectId/evaluations", evaluationsRouter);
projectsRouter.post("/:projectId/close", ...closeProject);
projectsRouter.use("/", overviewRouter);
export { mentorRouter } from "./mentor";

import { createServer } from "node:http";
import type { Config } from "@netlify/server";
import { createApp } from "../../apps/api/src/app";
import { attachRealtime } from "../../apps/api/src/platform/realtime";

/**
 * API NEXBRIDGE sur Netlify Server : l'application Express est exposée telle quelle (même origine que le site,
 * donc cookie de session « SameSite=Strict » inchangé). Socket.IO est attaché au serveur HTTP (WebSocket pris en charge).
 * Pas de Redis ni de minuteur : les échéances d'équipe sont traitées par la fonction planifiée netlify/functions/team-deadlines.mts.
 */
const server = createServer(createApp());
attachRealtime(server);
export default server;

export const config: Config = { path: ["/api/*", "/socket.io/*"], region: "fra", size: "small" };

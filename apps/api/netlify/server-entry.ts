import { createServer } from "node:http";
import type { Config } from "@netlify/server";
import { createApp } from "../src/app";
import { attachRealtime } from "../src/platform/realtime";

/**
 * API NEXBRIDGE sur Netlify Server : l'application Express est exposée telle quelle (même origine que le site,
 * donc cookie de session « SameSite=Strict » inchangé). Socket.IO est attaché au serveur HTTP (WebSocket pris en charge).
 * Pas de Redis ni de minuteur : les échéances d'équipe sont traitées par la fonction planifiée netlify/functions/team-deadlines.mts.
 */
const server = createServer(createApp());
attachRealtime(server);
export default server;

// Le client Prisma (sans moteur natif) lit son module WebAssembly sur le disque à l'exécution : il doit être embarqué.
export const config: Config = {
  path: ["/api/*", "/socket.io/*"], region: "fra", size: "small",
  includedFiles: ["../../../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**"],
};

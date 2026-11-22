import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { config } from "../config";
import { logger, prisma } from "./core";

/**
 * Temps réel (Socket.IO) : un salon par projet. L'accès est vérifié à la connexion (jeton JWT)
 * ET à chaque demande de salon (appartenance au projet). Les événements ne contiennent que des
 * identifiants : le client recharge les données par l'API, qui applique les droits.
 */
let io: Server | null = null;

export function attachRealtime(server: HttpServer): void {
  io = new Server(server, { path: "/socket.io", cors: { origin: [config.appUrl], credentials: true }, serveClient: false });
  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string }).token ?? "";
      const p = jwt.verify(token, config.jwt.publicKey, { algorithms: ["RS256"], issuer: config.jwt.issuer }) as jwt.JwtPayload;
      socket.data.userId = p.sub;
      next();
    } catch { next(new Error("unauthorized")); }
  });
  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
    socket.on("project:join", async (projectId: string, ack?: (ok: boolean) => void) => {
      const ok = typeof projectId === "string" && Boolean(await prisma.projectMember.findFirst({ where: { projectId, userId: socket.data.userId, leftAt: null }, select: { id: true } }));
      if (ok) socket.join(`project:${projectId}`);
      ack?.(ok);
    });
    socket.on("project:leave", (projectId: string) => socket.leave(`project:${projectId}`));
  });
  logger.info("Temps réel (Socket.IO) activé");
}

export function emitProject(projectId: string, event: string, payload: Record<string, unknown> = {}): void {
  io?.to(`project:${projectId}`).emit(event, { projectId, ...payload });
}

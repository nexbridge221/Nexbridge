import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { TaskPriorityCode, TaskStatusCode } from "@nexbridge/shared";
import { api, getAccessToken } from "./api";

export type SpaceRole = "CONTACT_ENTREPRISE" | "CHEF_PROJET" | "ETUDIANT" | "MENTOR" | "REFERENT" | "ADMIN";
export interface Member { userId: string; role: SpaceRole; name: string }
export interface Overview {
  access: { role: SpaceRole; readOnly: boolean };
  project: { id: string; name: string; description: string | null; status: string; startDate: string | null; plannedEndDate: string | null; progressPct: number; lastActivityAt: string | null; milestoneRule: string; challenge: { id: string; title: string; sector: { name: string } | null }; escrowStatus: string | null };
  budget: { amount: number | null; currency: string } | null;
  members: Member[];
  counts: { A_FAIRE: number; EN_COURS: number; EN_REVISION: number; TERMINE: number; late: number; total: number };
  nextDeadline: { kind: string; title: string; at: string } | null;
  health: "VERT" | "ORANGE" | "ROUGE"; alerts: { level: "info" | "attention" | "critique"; text: string }[];
  milestones: { id: string; title: string; targetDate: string; status: string }[];
  meetings: { id: string; title: string; startsAt: string; videoUrl: string | null }[];
  lastMessages: { id: string; body: string; channel: string; author: string; createdAt: string }[];
  lastDocuments: { id: string; name: string; createdAt: string; version: number }[];
  activity: { id: string; type: string; label: string; actor: string; createdAt: string }[];
}
export interface TaskT {
  id: string; title: string; description: string | null; status: TaskStatusCode; priority: TaskPriorityCode; startDate: string | null; dueDate: string | null; position: number; milestoneId: string | null; parentTaskId: string | null; createdById: string;
  completedAt: string | null; updatedAt: string; assignees: { userId: string; name: string }[]; labels: { id: string; name: string; color: string }[]; subtasks: { total: number; done: number }; comments: number; attachments: number;
}
export const useOverview = (id: string) => useQuery({ queryKey: ["space", id, "overview"], queryFn: () => api<Overview>(`/projects/${id}`), retry: false });

export const canWriteTasks = (r: SpaceRole, ro: boolean) => !ro && (r === "CHEF_PROJET" || r === "ETUDIANT" || r === "MENTOR");
export const isLeadOrMentor = (r: SpaceRole, ro: boolean) => !ro && (r === "CHEF_PROJET" || r === "MENTOR");
export const canContribute = (r: SpaceRole, ro: boolean) => !ro && r !== "REFERENT" && r !== "ADMIN";

/** Temps réel : un salon par projet ; chaque événement invalide les requêtes concernées (l'API reste l'autorité sur les droits). */
export function useProjectSocket(projectId: string): boolean {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const ref = useRef<Socket | null>(null);
  useEffect(() => {
    const s = io({ path: "/socket.io", auth: (cb) => cb({ token: getAccessToken() }), transports: ["websocket", "polling"], reconnectionDelayMax: 10_000 });
    ref.current = s;
    const inv = (...keys: string[]) => keys.forEach((k) => void qc.invalidateQueries({ queryKey: ["space", projectId, k] }));
    s.on("connect", () => { setConnected(true); s.emit("project:join", projectId); });
    s.on("disconnect", () => setConnected(false));
    s.on("task", () => inv("tasks", "task", "overview", "milestones", "calendar"));
    s.on("message", () => inv("channels", "messages", "overview"));
    s.on("document", () => inv("documents", "folders", "overview"));
    s.on("deliverable", () => inv("deliverables", "overview", "milestones"));
    s.on("meeting", () => inv("meetings", "overview", "calendar"));
    s.on("milestone", () => inv("milestones", "overview", "calendar"));
    s.on("activity", () => inv("activity", "overview"));
    return () => { s.emit("project:leave", projectId); s.disconnect(); };
  }, [projectId, qc]);
  return connected;
}

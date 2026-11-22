import type { Project, ProjectRole } from "@prisma/client";
import type { Request } from "express";
import type { DocVisibility } from "@prisma/client";
import { forbidden, notFound, prisma } from "../../platform/core";
import { emitProject } from "../../platform/realtime";

export type SpaceRole = ProjectRole | "ADMIN";
export interface Access {
  project: Project;
  userId: string;
  role: SpaceRole;
  /** Membre inscrit dans ProjectMember (faux pour admin et référent, en lecture seule) */
  isMember: boolean;
  readOnly: boolean;
}

/**
 * Source unique des droits NexSpace : appartenance au projet (ProjectMember).
 * Un utilisateur sans lien avec le projet reçoit 404 (l'existence du projet n'est pas confirmée).
 * Admin et référent (dont un étudiant est membre) : lecture seule.
 */
export async function getAccess(req: Request, projectId: string): Promise<Access> {
  const userId = req.auth!.id;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Projet introuvable");
  const member = await prisma.projectMember.findFirst({ where: { projectId, userId, leftAt: null } });
  if (member) return { project, userId, role: member.projectRole, isMember: true, readOnly: false };
  if (req.auth!.role === "ADMIN" || req.auth!.role === "SUPER_ADMIN") return { project, userId, role: "ADMIN", isMember: false, readOnly: true };
  if (req.auth!.role === "REFERENT_ACADEMIQUE") {
    const ref = await prisma.referentProfile.findUnique({ where: { userId }, select: { institutionId: true } });
    if (ref && (await prisma.projectMember.count({ where: { projectId, leftAt: null, user: { studentProfile: { institutionId: ref.institutionId } } } }))) return { project, userId, role: "REFERENT", isMember: false, readOnly: true };
  }
  throw notFound("Projet introuvable");
}

export const isTeam = (r: SpaceRole) => r === "CHEF_PROJET" || r === "ETUDIANT";
export const isCompany = (r: SpaceRole) => r === "CONTACT_ENTREPRISE";
/** Écriture sur les tâches : équipe et mentor (l'entreprise commente seulement). */
export function requireTaskWriter(a: Access): void { if (a.readOnly || !(isTeam(a.role) || a.role === "MENTOR")) throw forbidden("Seuls l'équipe et le mentor peuvent modifier les tâches.", "SPACE_FORBIDDEN"); }
/** Contribution générale (documents, messages, réunions) : tout membre, hors lecture seule. */
export function requireContributor(a: Access): void { if (a.readOnly || !a.isMember) throw forbidden("Accès en lecture seule.", "SPACE_READ_ONLY"); }
export function requireLeadOrMentor(a: Access): void { if (a.readOnly || !(a.role === "CHEF_PROJET" || a.role === "MENTOR")) throw forbidden("Réservé au chef de projet et au mentor.", "SPACE_FORBIDDEN"); }
export function requireMentor(a: Access): void { if (a.readOnly || a.role !== "MENTOR") throw forbidden("Réservé au mentor du projet.", "SPACE_FORBIDDEN"); }

/** Droits de lecture d'un document selon sa visibilité. */
export function canSee(role: SpaceRole, vis: DocVisibility): boolean {
  if (role === "ADMIN") return true;
  if (vis === "TOUS") return true;
  if (vis === "EQUIPE_ET_MENTOR") return isTeam(role) || role === "MENTOR";
  return isTeam(role);
}
export const visibleSet = (role: SpaceRole): DocVisibility[] => (["TOUS", "EQUIPE_ET_MENTOR", "EQUIPE_SEULE"] as const).filter((v) => canSee(role, v));

/** Écrit dans le fil d'activité, met à jour la dernière activité du projet et prévient les clients connectés. */
export async function logActivity(projectId: string, actorId: string | null, type: string, label: string, opts: { entityType?: string; entityId?: string; metadata?: Record<string, unknown>; silent?: boolean } = {}): Promise<void> {
  await prisma.activityEvent.create({ data: { projectId, actorId, type, label, entityType: opts.entityType, entityId: opts.entityId, metadata: opts.metadata as object | undefined } });
  await prisma.project.update({ where: { id: projectId }, data: { lastActivityAt: new Date() } });
  if (!opts.silent) emitProject(projectId, "activity", { type });
}

export async function memberUserIds(projectId: string, opts: { except?: string; roles?: ProjectRole[] } = {}): Promise<string[]> {
  const rows = await prisma.projectMember.findMany({ where: { projectId, leftAt: null, ...(opts.roles ? { projectRole: { in: opts.roles } } : {}) }, select: { userId: true } });
  return rows.map((r) => r.userId).filter((id) => id !== opts.except);
}
export async function assertMembers(projectId: string, userIds: string[]): Promise<void> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  if ((await prisma.projectMember.count({ where: { projectId, userId: { in: ids }, leftAt: null } })) !== ids.length) throw forbidden("Un des utilisateurs n'est pas membre du projet.", "NOT_A_MEMBER");
}
export const personName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

import type { Role } from "./enums";

/**
 * Matrice de permissions (RBAC) — source unique utilisée par l'API ET par l'interface.
 * Principe du moindre privilège : une permission absente = refusée.
 *
 * ATTENTION : ces permissions disent ce qu'un RÔLE peut faire en général.
 * Elles ne remplacent PAS les contrôles d'appartenance (un étudiant n'accède qu'aux
 * projets dont il est membre, une entreprise qu'à ses propres défis, etc.), qui sont
 * appliqués côté API dans chaque service.
 */
export const PERMISSIONS = [
  // Profils
  "profile:read:own",
  "profile:update:own",
  // Entreprise
  "company:manage",
  "company:members:manage",
  "company:kyc:submit",
  // Défis
  "challenge:read:public",
  "challenge:create",
  "challenge:update:own",
  "challenge:submit",
  "challenge:review",
  // Candidatures / matching
  "application:create",
  "application:read:own",
  "match:run",
  "team:validate:company",
  "team:respond",
  "team:validate:academic",
  // Projets
  "project:read:member",
  "project:mentor",
  // Établissement
  "cohort:manage",
  "credits:grant",
  // Badges / dashboards
  "badge:read:own",
  "dashboard:read:own",
  // Administration
  "admin:access",
  "admin:users:manage",
  "admin:kyc:review",
  "admin:content:manage",
  "admin:skills:manage",
  "admin:audit:read",
  "superadmin:config",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const common: Permission[] = ["profile:read:own", "profile:update:own", "challenge:read:public", "dashboard:read:own"];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ENTREPRISE: [
    ...common,
    "company:manage",
    "company:members:manage",
    "company:kyc:submit",
    "challenge:create",
    "challenge:update:own",
    "challenge:submit",
    "match:run",
    "team:validate:company",
    "project:read:member",
  ],
  ETUDIANT: [
    ...common,
    "application:create",
    "application:read:own",
    "team:respond",
    "project:read:member",
    "badge:read:own",
  ],
  MENTOR: [...common, "project:read:member", "project:mentor"],
  REFERENT_ACADEMIQUE: [
    ...common,
    "cohort:manage",
    "credits:grant",
    "team:validate:academic",
    "project:read:member",
  ],
  ADMIN: [
    ...common,
    "admin:access",
    "admin:users:manage",
    "admin:kyc:review",
    "admin:content:manage",
    "admin:skills:manage",
    "challenge:review",
    "project:read:member",
  ],
  SUPER_ADMIN: [
    ...common,
    "admin:access",
    "admin:users:manage",
    "admin:kyc:review",
    "admin:content:manage",
    "admin:skills:manage",
    "admin:audit:read",
    "challenge:review",
    "project:read:member",
    "superadmin:config",
  ],
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Page d'accueil de l'application après connexion, selon le rôle. */
export function homePathForRole(role: Role): string {
  return role === "ADMIN" || role === "SUPER_ADMIN" ? "/app/admin/tableau-de-bord" : "/app/dashboard";
}

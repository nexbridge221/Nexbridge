import { useQuery } from "@tanstack/react-query";
import type { Role } from "@nexbridge/shared";
import { api } from "./api";
import type { SessionUser } from "@/stores/auth";

export interface Me {
  user: SessionUser;
  phone: string | null;
  profile: null | {
    // Étudiant
    institution?: { id: string; name: string } | null; program?: { id: string; name: string } | null; studyLevel?: string | null; bio?: string | null; city?: string | null; country?: string | null;
    availability?: string | null; availabilityNotes?: string | null; sectorPreferences?: string[]; isPortfolioPublic?: boolean; slug?: string;
    skills?: { skillId: string; level: string; source: string; skill: { id: string; name: string; category: string } }[];
    // Mentor
    yearsExperience?: number | null; indicativeHourlyRate?: number | null; maxConcurrentProjects?: number; expertiseSectors?: string[]; certifications?: string[];
    // Référent
    jobTitle?: string | null; programs?: string[]; institutionId?: string;
  } & Record<string, unknown>;
  company: null | { id: string; legalName: string; sector: string | null; size: string | null; country: string | null; city: string | null; description: string | null; website: string | null; kycStatus: "NON_SOUMIS" | "EN_VERIFICATION" | "VALIDE" | "REFUSE"; kycRejectionReason: string | null; nineaMasked: string | null; rccmMasked: string | null; identifiersProvided: boolean; membership: { isOwner: boolean; contactRole: string; jobTitle: string | null } };
}
export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), staleTime: 30_000 });

/** Taux de complétion du profil (affiché dans le tableau de bord). Retourne aussi ce qui manque. */
export function profileCompletion(role: Role, me: Me): { percent: number; missing: string[] } {
  const checks: [string, boolean][] = [];
  const p = me.profile ?? ({} as NonNullable<Me["profile"]>);
  if (role === "ETUDIANT") {
    checks.push(["établissement", Boolean(p.institution)], ["niveau d'études", Boolean(p.studyLevel)], ["disponibilité", Boolean(p.availability)], ["ville", Boolean(p.city)], ["compétences", (p.skills?.length ?? 0) > 0], ["présentation", Boolean(p.bio)]);
  } else if (role === "MENTOR") {
    checks.push(["biographie", Boolean(p.bio)], ["secteurs d'expertise", (p.expertiseSectors?.length ?? 0) > 0], ["années d'expérience", p.yearsExperience != null]);
  } else if (role === "REFERENT_ACADEMIQUE") {
    checks.push(["fonction", Boolean(p.jobTitle)], ["filières", (p.programs?.length ?? 0) > 0]);
  } else if (role === "ENTREPRISE" && me.company) {
    const c = me.company;
    checks.push(["secteur", Boolean(c.sector)], ["taille", Boolean(c.size)], ["pays", Boolean(c.country)], ["description", Boolean(c.description)], ["identifiants légaux (KYC)", c.identifiersProvided]);
  } else return { percent: 100, missing: [] };
  const done = checks.filter(([, ok]) => ok).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter(([, ok]) => !ok).map(([n]) => n) };
}

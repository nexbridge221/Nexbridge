import type { ChallengeStatus, DeliverableFormat, SkillLevel } from "@nexbridge/shared";

export interface ChallengeDraft {
  id: string; status: ChallengeStatus; title: string; context: string; objectives: string | null; sectorId: string | null; keywords: string[]; teamSize: number; minStudyLevel: string | null;
  desiredStart: string | null; durationWeeks: number | null; budgetAmount: number | null; budgetCurrency: "XOF" | "EUR"; budgetPublic: boolean; paymentTerms: string | null; rejectionReason: string | null;
  skills: { skillId: string; minLevel: SkillLevel; weight: number; skill: { id: string; name: string; category: string } }[];
  deliverables: { id?: string; title: string; format: DeliverableFormat; description?: string | null }[];
  milestones: { id?: string; title: string; description?: string | null; targetWeek: number }[];
  sector: { id: string; name: string } | null; company?: { id: string; legalName: string; kycStatus: string };
  history?: { id: string; from: ChallengeStatus | null; to: ChallengeStatus; note: string | null; at: string }[];
  reviews?: { id: string; decision: string; comment: string | null; createdAt: string }[];
  applications?: number; project?: { id: string; status: string } | null;
}

export interface StudentCard { studentId: string; userId: string; name: string; institution: string | null; program: string | null; studyLevel: string | null; availability: string | null; city: string | null; skills: { name: string; level: SkillLevel; validated: boolean }[] }
export interface ProposalMember extends StudentCard { score: number; penalties: { code: string; label: string }[]; skillScores: { skillId: string; ratio: number; studentLevel: SkillLevel | null; required: SkillLevel; validated: boolean }[] }
export interface Proposal { id: string; rank: number; totalScore: number; diversityScore: number; status: string; explanation: { strengths: string[]; warnings: string[]; coverage: number; avgIndividual: number; fields: number; incomplete: boolean; coveredSkills: number; requiredSkills: number }; members: ProposalMember[] }
export interface MatchView { run: { id: string; engine: string; engineVersion: string; durationMs: number; createdAt: string; poolSize: number } | null; proposals: Proposal[]; message?: string }
export interface TeamView {
  id: string; origin: string; status: "EN_VALIDATION" | "VALIDEE" | "ANNULEE"; steps: { step: "ENTREPRISE" | "ETUDIANTS" | "ACADEMIQUE"; status: string; comment: string | null }[]; project: { id: string; status: string } | null;
  members: { id: string; isLead: boolean; status: "INVITE" | "ACCEPTE" | "DECLINE" | "EXPIRE" | "REMPLACE"; deadlineAt: string; respondedAt: string | null; replaced: boolean; student: StudentCard | undefined }[];
}

export const STATUS_TONE: Record<ChallengeStatus, "neutral" | "amber" | "green" | "blue" | "violet"> = { BROUILLON: "neutral", EN_REVISION: "amber", PUBLIE: "green", EN_COURS: "blue", CLOTURE: "violet", ARCHIVE: "neutral" };
export const STEP_LABELS = { ENTREPRISE: "Validation de l'entreprise", ETUDIANTS: "Acceptation des étudiants", ACADEMIQUE: "Validation académique" } as const;
export const STEP_STATUS_LABELS: Record<string, string> = { EN_ATTENTE: "En attente", VALIDE: "Validé", REFUSE: "Refusé", NON_REQUIS: "Non requis" };
export const timeLeft = (iso: string) => { const ms = new Date(iso).getTime() - Date.now(); if (ms <= 0) return "délai dépassé"; const h = Math.floor(ms / 3600_000); return h >= 24 ? `${Math.floor(h / 24)} j ${h % 24} h` : `${h} h`; };

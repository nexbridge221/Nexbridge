import { z } from "zod";
import { ROLES, SKILL_CATEGORIES, SKILL_LEVELS } from "./enums";

const txt = (max: number) => z.string().trim().max(max);

export const EVALUATION_TYPES = ["ENTREPRISE_PROJET", "ENTREPRISE_ETUDIANT", "MENTOR_ETUDIANT", "ETUDIANT_EXPERIENCE", "PAIR", "ETUDIANT_MENTOR"] as const;
export type EvaluationTypeCode = (typeof EVALUATION_TYPES)[number];
export const EVALUATION_TYPE_LABELS: Record<EvaluationTypeCode, string> = {
  ENTREPRISE_PROJET: "Évaluation du projet par l'entreprise", ENTREPRISE_ETUDIANT: "Évaluation d'un étudiant par l'entreprise", MENTOR_ETUDIANT: "Évaluation d'un étudiant par le mentor",
  ETUDIANT_EXPERIENCE: "Votre expérience sur le projet", PAIR: "Évaluation d'un coéquipier", ETUDIANT_MENTOR: "Évaluation du mentor",
};
/** Évaluations optionnelles (les autres conditionnent la clôture du projet). */
export const OPTIONAL_EVALUATIONS: readonly EvaluationTypeCode[] = ["PAIR", "ETUDIANT_MENTOR"];
export const BADGE_TYPE_LABELS = { COMPETENCE: "Compétence", EXCELLENCE: "Excellence", SECTORIEL: "Sectoriel" } as const;
export const TOP_PERFORMER_THRESHOLD = 4.5;
export const CERTIFICATION_MIN_PROJECTS = 3;
export const SECTOR_BADGE_MIN_PROJECTS = 2;
export const LEADER_MIN_PROJECTS = 3;
export const COMMISSION_MIN_BPS = 1500;
export const COMMISSION_MAX_BPS = 2000;

export const evaluationSchema = z.object({
  type: z.enum(EVALUATION_TYPES),
  subjectUserId: z.string().uuid().nullable().optional(),
  rating: z.number().int().min(1, "Note de 1 à 5").max(5, "Note de 1 à 5"),
  comment: txt(2000).optional(),
  /** Compétences démontrées (évaluations d'étudiants par l'entreprise ou le mentor) */
  skills: z.array(z.object({ skillId: z.string().uuid(), demonstrated: z.enum(SKILL_LEVELS) })).max(12).default([]),
  /** Évaluation du projet : le livrable a-t-il été adopté par l'entreprise ? (badge « Innovateur ») */
  adopted: z.boolean().optional(),
  /** Critères détaillés facultatifs (1 à 5) : collaboration, investissement, communication… */
  criteria: z.record(z.string().max(40), z.number().int().min(1).max(5)).optional(),
});
export const creditDecisionSchema = z.object({ decision: z.enum(["VALIDE", "REFUSE"]), credits: z.number().min(0).max(60).optional(), comment: txt(1000).optional() })
  .superRefine((v, ctx) => {
    if (v.decision === "VALIDE" && v.credits == null) ctx.addIssue({ code: "custom", path: ["credits"], message: "Indiquez le nombre de crédits (0 si aucun)" });
    if (v.decision === "REFUSE" && !v.comment?.trim()) ctx.addIssue({ code: "custom", path: ["comment"], message: "Indiquez le motif du refus" });
  });
export const cohortSchema = z.object({ name: txt(80).min(2), academicYear: z.string().regex(/^\d{4}-\d{4}$/, "Format attendu : 2026-2027") });
export const cohortMembersSchema = z.object({ studentIds: z.array(z.string().uuid()).min(1).max(200) });
export const abuseReportSchema = z.object({ targetType: z.enum(["CHALLENGE", "PROJECT", "USER", "MESSAGE", "EVALUATION"]), targetId: z.string().uuid(), reason: txt(1000).min(10, "Précisez le motif (10 caractères minimum)") });
export const reportHandleSchema = z.object({ status: z.enum(["TRAITE", "REJETE"]), note: txt(1000).optional() });

/* ---- Back-office ---- */
export const adminUserPatchSchema = z.object({
  status: z.enum(["ACTIF", "SUSPENDU"]).optional(), role: z.enum(ROLES).optional(), reason: txt(300).optional(),
  firstName: txt(80).min(1).optional(), lastName: txt(80).min(1).optional(), email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(254).optional(), phone: txt(30).nullable().optional(),
}).refine((v) => v.status || v.role || v.firstName || v.lastName || v.email || v.phone !== undefined, "Aucune modification demandée");
/** Création d'un compte administrateur par un Super Admin : le mot de passe est choisi par la personne via un lien envoyé par e-mail. */
export const adminUserCreateSchema = z.object({ email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(254), firstName: txt(80).min(1), lastName: txt(80).min(1) });
export const adminProjectPatchSchema = z.object({
  name: txt(160).min(2).optional(), description: txt(2000).nullable().optional(),
  status: z.enum(["PLANIFIE", "EN_COURS", "EN_PAUSE", "ANNULE"]).optional(),
  startDate: z.string().date().nullable().optional(), plannedEndDate: z.string().date().nullable().optional(),
  reason: txt(300).optional(),
}).refine((v) => Object.keys(v).some((k) => k !== "reason" && (v as Record<string, unknown>)[k] !== undefined), "Aucune modification demandée");
export const adminChallengeActionSchema = z.object({ comment: txt(1000).optional() });
export const skillAdminSchema = z.object({ name: txt(80).min(2), category: z.enum(SKILL_CATEGORIES) });
export const skillMergeSchema = z.object({ intoId: z.string().uuid() });
export const badgePatchSchema = z.object({ active: z.boolean().optional(), name: txt(80).min(2).optional(), description: txt(300).optional() });
export const evaluationModerationSchema = z.object({ hidden: z.boolean(), reason: txt(300).optional() });
export const testimonialSchema = z.object({ authorName: txt(80).min(2), authorRole: txt(100).optional(), organization: txt(100).optional(), quote: txt(600).min(10), published: z.boolean().default(false), position: z.number().int().min(0).default(0) });
export const partnerSchema = z.object({ name: txt(100).min(2), kind: z.enum(["INSTITUTIONNEL", "ACADEMIQUE", "ENTREPRISE"]), website: z.string().url().max(200).optional().or(z.literal("").transform(() => undefined)), published: z.boolean().default(false), position: z.number().int().min(0).default(0) });
export const faqSchema = z.object({ question: txt(200).min(5), answer: txt(2000).min(5), audience: z.enum(["GENERAL", "ENTREPRISE", "ETUDIANT", "ETABLISSEMENT"]).default("GENERAL"), published: z.boolean().default(true), position: z.number().int().min(0).default(0) });
export const settingsSchema = z.object({
  commissionRateBps: z.number().int().min(COMMISSION_MIN_BPS, "Commission : 15 % minimum").max(COMMISSION_MAX_BPS, "Commission : 20 % maximum").optional(),
  nexmatchWeights: z.object({ skills: z.number().min(0).max(100), education: z.number().min(0).max(100), availability: z.number().min(0).max(100), sector: z.number().min(0).max(100), history: z.number().min(0).max(100), overloadFactor: z.number().min(0.1).max(1), diversityBonus3: z.number().min(0).max(30), diversityBonus2: z.number().min(0).max(30) }).optional(),
});

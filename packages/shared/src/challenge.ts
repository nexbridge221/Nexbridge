import { z } from "zod";
import { CURRENCIES, DELIVERABLE_FORMATS, SKILL_LEVELS, STUDY_LEVELS } from "./enums";

const txt = (max: number) => z.string().trim().max(max);

/** Champs du brief. En brouillon tout est facultatif ; à la soumission, `challengeSubmitSchema` s'applique. */
export const challengeDraftSchema = z.object({
  // Étape 1 — Contexte
  title: txt(150).optional(),
  context: txt(5000).optional(),
  sectorId: z.string().uuid().nullable().optional(),
  keywords: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(10).optional(),
  // Étape 2 — Périmètre
  objectives: txt(3000).optional(),
  deliverables: z.array(z.object({ title: txt(150).min(1), format: z.enum(DELIVERABLE_FORMATS), description: txt(500).optional() })).max(10).optional(),
  // Étape 3 — Équipe
  teamSize: z.number().int().min(2, "2 étudiants minimum").max(8, "8 étudiants maximum").optional(),
  skills: z.array(z.object({ skillId: z.string().uuid(), minLevel: z.enum(SKILL_LEVELS), weight: z.number().int().min(1).max(5).default(1) })).max(12).optional(),
  minStudyLevel: z.enum(STUDY_LEVELS).nullable().optional(),
  // Étape 4 — Calendrier
  desiredStart: z.string().date().nullable().optional(),
  durationWeeks: z.number().int().min(1).max(52).nullable().optional(),
  milestones: z.array(z.object({ title: txt(150).min(1), description: txt(500).optional(), targetWeek: z.number().int().min(1).max(52) })).max(12).optional(),
  // Étape 5 — Budget (en unités principales : FCFA entiers, ou EUR avec 2 décimales)
  budgetAmount: z.number().min(0).max(1_000_000_000).nullable().optional(),
  budgetCurrency: z.enum(CURRENCIES).optional(),
  budgetPublic: z.boolean().optional(),
  paymentTerms: txt(500).nullable().optional(),
});
export type ChallengeDraftInput = z.infer<typeof challengeDraftSchema>;

/** Exigences de soumission (critères de validation du CDC : brief détaillé, budget, compétences, secteur, livrables clairs). */
const noPlaceholder = (v: string) => !/\[(Décrivez|Ex\.)/i.test(v);
export const challengeSubmitSchema = z
  .object({
    title: txt(150).min(10, "Titre : 10 caractères minimum"),
    context: txt(5000).min(80, "Description de la problématique : 80 caractères minimum").refine(noPlaceholder, "Remplacez les passages entre crochets du modèle par votre contexte réel"),
    sectorId: z.string().uuid("Choisissez un secteur"),
    objectives: txt(3000).min(30, "Objectifs : 30 caractères minimum").refine(noPlaceholder, "Remplacez les passages entre crochets du modèle par vos objectifs réels"),
    deliverables: z.array(z.object({ title: z.string().min(1), format: z.enum(DELIVERABLE_FORMATS) })).min(1, "Ajoutez au moins un livrable"),
    teamSize: z.number().int().min(2).max(8),
    skills: z.array(z.object({ skillId: z.string().uuid() })).min(1, "Sélectionnez au moins une compétence requise"),
    durationWeeks: z.number().int().min(1).max(52, "Durée : 52 semaines maximum"),
    budgetAmount: z.number().positive("Renseignez un budget"),
    budgetCurrency: z.enum(CURRENCIES),
    milestones: z.array(z.object({ targetWeek: z.number().int() })).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.milestones.some((m) => m.targetWeek > v.durationWeeks)) ctx.addIssue({ code: "custom", path: ["milestones"], message: "Un jalon dépasse la durée du projet" });
  });

export const challengeReviewSchema = z
  .object({
    decision: z.enum(["APPROUVE", "REFUSE"]),
    comment: txt(1500).optional(),
    checklist: z.object({ detail: z.boolean(), budget: z.boolean(), skills: z.boolean(), sector: z.boolean(), deliverables: z.boolean() }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "REFUSE" && !v.comment?.trim()) ctx.addIssue({ code: "custom", path: ["comment"], message: "Indiquez le motif du refus" });
    if (v.decision === "APPROUVE" && v.checklist && !Object.values(v.checklist).every(Boolean)) ctx.addIssue({ code: "custom", path: ["checklist"], message: "Tous les critères doivent être validés pour approuver" });
  });

export const kycReviewSchema = z
  .object({ decision: z.enum(["VALIDE", "REFUSE"]), reason: txt(1000).optional() })
  .superRefine((v, ctx) => { if (v.decision === "REFUSE" && !v.reason?.trim()) ctx.addIssue({ code: "custom", path: ["reason"], message: "Indiquez le motif du refus" }); });

export const institutionReviewSchema = z.object({ decision: z.enum(["VALIDE", "REFUSE"]) });

export const applicationSchema = z.object({ motivation: txt(1500).min(20, "Motivation : 20 caractères minimum") });

export const manualTeamSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(2, "Une équipe compte au moins 2 étudiants").max(8),
  leadId: z.string().uuid().optional(),
});
export const teamRespondSchema = z.object({ accept: z.boolean() });
export const academicDecisionSchema = z
  .object({ decision: z.enum(["VALIDE", "REFUSE"]), comment: txt(1000).optional() })
  .superRefine((v, ctx) => { if (v.decision === "REFUSE" && !v.comment?.trim()) ctx.addIssue({ code: "custom", path: ["comment"], message: "Indiquez le motif du refus" }); });
export const assignMentorSchema = z.object({ mentorUserId: z.string().uuid() });

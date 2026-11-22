import { z } from "zod";

const txt = (max: number) => z.string().trim().max(max);
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Date invalide");

export const TASK_STATUSES = ["A_FAIRE", "EN_COURS", "EN_REVISION", "TERMINE"] as const;
export type TaskStatusCode = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatusCode, string> = { A_FAIRE: "À faire", EN_COURS: "En cours", EN_REVISION: "En révision", TERMINE: "Terminé" };
export const TASK_PRIORITIES = ["BASSE", "NORMALE", "HAUTE", "URGENTE"] as const;
export type TaskPriorityCode = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABELS: Record<TaskPriorityCode, string> = { BASSE: "Basse", NORMALE: "Normale", HAUTE: "Haute", URGENTE: "Urgente" };

export const MILESTONE_STATUS_LABELS = { A_VENIR: "À venir", EN_COURS: "En cours", PRET: "Prêt pour validation", VALIDE: "Validé", MANQUE: "Manqué" } as const;
export const DELIVERABLE_STATUSES = ["A_PRODUIRE", "EN_PREPARATION", "SOUMIS", "EN_REVISION", "A_CORRIGER", "VALIDE"] as const;
export const DELIVERABLE_STATUS_LABELS = { A_PRODUIRE: "À produire", EN_PREPARATION: "En préparation", SOUMIS: "Soumis", EN_REVISION: "En révision", A_CORRIGER: "À corriger", VALIDE: "Validé" } as const;
export const DOC_VISIBILITIES = ["TOUS", "EQUIPE_ET_MENTOR", "EQUIPE_SEULE"] as const;
export const DOC_VISIBILITY_LABELS = { TOUS: "Tous les membres", EQUIPE_ET_MENTOR: "Équipe et mentor", EQUIPE_SEULE: "Équipe seule" } as const;
export const MEETING_TYPES = ["KICKOFF", "JALON", "SOUTENANCE", "COURANTE"] as const;
export const MEETING_TYPE_LABELS = { KICKOFF: "Lancement", JALON: "Jalon", SOUTENANCE: "Soutenance", COURANTE: "Réunion courante" } as const;
export const PROJECT_ROLE_LABELS = { CONTACT_ENTREPRISE: "Entreprise", CHEF_PROJET: "Chef de projet", ETUDIANT: "Étudiant", MENTOR: "Mentor", REFERENT: "Référent académique" } as const;

/** Limites de fichiers (CDC) : 25 Mo par défaut, vidéos MP4 jusqu'à 200 Mo. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = [
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png", "image/jpeg", "video/mp4", "application/zip", "application/x-zip-compressed",
] as const;
export const EMOJIS = ["👍", "🎉", "❤️", "😂", "🙏", "👀", "✅"] as const;

export const taskCreateSchema = z.object({
  title: txt(160).min(1, "Titre obligatoire"),
  description: txt(5000).optional(),
  status: z.enum(TASK_STATUSES).default("A_FAIRE"),
  priority: z.enum(TASK_PRIORITIES).default("NORMALE"),
  startDate: isoDate.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).max(10).default([]),
  labelIds: z.array(z.string().uuid()).max(10).default([]),
});
export const taskUpdateSchema = taskCreateSchema.omit({ parentTaskId: true }).partial();
export const taskMoveSchema = z.object({ status: z.enum(TASK_STATUSES), beforeId: z.string().uuid().nullable().optional(), afterId: z.string().uuid().nullable().optional() });
export const commentSchema = z.object({ body: txt(2000).min(1, "Commentaire vide") });
export const labelSchema = z.object({ name: txt(40).min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3B82F6") });
export const milestoneSchema = z.object({ title: txt(160).min(1, "Titre obligatoire"), description: txt(1000).optional(), targetDate: isoDate, ownerId: z.string().uuid().nullable().optional() });
export const folderSchema = z.object({ name: txt(80).min(1), parentId: z.string().uuid().nullable().optional(), visibility: z.enum(DOC_VISIBILITIES).default("TOUS") });
export const documentUpdateSchema = z.object({ name: txt(160).min(1).optional(), folderId: z.string().uuid().nullable().optional(), visibility: z.enum(DOC_VISIBILITIES).optional() });
export const channelCreateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("THEMATIQUE"), name: txt(60).min(2) }),
  z.object({ type: z.literal("DIRECT"), userId: z.string().uuid() }),
]);
export const messageSchema = z.object({ body: txt(4000).default(""), parentId: z.string().uuid().nullable().optional(), mentions: z.array(z.string().uuid()).max(20).default([]), fileId: z.string().uuid().nullable().optional() })
  .refine((v) => v.body.trim().length > 0 || v.fileId, { message: "Message vide", path: ["body"] });
export const reactionSchema = z.object({ emoji: z.enum(EMOJIS) });
export const deliverableSchema = z.object({ name: txt(160).min(1), description: txt(1000).optional(), expectedFormat: txt(60).optional(), dueDate: isoDate.nullable().optional(), ownerId: z.string().uuid().nullable().optional(), milestoneId: z.string().uuid().nullable().optional() });
export const deliverableSubmitSchema = z.object({ documentId: z.string().uuid(), note: txt(500).optional() });
export const deliverableReviewSchema = z.object({ decision: z.enum(["COMMENTAIRE", "CORRECTION", "APPROUVE", "VALIDE"]), comment: txt(1500).optional() })
  .superRefine((v, ctx) => { if ((v.decision === "CORRECTION" || v.decision === "COMMENTAIRE") && !v.comment?.trim()) ctx.addIssue({ code: "custom", path: ["comment"], message: "Un commentaire est obligatoire" }); });
export const meetingSchema = z.object({
  title: txt(160).min(1), type: z.enum(MEETING_TYPES).default("COURANTE"), startsAt: isoDate, durationMin: z.number().int().min(5).max(480).default(60),
  agenda: txt(2000).optional(), description: txt(2000).optional(), videoUrl: z.string().url().max(300).nullable().optional(), generateVideo: z.boolean().default(true), participantIds: z.array(z.string().uuid()).max(30).default([]),
});
export const meetingUpdateSchema = meetingSchema.partial().extend({ minutes: txt(10000).nullable().optional() });
export const rsvpSchema = z.object({ rsvp: z.enum(["ACCEPTE", "REFUSE"]) });
export const reportSchema = z.object({ weekStart: isoDate, summary: txt(3000).min(10, "Résumé : 10 caractères minimum"), risks: txt(2000).optional(), nextSteps: txt(2000).optional(), health: z.enum(["VERT", "ORANGE", "ROUGE"]).default("VERT"), visibleToCompany: z.boolean().default(true), visibleToReferent: z.boolean().default(true) });

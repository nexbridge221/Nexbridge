import { z } from "zod";
import {
  AVAILABILITIES,
  COMPANY_CONTACT_ROLES,
  COMPANY_SIZES,
  KYC_DOCUMENT_TYPES,
  SELF_REGISTRATION_ROLES,
  SKILL_LEVELS,
  STUDY_LEVELS,
} from "./enums";

/** Mot de passe : 10 caractères minimum, avec au moins une lettre et un chiffre. */
export const passwordSchema = z
  .string()
  .min(10, "10 caractères minimum")
  .max(128, "128 caractères maximum")
  .regex(/[A-Za-zÀ-ÿ]/, "Doit contenir au moins une lettre")
  .regex(/\d/, "Doit contenir au moins un chiffre");

const emailSchema = z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(254);
const nameSchema = z.string().trim().min(1, "Obligatoire").max(80);

export const registerSchema = z.object({
  role: z.enum(SELF_REGISTRATION_ROLES),
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  /** Raison sociale (rôle ENTREPRISE) */
  organizationName: z.string().trim().min(2).max(160).optional(),
  /** Nom de l'établissement (rôle REFERENT_ACADEMIQUE) */
  institutionName: z.string().trim().min(2).max(160).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Vous devez accepter les CGU et la politique de confidentialité" }) }),
}).superRefine((v, ctx) => {
  if (v.role === "ENTREPRISE" && !v.organizationName) {
    ctx.addIssue({ code: "custom", path: ["organizationName"], message: "La raison sociale est obligatoire" });
  }
  if (v.role === "REFERENT_ACADEMIQUE" && !v.institutionName) {
    ctx.addIssue({ code: "custom", path: ["institutionName"], message: "L'établissement est obligatoire" });
  }
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Obligatoire").max(128),
  /** Code TOTP à 6 chiffres si la 2FA est activée */
  totp: z.string().regex(/^\d{6}$/, "Code à 6 chiffres").optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

export const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Code à 6 chiffres") });

/* ---------- Profils ---------- */

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

export const studentProfileSchema = z.object({
  institutionName: optionalText(160),
  programName: optionalText(160),
  studyLevel: z.enum(STUDY_LEVELS).optional(),
  bio: optionalText(1500),
  city: optionalText(80),
  country: optionalText(80),
  availability: z.enum(AVAILABILITIES).optional(),
  availabilityNotes: optionalText(300),
  sectorPreferences: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  isPortfolioPublic: z.boolean().optional(),
});
export type StudentProfileInput = z.infer<typeof studentProfileSchema>;

export const userSkillsSchema = z.object({
  skills: z.array(z.object({ skillId: z.string().uuid(), level: z.enum(SKILL_LEVELS) })).max(60),
});

export const mentorProfileSchema = z.object({
  bio: optionalText(1500),
  yearsExperience: z.number().int().min(0).max(60).optional(),
  indicativeHourlyRate: z.number().int().min(0).max(1_000_000).optional(),
  maxConcurrentProjects: z.number().int().min(1).max(10).optional(),
  expertiseSectors: z.array(z.string().trim().min(1).max(60)).max(15).optional(),
  certifications: z.array(z.string().trim().min(1).max(120)).max(15).optional(),
});
export type MentorProfileInput = z.infer<typeof mentorProfileSchema>;

export const companyProfileSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  sector: optionalText(80),
  size: z.enum(COMPANY_SIZES).optional(),
  country: optionalText(80),
  city: optionalText(80),
  description: optionalText(2000),
  website: z.string().trim().url("URL invalide").max(200).optional().or(z.literal("").transform(() => undefined)),
});
export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

export const companyIdentifiersSchema = z.object({
  ninea: z.string().trim().min(5, "NINEA trop court").max(30),
  rccm: z.string().trim().min(5, "RCCM trop court").max(40),
});

export const companyMemberInviteSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  jobTitle: optionalText(80),
  contactRole: z.enum(COMPANY_CONTACT_ROLES),
});

export const kycDocumentTypeSchema = z.enum(KYC_DOCUMENT_TYPES);

export const referentProfileSchema = z.object({
  jobTitle: optionalText(100),
  programs: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
});

export const institutionSchema = z.object({
  name: z.string().trim().min(2).max(160),
  country: optionalText(80),
  city: optionalText(80),
  website: z.string().trim().url().max(200).optional().or(z.literal("").transform(() => undefined)),
});

export const updateAccountSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: optionalText(30),
  locale: z.enum(["fr", "en"]).optional(),
});

export const notificationPreferenceSchema = z.object({
  type: z.string().min(1).max(60),
  inApp: z.boolean(),
  email: z.boolean(),
});

/* ---------- Contenus publics ---------- */

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(100),
  email: emailSchema,
  organization: optionalText(120),
  subject: z.string().trim().min(3, "Objet trop court").max(150),
  message: z.string().trim().min(10, "Message trop court").max(4000),
  consent: z.literal(true, { errorMap: () => ({ message: "Votre consentement est requis" }) }),
  /** Champ piège anti-spam : doit rester vide */
  website: z.string().max(0).optional(),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

export const newsletterSchema = z.object({
  email: emailSchema,
  consent: z.literal(true, { errorMap: () => ({ message: "Votre consentement est requis" }) }),
  website: z.string().max(0).optional(),
});
export type NewsletterInput = z.infer<typeof newsletterSchema>;

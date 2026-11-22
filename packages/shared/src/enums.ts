/**
 * Énumérations métier partagées entre l'API et l'interface.
 * Les valeurs sont celles stockées en base (voir prisma/schema.prisma).
 */

export const ROLES = [
  "ENTREPRISE",
  "ETUDIANT",
  "MENTOR",
  "REFERENT_ACADEMIQUE",
  "ADMIN",
  "SUPER_ADMIN",
] as const;
export type Role = (typeof ROLES)[number];

/** Rôles qu'un visiteur peut choisir à l'inscription (jamais ADMIN / SUPER_ADMIN). */
export const SELF_REGISTRATION_ROLES = ["ENTREPRISE", "ETUDIANT", "MENTOR", "REFERENT_ACADEMIQUE"] as const;
export type SelfRegistrationRole = (typeof SELF_REGISTRATION_ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ENTREPRISE: "Entreprise",
  ETUDIANT: "Étudiant",
  MENTOR: "Expert / Mentor",
  REFERENT_ACADEMIQUE: "Référent académique",
  ADMIN: "Administrateur",
  SUPER_ADMIN: "Super administrateur",
};

export const USER_STATUSES = ["EN_ATTENTE_EMAIL", "ACTIF", "SUSPENDU", "ANONYMISE"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const SKILL_LEVELS = ["SENSIBILISE", "PRATICIEN", "CONFIRME", "EXPERT"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  SENSIBILISE: "Sensibilisé",
  PRATICIEN: "Praticien",
  CONFIRME: "Confirmé",
  EXPERT: "Expert",
};

export const SKILL_CATEGORIES = ["TECHNIQUE", "METIER", "TRANSVERSALE", "SECTORIELLE"] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  TECHNIQUE: "Techniques",
  METIER: "Métiers",
  TRANSVERSALE: "Transversales",
  SECTORIELLE: "Sectorielles",
};

export const AVAILABILITIES = ["PLEIN_TEMPS", "PARTIEL", "WEEK_END"] as const;
export type Availability = (typeof AVAILABILITIES)[number];
export const AVAILABILITY_LABELS: Record<Availability, string> = {
  PLEIN_TEMPS: "Plein temps",
  PARTIEL: "Temps partiel",
  WEEK_END: "Week-end",
};

export const KYC_STATUSES = ["NON_SOUMIS", "EN_VERIFICATION", "VALIDE", "REFUSE"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  NON_SOUMIS: "Non soumis",
  EN_VERIFICATION: "En vérification",
  VALIDE: "Validé",
  REFUSE: "Refusé",
};

export const COMPANY_SIZES = ["TPE", "PME", "ETI", "GRANDE_ENTREPRISE", "ORGANISATION_PUBLIQUE", "ONG"] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];
export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  TPE: "Très petite entreprise (< 10)",
  PME: "PME (10 – 249)",
  ETI: "ETI (250 – 4 999)",
  GRANDE_ENTREPRISE: "Grande entreprise (5 000+)",
  ORGANISATION_PUBLIQUE: "Organisation publique",
  ONG: "ONG / Association",
};

export const COMPANY_CONTACT_ROLES = ["DRH", "DIR_INNOVATION", "CHEF_PROJET", "AUTRE"] as const;
export type CompanyContactRole = (typeof COMPANY_CONTACT_ROLES)[number];
export const COMPANY_CONTACT_ROLE_LABELS: Record<CompanyContactRole, string> = {
  DRH: "DRH",
  DIR_INNOVATION: "Directeur Innovation",
  CHEF_PROJET: "Chef de projet",
  AUTRE: "Autre",
};

export const STUDY_LEVELS = ["L1", "L2", "L3", "M1", "M2", "DOCTORAT", "AUTRE"] as const;
export type StudyLevel = (typeof STUDY_LEVELS)[number];
export const STUDY_LEVEL_LABELS: Record<StudyLevel, string> = {
  L1: "Licence 1",
  L2: "Licence 2",
  L3: "Licence 3",
  M1: "Master 1",
  M2: "Master 2",
  DOCTORAT: "Doctorat",
  AUTRE: "Autre",
};

export const KYC_DOCUMENT_TYPES = ["NINEA", "RCCM", "AUTRE"] as const;
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];

/** Statuts d'un défi (machine à états unique, décision I1 du dossier de conception). */
export const CHALLENGE_STATUSES = ["BROUILLON", "EN_REVISION", "PUBLIE", "EN_COURS", "CLOTURE", "ARCHIVE"] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

export const CHALLENGE_STATUS_LABELS: Record<ChallengeStatus, string> = {
  BROUILLON: "Brouillon", EN_REVISION: "En révision", PUBLIE: "Publié", EN_COURS: "En cours", CLOTURE: "Clôturé", ARCHIVE: "Archivé",
};
export const DELIVERABLE_FORMATS = ["RAPPORT", "PROTOTYPE", "CODE", "PRESENTATION", "AUTRE"] as const;
export type DeliverableFormat = (typeof DELIVERABLE_FORMATS)[number];
export const DELIVERABLE_FORMAT_LABELS: Record<DeliverableFormat, string> = { RAPPORT: "Rapport", PROTOTYPE: "Prototype", CODE: "Code", PRESENTATION: "Présentation", AUTRE: "Autre" };
export const CURRENCIES = ["XOF", "EUR"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
export const APPLICATION_STATUS_LABELS = { SOUMISE: "Soumise", PRE_SELECTIONNEE: "Présélectionnée", ACCEPTEE: "Acceptée", REFUSEE: "Refusée", RETIREE: "Retirée" } as const;
export const TEAM_MEMBER_STATUS_LABELS = { INVITE: "En attente de réponse", ACCEPTE: "Accepté", DECLINE: "Décliné", EXPIRE: "Délai dépassé", REMPLACE: "Remplacé" } as const;

/** Statuts de défi autorisés à la modification par l'entreprise (règle du CDC §3.2.3). */
export const EDITABLE_CHALLENGE_STATUSES: readonly ChallengeStatus[] = ["BROUILLON", "EN_REVISION"];
export const TEAM_RESPONSE_DEADLINE_HOURS = 72;
export const TEAM_REMINDER_EVERY_HOURS = 24;

import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import { z } from "zod";
import {
  companyIdentifiersSchema,
  companyMemberInviteSchema,
  companyProfileSchema,
  kycDocumentTypeSchema,
  mentorProfileSchema,
  notificationPreferenceSchema,
  referentProfileSchema,
  studentProfileSchema,
  updateAccountSchema,
  userSkillsSchema,
} from "@nexbridge/shared";
import { badRequest, conflict, decrypt, encrypt, forbidden, notFound, prisma, randomToken, sha256, slugify } from "../../platform/core";
import { audit, authenticate, requirePermission, requireRoles, requireVerifiedEmail, validateBody } from "../../platform/http";
import { KYC_ALLOWED_MIME, KYC_MAX_BYTES, readFileObject, saveUpload } from "../../platform/storage";
import { emails, mail } from "../../platform/mail";
import { serializeUser } from "../auth/service";

export const profileRouter = Router();
profileRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: KYC_MAX_BYTES, files: 1 } });

/* ============ Helpers ============ */
async function ownCompanyMembership(userId: string) {
  const m = await prisma.companyMember.findFirst({ where: { userId }, include: { company: true } });
  if (!m) throw notFound("Aucune organisation rattachée à ce compte");
  return m;
}

function companyView(company: { ninea: string | null; rccm: string | null } & Record<string, unknown>) {
  const mask = (v: string | null) => {
    if (!v) return null;
    try {
      const plain = decrypt(v);
      return plain.length <= 4 ? "••••" : `${"•".repeat(plain.length - 3)}${plain.slice(-3)}`;
    } catch {
      return "••••";
    }
  };
  const { ninea, rccm, ...rest } = company;
  return { ...rest, nineaMasked: mask(ninea), rccmMasked: mask(rccm), identifiersProvided: Boolean(ninea && rccm) };
}

/* ============ Profil complet ============ */
profileRouter.get("/me", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id } });
  const base = { user: await serializeUser(user), profile: null as unknown, company: null as unknown };

  if (user.role === "ETUDIANT") {
    base.profile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
      include: { institution: { select: { id: true, name: true } }, program: { select: { id: true, name: true } }, skills: { include: { skill: true } } },
    });
  } else if (user.role === "MENTOR") {
    base.profile = await prisma.mentorProfile.findUnique({ where: { userId: user.id } });
  } else if (user.role === "REFERENT_ACADEMIQUE") {
    base.profile = await prisma.referentProfile.findUnique({ where: { userId: user.id }, include: { institution: true } });
  } else if (user.role === "ENTREPRISE") {
    const m = await prisma.companyMember.findFirst({ where: { userId: user.id }, include: { company: true } });
    if (m) base.company = { ...companyView(m.company), membership: { isOwner: m.isOwner, contactRole: m.contactRole, jobTitle: m.jobTitle } };
  }
  res.json({ ...base, phone: user.phone });
});

profileRouter.patch("/me/account", validateBody(updateAccountSchema), async (req, res) => {
  const user = await prisma.user.update({ where: { id: req.auth!.id }, data: req.body });
  await audit(req, "account.updated");
  res.json({ user: await serializeUser(user) });
});

/* ============ Étudiant ============ */
profileRouter.put("/me/student-profile", requireRoles("ETUDIANT"), validateBody(studentProfileSchema), async (req, res) => {
  const { institutionName, programName, ...rest } = req.body as z.infer<typeof studentProfileSchema>;
  let institutionId: string | null | undefined;
  let programId: string | null | undefined;
  if (institutionName !== undefined) {
    const inst = institutionName
      ? ((await prisma.institution.findFirst({ where: { name: { equals: institutionName, mode: "insensitive" } } })) ?? (await prisma.institution.create({ data: { name: institutionName } })))
      : null;
    institutionId = inst?.id ?? null;
    if (inst && programName) {
      const prog = await prisma.program.upsert({ where: { institutionId_name: { institutionId: inst.id, name: programName } }, create: { institutionId: inst.id, name: programName }, update: {} });
      programId = prog.id;
    } else programId = null;
  }
  const profile = await prisma.studentProfile.update({
    where: { userId: req.auth!.id },
    data: { ...rest, ...(institutionId !== undefined ? { institutionId, programId } : {}) },
  });
  res.json({ profile });
});

profileRouter.put("/me/student-skills", requireRoles("ETUDIANT"), validateBody(userSkillsSchema), async (req, res) => {
  const { skills } = req.body as z.infer<typeof userSkillsSchema>;
  const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: req.auth!.id } });
  const ids = [...new Set(skills.map((s) => s.skillId))];
  const valid = await prisma.skill.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
  if (valid.length !== ids.length) throw badRequest("Une ou plusieurs compétences sont inconnues", "UNKNOWN_SKILL");
  await prisma.$transaction(async (tx) => {
    // On ne touche pas aux compétences validées par un projet ou certifiées (source ≠ DECLARE).
    const locked = await tx.studentSkill.findMany({ where: { studentId: profile.id, source: { not: "DECLARE" } }, select: { skillId: true } });
    const lockedIds = new Set(locked.map((l) => l.skillId));
    await tx.studentSkill.deleteMany({ where: { studentId: profile.id, source: "DECLARE", skillId: { notIn: [...lockedIds] } } });
    for (const s of skills) {
      if (lockedIds.has(s.skillId)) continue;
      await tx.studentSkill.upsert({
        where: { studentId_skillId: { studentId: profile.id, skillId: s.skillId } },
        create: { studentId: profile.id, skillId: s.skillId, level: s.level, source: "DECLARE" },
        update: { level: s.level },
      });
    }
  });
  const result = await prisma.studentSkill.findMany({ where: { studentId: profile.id }, include: { skill: true } });
  res.json({ skills: result });
});

/* ============ Mentor / Référent ============ */
profileRouter.put("/me/mentor-profile", requireRoles("MENTOR"), validateBody(mentorProfileSchema), async (req, res) => {
  const { expertiseSectors, certifications, ...rest } = req.body as z.infer<typeof mentorProfileSchema>;
  const profile = await prisma.mentorProfile.update({
    where: { userId: req.auth!.id },
    data: { ...rest, ...(expertiseSectors ? { expertiseSectors } : {}), ...(certifications ? { certifications } : {}) },
  });
  res.json({ profile });
});

profileRouter.put("/me/referent-profile", requireRoles("REFERENT_ACADEMIQUE"), validateBody(referentProfileSchema), async (req, res) => {
  const profile = await prisma.referentProfile.update({ where: { userId: req.auth!.id }, data: req.body });
  res.json({ profile });
});

/* ============ Fin d'onboarding ============ */
profileRouter.post("/me/onboarding/complete", async (req, res) => {
  const uid = req.auth!.id;
  switch (req.auth!.role) {
    case "ETUDIANT": {
      const p = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: uid }, include: { _count: { select: { skills: true } } } });
      const missing: string[] = [];
      if (!p.institutionId) missing.push("établissement");
      if (!p.studyLevel) missing.push("niveau d'études");
      if (!p.availability) missing.push("disponibilité");
      if (p._count.skills === 0) missing.push("au moins une compétence");
      if (missing.length) throw badRequest(`Profil incomplet : ${missing.join(", ")}`, "PROFILE_INCOMPLETE", { missing });
      await prisma.studentProfile.update({ where: { userId: uid }, data: { onboardingDone: true } });
      break;
    }
    case "MENTOR": {
      const p = await prisma.mentorProfile.findUniqueOrThrow({ where: { userId: uid } });
      if (!p.bio || p.expertiseSectors.length === 0) throw badRequest("Profil incomplet : biographie et au moins un secteur d'expertise", "PROFILE_INCOMPLETE");
      await prisma.mentorProfile.update({ where: { userId: uid }, data: { onboardingDone: true } });
      break;
    }
    case "REFERENT_ACADEMIQUE":
      await prisma.referentProfile.update({ where: { userId: uid }, data: { onboardingDone: true } });
      break;
    default:
      break; // Entreprise : l'onboarding est déduit des champs secteur + pays ; admins : sans objet.
  }
  res.json({ ok: true });
});

/* ============ Entreprise ============ */
const companyRouter = Router();
companyRouter.use(requireRoles("ENTREPRISE"));

companyRouter.get("/", async (req, res) => {
  const m = await ownCompanyMembership(req.auth!.id);
  const [documents, members] = await Promise.all([
    prisma.kycDocument.findMany({ where: { companyId: m.companyId }, orderBy: { createdAt: "desc" }, include: { file: { select: { id: true, originalName: true, size: true, mime: true, scanStatus: true } } } }),
    prisma.companyMember.findMany({ where: { companyId: m.companyId }, include: { user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  res.json({ company: companyView(m.company), isOwner: m.isOwner, documents, members });
});

companyRouter.put("/", validateBody(companyProfileSchema), async (req, res) => {
  const m = await ownCompanyMembership(req.auth!.id);
  const company = await prisma.company.update({ where: { id: m.companyId }, data: req.body });
  await audit(req, "company.updated", { entityType: "Company", entityId: company.id });
  res.json({ company: companyView(company) });
});

companyRouter.post("/identifiers", requirePermission("company:kyc:submit"), validateBody(companyIdentifiersSchema), async (req, res) => {
  const m = await ownCompanyMembership(req.auth!.id);
  if (!m.isOwner) throw forbidden("Seul le propriétaire du compte peut renseigner ces informations");
  const { ninea, rccm } = req.body as z.infer<typeof companyIdentifiersSchema>;
  await prisma.company.update({ where: { id: m.companyId }, data: { ninea: encrypt(ninea), rccm: encrypt(rccm) } });
  await audit(req, "company.identifiers_set", { entityType: "Company", entityId: m.companyId });
  res.json({ ok: true });
});

companyRouter.post("/kyc-documents", requirePermission("company:kyc:submit"), requireVerifiedEmail, upload.single("file"), async (req, res) => {
  const m = await ownCompanyMembership(req.auth!.id);
  if (!m.isOwner) throw forbidden("Seul le propriétaire du compte peut déposer des pièces justificatives");
  if (!req.file) throw badRequest("Aucun fichier reçu");
  const type = kycDocumentTypeSchema.safeParse(req.body?.type);
  if (!type.success) throw badRequest("Type de document invalide");
  if (m.company.kycStatus === "VALIDE") throw conflict("Votre organisation est déjà validée");
  const file = await saveUpload({ ownerId: req.auth!.id, originalName: req.file.originalname, data: req.file.buffer, allowedMime: KYC_ALLOWED_MIME, maxBytes: KYC_MAX_BYTES });
  const doc = await prisma.kycDocument.create({ data: { companyId: m.companyId, type: type.data, fileId: file.id } });
  // Dès qu'une pièce est déposée et que les identifiants sont renseignés, le dossier passe « en vérification ».
  if (m.company.ninea && m.company.rccm) {
    await prisma.company.update({ where: { id: m.companyId }, data: { kycStatus: "EN_VERIFICATION", kycRejectionReason: null } });
  }
  await audit(req, "company.kyc_document_uploaded", { entityType: "KycDocument", entityId: doc.id });
  res.status(201).json({ document: doc });
});

companyRouter.post("/members", requirePermission("company:members:manage"), requireVerifiedEmail, validateBody(companyMemberInviteSchema), async (req, res) => {
  const m = await ownCompanyMembership(req.auth!.id);
  if (!m.isOwner) throw forbidden("Seul le propriétaire du compte peut ajouter des collaborateurs");
  const input = req.body as z.infer<typeof companyMemberInviteSchema>;
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("Un compte existe déjà avec cette adresse e-mail", "EMAIL_TAKEN");
  const user = await prisma.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: "ENTREPRISE",
      status: "EN_ATTENTE_EMAIL",
      companyMemberships: { create: { companyId: m.companyId, jobTitle: input.jobTitle, contactRole: input.contactRole } },
    },
  });
  // Le collaborateur choisit son mot de passe via le lien (qui confirme aussi son adresse).
  const raw = randomToken(32);
  await prisma.emailToken.create({ data: { userId: user.id, type: "RESET", tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3600_000) } });
  await mail.send(emails.invitation(user.email, user.firstName, m.company.legalName, raw));
  await audit(req, "company.member_invited", { entityType: "User", entityId: user.id });
  res.status(201).json({ member: { id: user.id, email: user.email } });
});

companyRouter.delete("/members/:userId", requirePermission("company:members:manage"), async (req, res) => {
  const m = await ownCompanyMembership(req.auth!.id);
  if (!m.isOwner) throw forbidden("Seul le propriétaire du compte peut retirer un collaborateur");
  const target = await prisma.companyMember.findUnique({ where: { userId_companyId: { userId: String(req.params.userId), companyId: m.companyId } } });
  if (!target) throw notFound("Collaborateur introuvable");
  if (target.isOwner) throw badRequest("Le propriétaire du compte ne peut pas être retiré");
  await prisma.companyMember.delete({ where: { id: target.id } });
  await audit(req, "company.member_removed", { entityType: "User", entityId: target.userId });
  res.status(204).end();
});

profileRouter.use("/company", companyRouter);

/* ============ Téléchargement de fichier (droits contrôlés) ============ */
profileRouter.get("/files/:id", async (req, res) => {
  const id = String(req.params.id);
  const file = await prisma.fileObject.findUnique({ where: { id }, include: { kycDocuments: { select: { companyId: true } } } });
  if (!file) throw notFound("Fichier introuvable");
  let allowed = file.ownerId === req.auth!.id || req.auth!.role === "ADMIN" || req.auth!.role === "SUPER_ADMIN";
  if (!allowed && file.kycDocuments.length) {
    const membership = await prisma.companyMember.findFirst({ where: { userId: req.auth!.id, companyId: { in: file.kycDocuments.map((k) => k.companyId) } } });
    allowed = Boolean(membership);
  }
  if (!allowed) throw notFound("Fichier introuvable"); // 404 plutôt que 403 : on ne confirme pas l'existence
  const { data } = await readFileObject(id);
  res.setHeader("Content-Type", file.mime);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(data);
});

/* ============ Confidentialité, export, suppression ============ */
profileRouter.get("/me/privacy", async (req, res) => {
  const consents = await prisma.consent.findMany({ where: { userId: req.auth!.id }, orderBy: { grantedAt: "desc" } });
  res.json({ consents });
});

profileRouter.get("/me/export", async (req, res) => {
  const uid = req.auth!.id;
  const [user, student, mentor, referent, memberships, consents, notifications] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: uid }, select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, locale: true, createdAt: true, lastLoginAt: true } }),
    prisma.studentProfile.findUnique({ where: { userId: uid }, include: { skills: { include: { skill: true } }, portfolio: true } }),
    prisma.mentorProfile.findUnique({ where: { userId: uid } }),
    prisma.referentProfile.findUnique({ where: { userId: uid } }),
    prisma.companyMember.findMany({ where: { userId: uid }, include: { company: { select: { legalName: true, sector: true, country: true, city: true } } } }),
    prisma.consent.findMany({ where: { userId: uid } }),
    prisma.notification.findMany({ where: { userId: uid }, take: 500, orderBy: { createdAt: "desc" } }),
  ]);
  await audit(req, "account.data_exported");
  res.setHeader("Content-Disposition", 'attachment; filename="nexbridge-mes-donnees.json"');
  res.json({ exportedAt: new Date().toISOString(), user, student, mentor, referent, memberships, consents, notifications });
});

/** Droit à l'oubli : anonymisation (les données partagées avec d'autres acteurs restent cohérentes). */
profileRouter.post("/me/delete-account", validateBody(z.object({ password: z.string().min(1) })), async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id } });
  if (!user.passwordHash || !(await bcrypt.compare(req.body.password, user.passwordHash))) throw badRequest("Mot de passe incorrect", "INVALID_CREDENTIALS");
  if (req.auth!.role === "ADMIN" || req.auth!.role === "SUPER_ADMIN") throw forbidden("Un compte administrateur ne peut pas être supprimé ici");
  const owned = await prisma.companyMember.findFirst({ where: { userId: user.id, isOwner: true }, include: { company: { include: { _count: { select: { members: true } } } } } });
  if (owned && owned.company._count.members > 1) throw conflict("Retirez d'abord les autres collaborateurs de votre organisation", "COMPANY_HAS_MEMBERS");
  await prisma.$transaction([
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.oAuthAccount.deleteMany({ where: { userId: user.id } }),
    prisma.notification.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: { email: `supprime-${user.id}@anonymise.invalid`, firstName: "Utilisateur", lastName: "supprimé", phone: null, passwordHash: null, twoFactorEnabled: false, twoFactorSecret: null, status: "ANONYMISE" },
    }),
    prisma.studentProfile.updateMany({ where: { userId: user.id }, data: { bio: null, city: null, isPortfolioPublic: false, slug: `supprime-${slugify(user.id)}` } }),
    prisma.mentorProfile.updateMany({ where: { userId: user.id }, data: { bio: null } }),
  ]);
  await audit(req, "account.anonymized", { actorId: user.id, entityType: "User", entityId: user.id });
  res.status(204).end();
});

/* ============ Préférences de notification ============ */
profileRouter.get("/me/notification-preferences", async (req, res) => {
  res.json({ preferences: await prisma.notificationPreference.findMany({ where: { userId: req.auth!.id } }) });
});
profileRouter.put("/me/notification-preferences", validateBody(notificationPreferenceSchema), async (req, res) => {
  const { type, inApp, email } = req.body as z.infer<typeof notificationPreferenceSchema>;
  const pref = await prisma.notificationPreference.upsert({
    where: { userId_type: { userId: req.auth!.id, type } },
    create: { userId: req.auth!.id, type, inApp, email },
    update: { inApp, email },
  });
  res.json({ preference: pref });
});

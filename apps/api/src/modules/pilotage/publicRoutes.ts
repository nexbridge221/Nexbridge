import { Router } from "express";
import { config } from "../../config";
import { notFound, prisma } from "../../platform/core";

/** Pages publiques : portfolio (si l'étudiant l'a rendu public), vérification d'attestation, badges Open Badges v2 (hébergés). */
export const publicPilotageRouter = Router();

publicPilotageRouter.get("/portfolio/:slug", async (req, res) => {
  const sp = await prisma.studentProfile.findFirst({ where: { slug: String(req.params.slug), isPortfolioPublic: true, user: { status: "ACTIF" } }, include: { user: { select: { firstName: true, lastName: true } }, institution: { select: { name: true } }, program: { select: { name: true } }, skills: { include: { skill: true } }, badgeAwards: { where: { revokedAt: null }, include: { badge: true }, orderBy: { awardedAt: "desc" } }, certifications: true, attestations: { select: { verificationCode: true, issuedAt: true, project: { select: { name: true, challenge: { select: { company: { select: { legalName: true } } } } } } } } } });
  if (!sp) throw notFound("Portfolio introuvable");
  const skillNames = new Map((await prisma.skill.findMany({ where: { id: { in: sp.certifications.map((c) => c.skillId) } } })).map((s) => [s.id, s.name]));
  res.json({ name: `${sp.user.firstName} ${sp.user.lastName}`, institution: sp.institution?.name ?? null, program: sp.program?.name ?? null, studyLevel: sp.studyLevel, city: sp.city, bio: sp.bio,
    skills: sp.skills.map((s) => ({ name: s.skill.name, category: s.skill.category, level: s.level, validated: s.source !== "DECLARE" })),
    badges: sp.badgeAwards.map((b) => ({ id: b.id, name: b.badge.name, type: b.badge.type, description: b.badge.description, awardedAt: b.awardedAt })),
    certifications: sp.certifications.map((c) => ({ skill: skillNames.get(c.skillId) ?? "—", level: c.level, basedOnProjects: c.basedOnProjects })),
    projects: sp.attestations.map((a) => ({ name: a.project.name, company: a.project.challenge.company.legalName, code: a.verificationCode, issuedAt: a.issuedAt })) });
});

/** Vérification publique d'une attestation par son code : seules les informations strictement nécessaires sont renvoyées. */
publicPilotageRouter.get("/attestations/:code", async (req, res) => {
  const a = await prisma.attestation.findUnique({ where: { verificationCode: String(req.params.code).toUpperCase() }, include: { student: { include: { user: { select: { firstName: true, lastName: true } } } }, project: { select: { name: true, closedAt: true, challenge: { select: { company: { select: { legalName: true } } } } } } } });
  if (!a) throw notFound("Code inconnu : aucune attestation ne correspond.");
  res.json({ valid: true, student: `${a.student.user.firstName} ${a.student.user.lastName}`, project: a.project.name, company: a.project.challenge.company.legalName, issuedAt: a.issuedAt });
});

publicPilotageRouter.get("/badges/issuer", (_req, res) => { res.json({ "@context": "https://w3id.org/openbadges/v2", type: "Issuer", id: `${config.appUrl}/api/public/badges/issuer`, name: "NEXBRIDGE", url: config.appUrl }); });
publicPilotageRouter.get("/badges/classes/:code", async (req, res) => {
  const b = await prisma.badgeDefinition.findUnique({ where: { code: String(req.params.code) } });
  if (!b) throw notFound("Badge introuvable");
  res.json({ "@context": "https://w3id.org/openbadges/v2", type: "BadgeClass", id: `${config.appUrl}/api/public/badges/classes/${b.code}`, name: b.name, description: b.description, image: `${config.appUrl}/brand/app-icon.png`, criteria: { narrative: b.description }, issuer: `${config.appUrl}/api/public/badges/issuer` });
});
publicPilotageRouter.get("/badges/assertions/:id", async (req, res) => {
  const a = await prisma.badgeAward.findUnique({ where: { id: String(req.params.id) } });
  if (!a?.assertion || a.revokedAt) throw notFound("Badge introuvable ou révoqué");
  res.json(a.assertion);
});

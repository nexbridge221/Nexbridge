import { Router } from "express";
import { z } from "zod";
import { contactMessageSchema, newsletterSchema, SKILL_CATEGORIES } from "@nexbridge/shared";
import { config } from "../../config";
import { notFound, prisma, randomToken, sha256 } from "../../platform/core";
import { limiter, validateBody, validateQuery } from "../../platform/http";
import { emails, mail } from "../../platform/mail";

export const publicRouter = Router();
const formLimiter = limiter({ windowMs: 10 * 60_000, limit: 8, message: "Trop d'envois. Réessayez plus tard." });

/* ---------- Référentiels ---------- */
publicRouter.get("/skills", async (req, res) => {
  const q = validateQuery(z.object({ category: z.enum(SKILL_CATEGORIES).optional(), q: z.string().trim().max(60).optional() }), req.query);
  const skills = await prisma.skill.findMany({
    where: { active: true, ...(q.category ? { category: q.category } : {}), ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}) },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 300,
  });
  res.json({ skills });
});

publicRouter.get("/sectors", async (_req, res) => {
  res.json({ sectors: await prisma.sector.findMany({ orderBy: { name: "asc" } }) });
});

publicRouter.get("/institutions", async (req, res) => {
  const { q } = validateQuery(z.object({ q: z.string().trim().max(80).optional() }), req.query);
  const institutions = await prisma.institution.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    select: { id: true, name: true, city: true, country: true, status: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  res.json({ institutions });
});

/* ---------- Contenus administrables ---------- */
publicRouter.get("/testimonials", async (_req, res) => {
  const items = await prisma.testimonial.findMany({ where: { published: true }, orderBy: { position: "asc" }, take: 12 });
  res.json({ testimonials: items });
});
publicRouter.get("/partners", async (_req, res) => {
  res.json({ partners: await prisma.partner.findMany({ where: { published: true }, orderBy: { position: "asc" }, take: 40 }) });
});
publicRouter.get("/faq", async (_req, res) => {
  res.json({ items: await prisma.faqItem.findMany({ where: { published: true }, orderBy: [{ audience: "asc" }, { position: "asc" }] }) });
});

/**
 * Chiffres clés : calculés depuis la base. Les données de démonstration ne sont comptées
 * (et signalées `isDemoData`) qu'en mode démonstration. Sinon : uniquement du réel.
 */
publicRouter.get("/stats", async (_req, res) => {
  const demoFilter = config.demoMode ? {} : { isDemo: false };
  const [students, mentors, companies, institutions, challenges, demoRows] = await Promise.all([
    prisma.user.count({ where: { role: "ETUDIANT", status: "ACTIF", ...demoFilter } }),
    prisma.user.count({ where: { role: "MENTOR", status: "ACTIF", ...demoFilter } }),
    prisma.company.count({ where: { kycStatus: "VALIDE", ...demoFilter } }),
    prisma.institution.count({ where: { status: "VALIDE", ...demoFilter } }),
    prisma.challenge.count({ where: { status: { in: ["PUBLIE", "EN_COURS", "CLOTURE"] }, ...demoFilter } }),
    config.demoMode ? prisma.user.count({ where: { isDemo: true } }) : Promise.resolve(0),
  ]);
  res.json({ students, mentors, companies, institutions, challenges, isDemoData: config.demoMode && demoRows > 0 });
});

/* ---------- Marketplace publique ---------- */
const challengeQuery = z.object({
  q: z.string().trim().max(80).optional(),
  sector: z.string().trim().max(60).optional(),
  skill: z.string().trim().max(60).optional(),
  minWeeks: z.coerce.number().int().min(1).max(104).optional(),
  maxWeeks: z.coerce.number().int().min(1).max(104).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

function publicChallenge(c: {
  id: string; slug: string; title: string; context: string; durationWeeks: number | null; teamSize: number; publishedAt: Date | null; isDemo: boolean;
  company: { legalName: string }; sector: { name: string; slug: string } | null; skills: { skill: { name: string; slug: string }; minLevel: string }[];
}) {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    summary: c.context.length > 220 ? `${c.context.slice(0, 217)}…` : c.context,
    company: c.company.legalName,
    sector: c.sector,
    skills: c.skills.map((s) => ({ name: s.skill.name, slug: s.skill.slug, minLevel: s.minLevel })),
    durationWeeks: c.durationWeeks,
    teamSize: c.teamSize,
    publishedAt: c.publishedAt,
    isDemo: c.isDemo,
  };
}
const challengeInclude = { company: { select: { legalName: true } }, sector: { select: { name: true, slug: true } }, skills: { include: { skill: { select: { name: true, slug: true } } } } } as const;

publicRouter.get("/challenges", async (req, res) => {
  const q = validateQuery(challengeQuery, req.query);
  const demoFilter = config.demoMode ? {} : { isDemo: false };
  const rows = await prisma.challenge.findMany({
    where: {
      status: "PUBLIE",
      ...demoFilter,
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { context: { contains: q.q, mode: "insensitive" } }, { keywords: { has: q.q.toLowerCase() } }] } : {}),
      ...(q.sector ? { sector: { slug: q.sector } } : {}),
      ...(q.skill ? { skills: { some: { skill: { slug: q.skill } } } } : {}),
      ...(q.minWeeks || q.maxWeeks ? { durationWeeks: { ...(q.minWeeks ? { gte: q.minWeeks } : {}), ...(q.maxWeeks ? { lte: q.maxWeeks } : {}) } } : {}),
    },
    include: challengeInclude,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  res.json({ challenges: page.map(publicChallenge), nextCursor: hasMore ? page[page.length - 1]!.id : null });
});

publicRouter.get("/challenges/:slug", async (req, res) => {
  const c = await prisma.challenge.findFirst({
    where: { slug: String(req.params.slug), status: "PUBLIE", ...(config.demoMode ? {} : { isDemo: false }) },
    include: challengeInclude,
  });
  if (!c) throw notFound("Défi introuvable");
  res.json({ challenge: { ...publicChallenge(c), context: c.context, objectives: c.objectives, keywords: c.keywords } });
});

/* ---------- Formulaires ---------- */
publicRouter.post("/contact", formLimiter, validateBody(contactMessageSchema), async (req, res) => {
  // Le champ piège « website » doit rester vide : le schéma rejette les robots qui le remplissent.
  const { website: _trap, consent: _consent, ...data } = req.body as z.infer<typeof contactMessageSchema>;
  await prisma.contactMessage.create({ data });
  res.status(201).json({ message: "Merci ! Votre message a bien été enregistré, nous vous répondrons rapidement." });
});

publicRouter.post("/newsletter", formLimiter, validateBody(newsletterSchema), async (req, res) => {
  const { email } = req.body as z.infer<typeof newsletterSchema>;
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  if (!existing?.confirmedAt) {
    const raw = randomToken(24);
    await prisma.newsletterSubscriber.upsert({ where: { email }, create: { email, tokenHash: sha256(raw) }, update: { tokenHash: sha256(raw) } });
    await mail.send(emails.newsletterConfirm(email, raw));
  }
  // Double opt-in : même réponse dans tous les cas.
  res.status(202).json({ message: "Un e-mail de confirmation vient de vous être envoyé." });
});

publicRouter.post("/newsletter/confirm", validateBody(z.object({ token: z.string().min(10).max(200) })), async (req, res) => {
  const sub = await prisma.newsletterSubscriber.findFirst({ where: { tokenHash: sha256(req.body.token) } });
  if (!sub) throw notFound("Lien invalide ou expiré");
  await prisma.newsletterSubscriber.update({ where: { id: sub.id }, data: { confirmedAt: new Date(), tokenHash: null } });
  res.json({ message: "Inscription confirmée. Merci !" });
});

/* ---------- Informations d'environnement pour l'interface ---------- */
publicRouter.get("/env", (_req, res) => {
  res.json({
    demoMode: config.demoMode,
    emailDelivery: config.mail.sendgridKey ? "reel" : "developpement",
    storage: config.storage.driver,
  });
});

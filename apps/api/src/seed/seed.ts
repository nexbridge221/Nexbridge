/**
 * Seed NEXBRIDGE.
 *  - Données de référence (secteurs, compétences, FAQ) : toujours.
 *  - Données de DÉMONSTRATION : uniquement si DEMO_MODE=true ET NODE_ENV≠production.
 *    Toutes les lignes de démo portent isDemo=true et ne sont jamais présentées comme réelles.
 *  - Les mots de passe des comptes de démo sont générés aléatoirement et écrits dans
 *    .nexbridge-local/demo-accounts.txt (ignoré par Git), jamais dans le code.
 */
import { DEMO_CHALLENGES, DEMO_COMPANIES } from "./demo-challenges";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { config } from "../config";
import { encrypt, prisma, randomToken, slugify } from "../platform/core";
import { BRIEF_TEMPLATES, FAQ, SECTORS, SKILLS } from "./reference-data";

async function seedReference() {
  for (const name of SECTORS) {
    await prisma.sector.upsert({ where: { slug: slugify(name) }, create: { name, slug: slugify(name) }, update: { name } });
  }
  for (const s of SKILLS) {
    await prisma.skill.upsert({ where: { slug: slugify(s.name) }, create: { name: s.name, slug: slugify(s.name), category: s.category }, update: { name: s.name, category: s.category } });
  }
  if ((await prisma.faqItem.count()) === 0) {
    await prisma.faqItem.createMany({ data: FAQ });
  }
  if ((await prisma.briefTemplate.count()) === 0) {
    await prisma.briefTemplate.createMany({ data: BRIEF_TEMPLATES.map((t, i) => ({ name: t.name, sector: t.sector, content: t.content as object, position: i })) });
  }
  console.log(`✔ Référentiels : ${SECTORS.length} secteurs, ${SKILLS.length} compétences, ${BRIEF_TEMPLATES.length} modèles de brief, FAQ`);
}

type Acc = { label: string; email: string; password: string; role: string };

async function seedDemo() {
  if (config.isProd) throw new Error("Refus : le seed de démonstration est interdit en production.");
  if (!config.demoMode) {
    console.log("• DEMO_MODE=false : données de démonstration ignorées.");
    return;
  }
  const accounts: Acc[] = [];
  const hash = (pw: string) => bcrypt.hashSync(pw, 12);
  const makeUser = async (label: string, email: string, role: "ENTREPRISE" | "ETUDIANT" | "MENTOR" | "REFERENT_ACADEMIQUE" | "ADMIN" | "SUPER_ADMIN", firstName: string, lastName: string) => {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return existing;
    const password = `${randomToken(9)}9a`;
    accounts.push({ label, email, password, role });
    return prisma.user.create({
      data: { email, passwordHash: hash(password), role, status: "ACTIF", emailVerifiedAt: new Date(), firstName, lastName, isDemo: true },
    });
  };

  await makeUser("Super administrateur (démo)", "super.admin@demo.nexbridge.test", "SUPER_ADMIN", "Démo", "SuperAdmin");
  await makeUser("Administrateur (démo)", "admin@demo.nexbridge.test", "ADMIN", "Démo", "Admin");

  const institutions = [
    { name: "[Démo] Institut Supérieur des Sciences Appliquées", city: "Dakar" },
    { name: "[Démo] École Supérieure de Gestion et d'Innovation", city: "Thiès" },
  ];
  const instRows = [];
  for (const i of institutions) {
    instRows.push(await prisma.institution.upsert({ where: { name: i.name }, create: { ...i, country: "Sénégal", status: "VALIDE", isDemo: true }, update: {} }));
  }
  const referent = await makeUser("Référent académique (démo)", "referent@demo.nexbridge.test", "REFERENT_ACADEMIQUE", "Démo", "Référent");
  await prisma.referentProfile.upsert({ where: { userId: referent.id }, create: { userId: referent.id, institutionId: instRows[0]!.id, onboardingDone: true }, update: {} });

  const skills = await prisma.skill.findMany();
  const bySlug = (n: string) => skills.find((s) => s.slug === slugify(n))!;

  // Étudiants de démonstration
  const students = [
    ["Aminata", "Diop", ["Analyse de données", "Business intelligence", "Travail en équipe"], 0],
    ["Moussa", "Ndiaye", ["Développement web", "UX / UI Design", "Gestion de projet"], 0],
    ["Fatou", "Sow", ["Marketing digital", "Communication", "Étude de marché"], 1],
    ["Ibrahima", "Fall", ["Machine learning", "Analyse de données", "Résolution de problèmes"], 0],
    ["Awa", "Ba", ["Finance & comptabilité", "FinTech & paiement mobile", "Présentation & storytelling"], 1],
    ["Cheikh", "Sy", ["Cloud & DevOps", "Cybersécurité", "Bases de données & SQL"], 0],
  ] as const;
  for (const [i, [first, last, sk, inst]] of students.entries()) {
    const u = await makeUser(`Étudiant (démo) ${first}`, `etudiant${i + 1}@demo.nexbridge.test`, "ETUDIANT", first, last);
    const profile = await prisma.studentProfile.upsert({
      where: { userId: u.id },
      create: { userId: u.id, slug: `demo-${slugify(`${first}-${last}`)}`, institutionId: instRows[inst]!.id, studyLevel: i % 2 ? "M1" : "L3", availability: "PARTIEL", city: "Dakar", country: "Sénégal", bio: "Profil de démonstration.", onboardingDone: true },
      update: {},
    });
    for (const [k, name] of sk.entries()) {
      await prisma.studentSkill.upsert({
        where: { studentId_skillId: { studentId: profile.id, skillId: bySlug(name).id } },
        create: { studentId: profile.id, skillId: bySlug(name).id, level: (["PRATICIEN", "CONFIRME", "SENSIBILISE"] as const)[k % 3]! },
        update: {},
      });
    }
  }

  // Mentors
  for (const [i, [first, last]] of ([["Mariama", "Kane"], ["Ousmane", "Gueye"]] as const).entries()) {
    const u = await makeUser(`Mentor (démo) ${first}`, `mentor${i + 1}@demo.nexbridge.test`, "MENTOR", first, last);
    await prisma.mentorProfile.upsert({ where: { userId: u.id }, create: { userId: u.id, bio: "Profil de démonstration.", expertiseSectors: ["Technologies & Numérique"], yearsExperience: 10, onboardingDone: true }, update: {} });
  }

  // Entreprises + défis publiés (démo)
  const companies = [
    { owner: "entreprise1@demo.nexbridge.test", first: "Démo", last: "Entreprise1", name: "[Démo] AgriTech Sahel SARL", sector: "Agriculture & Agro-industrie" },
    { owner: "entreprise2@demo.nexbridge.test", first: "Démo", last: "Entreprise2", name: "[Démo] Teranga Finance SA", sector: "Finance & FinTech" },
  ];
  const companyRows = [];
  for (const c of companies) {
    const u = await makeUser(`Entreprise (démo) ${c.name}`, c.owner, "ENTREPRISE", c.first, c.last);
    let company = (await prisma.companyMember.findFirst({ where: { userId: u.id }, include: { company: true } }))?.company;
    if (!company) {
      company = await prisma.company.create({
        data: { legalName: c.name, sector: c.sector, size: "PME", country: "Sénégal", city: "Dakar", description: "Organisation de démonstration.", kycStatus: "VALIDE", ninea: encrypt("0000000000"), rccm: encrypt("SN-DKR-0000-X-0000"), isDemo: true },
      });
      await prisma.companyMember.create({ data: { userId: u.id, companyId: company.id, isOwner: true } });
    }
    companyRows.push(company);
  }

  const sectors = await prisma.sector.findMany();
  const sec = (n: string) => sectors.find((s) => s.slug === slugify(n))!.id;
  const challenges = [
    { c: 0, title: "Prévoir les rendements agricoles à partir de données météo", sector: "Agriculture & Agro-industrie", weeks: 10, team: 4, skills: ["Analyse de données", "Machine learning", "AgriTech"], budget: 1_500_000, pub: true,
      context: "Nous collectons des données météo et de sol auprès de coopératives. Nous cherchons un modèle simple et explicable pour estimer les rendements de la prochaine saison et alerter les producteurs." },
    { c: 0, title: "Application mobile de suivi de livraison pour coopératives", sector: "Transport & Logistique", weeks: 12, team: 5, skills: ["Développement mobile", "UX / UI Design", "Gestion de projet"], budget: 2_000_000, pub: true,
      context: "Les coopératives suivent leurs livraisons sur papier. Nous voulons un prototype d'application mobile fonctionnant avec une connexion limitée, pour déclarer et suivre les livraisons." },
    { c: 1, title: "Parcours d'inscription simplifié pour un service de paiement mobile", sector: "Finance & FinTech", weeks: 8, team: 3, skills: ["UX / UI Design", "FinTech & paiement mobile", "Étude de marché"], budget: null, pub: false,
      context: "Notre taux d'abandon à l'inscription est élevé. Nous souhaitons analyser le parcours actuel et proposer un parcours repensé, testé auprès de vrais utilisateurs." },
    { c: 1, title: "Stratégie de contenu et d'acquisition pour une offre d'épargne digitale", sector: "Finance & FinTech", weeks: 6, team: 3, skills: ["Marketing digital", "Communication", "Présentation & storytelling"], budget: 900_000, pub: true,
      context: "Nous lançons une offre d'épargne digitale destinée aux jeunes actifs. Nous attendons un plan de contenu sur trois mois et des recommandations de canaux d'acquisition." },
    { c: 0, title: "Tableau de bord de suivi qualité pour une unité de transformation", sector: "Industrie & Mines", weeks: 9, team: 4, skills: ["Business intelligence", "Bases de données & SQL", "Qualité & amélioration continue"], budget: 1_200_000, pub: true,
      context: "Les mesures de qualité sont saisies dans des fichiers Excel dispersés. Nous voulons centraliser ces données et visualiser les écarts par lot et par ligne de production." },
  ];
  for (const ch of challenges) {
    const slug = `demo-${slugify(ch.title)}`;
    if (await prisma.challenge.findUnique({ where: { slug } })) continue;
    const owner = await prisma.companyMember.findFirstOrThrow({ where: { companyId: companyRows[ch.c]!.id, isOwner: true } });
    await prisma.challenge.create({
      data: {
        companyId: companyRows[ch.c]!.id,
        createdById: owner.userId,
        title: ch.title,
        slug,
        context: ch.context,
        sectorId: sec(ch.sector),
        teamSize: ch.team,
        durationWeeks: ch.weeks,
        budgetAmount: ch.budget ? BigInt(ch.budget) : null,
        budgetPublic: false, // le budget n'est jamais public
        budgetCurrency: "XOF",
        status: "PUBLIE",
        publishedAt: new Date(),
        isDemo: true,
        skills: { create: ch.skills.map((n) => ({ skillId: bySlug(n).id, minLevel: "PRATICIEN" as const })) },
      },
    });
  }

  // Organisations et défis de démonstration « réalistes » supplémentaires (voir demo-challenges.ts)
  const companyByName = new Map(companyRows.map((c) => [c.legalName, c]));
  for (const c of DEMO_COMPANIES) {
    const u = await makeUser(`Entreprise (démo) ${c.name}`, c.owner, "ENTREPRISE", c.first, c.last);
    let company = (await prisma.companyMember.findFirst({ where: { userId: u.id }, include: { company: true } }))?.company;
    if (!company) {
      company = await prisma.company.create({
        data: { legalName: c.name, sector: c.sector, size: "PME", country: "Sénégal", city: c.city, description: c.description, kycStatus: "VALIDE", ninea: encrypt("0000000000"), rccm: encrypt("SN-DKR-0000-X-0000"), isDemo: true },
      });
      await prisma.companyMember.create({ data: { userId: u.id, companyId: company.id, isOwner: true } });
    }
    companyByName.set(company.legalName, company);
  }
  for (const ch of DEMO_CHALLENGES) {
    const slug = `demo-${slugify(ch.title)}`.slice(0, 120);
    if (await prisma.challenge.findUnique({ where: { slug } })) continue;
    const company = companyByName.get(ch.company)!;
    const owner = await prisma.companyMember.findFirstOrThrow({ where: { companyId: company.id, isOwner: true } });
    const created = await prisma.challenge.create({
      data: {
        companyId: company.id, createdById: owner.userId, title: ch.title, slug, context: ch.context, objectives: ch.objectives, sectorId: sec(ch.sector),
        keywords: ch.keywords, minStudyLevel: ch.level, teamSize: ch.team, durationWeeks: ch.weeks,
        budgetAmount: BigInt(ch.budget), budgetPublic: false, budgetCurrency: "XOF", // le budget n'est jamais public
        status: "PUBLIE", publishedAt: new Date(), isDemo: true,
        skills: { create: ch.skills.map((n) => ({ skillId: bySlug(n).id, minLevel: "PRATICIEN" as const })) },
        deliverables: { create: ch.deliverables },
        milestones: { create: ch.milestones },
      },
    });
    await prisma.challengeStatusHistory.create({ data: { challengeId: created.id, from: "EN_REVISION", to: "PUBLIE", note: "Défi de démonstration publié" } });
  }

  if ((await prisma.testimonial.count({ where: { isDemo: true } })) === 0) {
    await prisma.testimonial.createMany({
      data: [
        { authorName: "Personne fictive", authorRole: "Directrice innovation", organization: "[Démo] Organisation", quote: "Exemple de témoignage — à remplacer par un vrai témoignage depuis le back-office.", published: true, isDemo: true, position: 1 },
        { authorName: "Personne fictive", authorRole: "Étudiant en Master 1", organization: "[Démo] Établissement", quote: "Exemple de témoignage — à remplacer par un vrai témoignage depuis le back-office.", published: true, isDemo: true, position: 2 },
      ],
    });
  }

  if (accounts.length) {
    fs.mkdirSync(config.localDir, { recursive: true });
    const file = path.join(config.localDir, "demo-accounts.txt");
    const body = accounts.map((a) => `${a.label}\n  e-mail      : ${a.email}\n  mot de passe: ${a.password}\n  rôle        : ${a.role}\n`).join("\n");
    if (fs.existsSync(file)) fs.appendFileSync(file, `\n— comptes ajoutés le ${new Date().toISOString()} —\n${body}`);
    else fs.writeFileSync(file, `COMPTES DE DÉMONSTRATION — générés le ${new Date().toISOString()}\n(ce fichier est ignoré par Git ; ne jamais utiliser en production)\n\n${body}`, { mode: 0o600 });
    console.log(`✔ ${accounts.length} comptes de démonstration créés → ${file}`);
  } else {
    console.log("• Comptes de démonstration déjà présents (mots de passe dans demo-accounts.txt s'il existe).");
  }
}

async function main() {
  await seedReference();
  await seedDemo();
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

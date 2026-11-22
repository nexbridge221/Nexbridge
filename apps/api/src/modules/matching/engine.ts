/**
 * NexMatch v1 — moteur de scoring par RÈGLES (aucune IA, aucune donnée inventée).
 * Fonctions pures : mêmes entrées → mêmes sorties. Toutes les explications sont dérivées des sous-scores calculés.
 * Interface `MatchingEngine` : un `RemoteAIEngine` (service FastAPI, phase 5) pourra remplacer `RulesEngine`.
 */
export const ENGINE_VERSION = "rules-1.0";

export type Level = "SENSIBILISE" | "PRATICIEN" | "CONFIRME" | "EXPERT";
export const LEVEL_VALUE: Record<Level, number> = { SENSIBILISE: 1, PRATICIEN: 2, CONFIRME: 3, EXPERT: 4 };
const STUDY_ORDER = ["L1", "L2", "L3", "M1", "M2", "DOCTORAT"];

export interface MatchWeights {
  skills: number; education: number; availability: number; sector: number; history: number;
  /** Multiplicateur appliqué si l'étudiant a déjà ≥ 2 projets actifs (CDC : −30 %). */
  overloadFactor: number;
  overloadThreshold: number;
  /** Bonus diversité : ≥ 3 filières / 2 filières (points ajoutés au score d'équipe, plafonné à 100). */
  diversityBonus3: number; diversityBonus2: number;
}
export const DEFAULT_WEIGHTS: MatchWeights = { skills: 50, education: 15, availability: 10, sector: 10, history: 15, overloadFactor: 0.7, overloadThreshold: 2, diversityBonus3: 10, diversityBonus2: 4 };

export interface StudentInput {
  id: string;
  studyLevel: string | null;
  institutionId: string | null;
  field: string | null; // filière (nom normalisé) ; à défaut, l'établissement sert de repli pour la diversité
  availability: "PLEIN_TEMPS" | "PARTIEL" | "WEEK_END" | null;
  sectorPreferences: string[];
  skills: Record<string, { level: Level; validated: boolean }>;
  activeProjects: number;
  completedProjects: number;
  avgRating: number | null;
}
export interface ChallengeInput {
  sectorName: string | null;
  teamSize: number;
  minStudyLevel: string | null;
  durationWeeks: number | null;
  skills: { skillId: string; minLevel: Level; weight: number }[];
}

export interface Component { key: "skills" | "education" | "availability" | "sector" | "history"; score: number; weight: number }
export interface ScoredStudent {
  studentId: string;
  score: number;
  base: number;
  components: Component[];
  skillScores: { skillId: string; ratio: number; studentLevel: Level | null; required: Level; validated: boolean }[];
  penalties: { code: string; label: string; factor: number }[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function scoreStudent(s: StudentInput, c: ChallengeInput, w: MatchWeights = DEFAULT_WEIGHTS): ScoredStudent {
  // 1) Compétences : ratio niveau détenu / niveau demandé (plafonné à 1), +10 % si validée par un projet ; absente = 0.
  const skillScores = c.skills.map((req) => {
    const have = s.skills[req.skillId];
    let ratio = have ? Math.min(1, LEVEL_VALUE[have.level] / LEVEL_VALUE[req.minLevel]) : 0;
    if (have?.validated) ratio = Math.min(1, ratio + 0.1);
    return { skillId: req.skillId, ratio, studentLevel: have?.level ?? null, required: req.minLevel, validated: Boolean(have?.validated) };
  });
  const totalW = c.skills.reduce((a, b) => a + b.weight, 0) || 1;
  const skills = (c.skills.reduce((a, req, i) => a + req.weight * skillScores[i]!.ratio, 0) / totalW) * 100;

  // 2) Formation et niveau d'études
  let education = 80;
  if (c.minStudyLevel) {
    const need = STUDY_ORDER.indexOf(c.minStudyLevel);
    const have = s.studyLevel ? STUDY_ORDER.indexOf(s.studyLevel) : -1;
    education = have < 0 ? 40 : have >= need ? 100 : clamp(100 - (need - have) * 30);
  } else if (!s.studyLevel) education = 60;

  // 3) Disponibilité
  const availability = s.availability === "PLEIN_TEMPS" ? 100 : s.availability === "PARTIEL" ? ((c.durationWeeks ?? 0) > 16 ? 60 : 75) : s.availability === "WEEK_END" ? 40 : 50;

  // 4) Préférence sectorielle
  const sector = !c.sectorName ? 50 : s.sectorPreferences.includes(c.sectorName) ? 100 : s.sectorPreferences.length === 0 ? 50 : 30;

  // 5) Historique : neutre (60) sans projet ; sinon moyenne des évaluations, bonus d'expérience (max 3 projets)
  const history = s.completedProjects === 0 ? 60 : clamp((s.avgRating != null ? (s.avgRating / 5) * 100 : 70) + Math.min(s.completedProjects, 3) * 3);

  const components: Component[] = [
    { key: "skills", score: Math.round(skills), weight: w.skills },
    { key: "education", score: Math.round(education), weight: w.education },
    { key: "availability", score: Math.round(availability), weight: w.availability },
    { key: "sector", score: Math.round(sector), weight: w.sector },
    { key: "history", score: Math.round(history), weight: w.history },
  ];
  const wsum = components.reduce((a, b) => a + b.weight, 0) || 1;
  const base = components.reduce((a, b) => a + b.score * b.weight, 0) / wsum;
  const penalties: ScoredStudent["penalties"] = [];
  let score = base;
  if (s.activeProjects >= w.overloadThreshold) {
    score *= w.overloadFactor;
    penalties.push({ code: "OVERLOAD", label: `${s.activeProjects} projets actifs : score réduit de ${Math.round((1 - w.overloadFactor) * 100)} %`, factor: w.overloadFactor });
  }
  return { studentId: s.id, score: Math.round(score), base: Math.round(base), components, skillScores, penalties };
}

export interface TeamProposal {
  rank: number;
  totalScore: number;
  diversityScore: number;
  coverage: number;
  avgIndividual: number;
  fields: number;
  incomplete: boolean;
  members: ScoredStudent[];
  explanation: { strengths: string[]; warnings: string[]; availability: Record<string, number>; coveredSkills: number; requiredSkills: number };
}
export interface MatchResult { proposals: TeamProposal[]; ranking: { studentId: string; score: number }[]; weights: MatchWeights; poolSize: number }

function teamMetrics(members: ScoredStudent[], studentsById: Map<string, StudentInput>, c: ChallengeInput, w: MatchWeights) {
  const totalW = c.skills.reduce((a, b) => a + b.weight, 0) || 1;
  const coverage = (c.skills.reduce((a, req, i) => a + req.weight * Math.max(0, ...members.map((m) => m.skillScores[i]!.ratio)), 0) / totalW) * 100;
  const avgIndividual = members.reduce((a, m) => a + m.score, 0) / (members.length || 1);
  const fields = new Set(members.map((m) => { const s = studentsById.get(m.studentId)!; return s.field ? `f:${s.field}` : `i:${s.institutionId ?? m.studentId}`; })).size;
  const diversityBonus = fields >= 3 ? w.diversityBonus3 : fields === 2 ? w.diversityBonus2 : 0;
  const total = clamp(0.5 * coverage + 0.5 * avgIndividual + diversityBonus);
  return { coverage, avgIndividual, fields, diversityBonus, total };
}

export function proposeTeams(students: StudentInput[], c: ChallengeInput, skillNames: Record<string, string>, w: MatchWeights = DEFAULT_WEIGHTS, maxProposals = 3): MatchResult {
  const scored = students.map((s) => scoreStudent(s, c, w)).sort((a, b) => b.score - a.score || a.studentId.localeCompare(b.studentId));
  const ranking = scored.map((s) => ({ studentId: s.studentId, score: s.score }));
  const byId = new Map(students.map((s) => [s.id, s]));
  const scoredById = new Map(scored.map((s) => [s.studentId, s]));
  if (scored.length < 2) return { proposals: [], ranking, weights: w, poolSize: scored.length };

  // Réserve de candidats : les meilleurs globaux + les meilleurs pour chaque compétence requise.
  const pool = new Set(scored.slice(0, 12).map((s) => s.studentId));
  c.skills.forEach((_, i) => [...scored].sort((a, b) => b.skillScores[i]!.ratio - a.skillScores[i]!.ratio || b.score - a.score).slice(0, 3).forEach((s) => pool.add(s.studentId)));
  const poolIds = [...pool].sort();
  const size = Math.min(c.teamSize, poolIds.length);

  // Recherche en faisceau (largeur 40) : on étend les équipes partielles en gardant les plus prometteuses.
  let beam: string[][] = [[]];
  for (let step = 0; step < size; step++) {
    const next = new Map<string, { ids: string[]; v: number }>();
    for (const team of beam) {
      for (const id of poolIds) {
        if (team.includes(id)) continue;
        const ids = [...team, id].sort();
        const key = ids.join("|");
        if (next.has(key)) continue;
        next.set(key, { ids, v: teamMetrics(ids.map((i) => scoredById.get(i)!), byId, c, w).total });
      }
    }
    beam = [...next.values()].sort((a, b) => b.v - a.v).slice(0, 40).map((x) => x.ids);
  }
  const finals = beam.map((ids) => ({ ids, m: teamMetrics(ids.map((i) => scoredById.get(i)!), byId, c, w) })).sort((a, b) => b.m.total - a.m.total || a.ids.join().localeCompare(b.ids.join()));

  // Sélection de propositions distinctes : on pénalise le chevauchement avec les équipes déjà retenues.
  const chosen: typeof finals = [];
  while (chosen.length < maxProposals && finals.length) {
    let bestIdx = -1, bestVal = -Infinity;
    finals.forEach((f, i) => {
      if (chosen.some((ch) => ch.ids.join() === f.ids.join())) return;
      const overlap = chosen.reduce((a, ch) => Math.max(a, f.ids.filter((x) => ch.ids.includes(x)).length), 0);
      if (chosen.length && overlap >= size) return;
      const v = f.m.total - overlap * 4;
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    });
    if (bestIdx < 0) break;
    chosen.push(finals[bestIdx]!);
  }

  // Les propositions sont présentées par score décroissant (le classement ne doit jamais contredire les scores affichés).
  chosen.sort((a, b) => b.m.total - a.m.total || a.ids.join().localeCompare(b.ids.join()));
  const proposals: TeamProposal[] = chosen.map((f, i) => {
    const members = f.ids.map((id) => scoredById.get(id)!).sort((a, b) => b.score - a.score);
    const covered = c.skills.filter((_, k) => Math.max(...members.map((m) => m.skillScores[k]!.ratio)) >= 0.99).length;
    const uncovered = c.skills.filter((_, k) => Math.max(...members.map((m) => m.skillScores[k]!.ratio)) < 0.5).map((s) => skillNames[s.skillId] ?? "compétence");
    const availability: Record<string, number> = {};
    for (const m of members) { const a = byId.get(m.studentId)!.availability ?? "NON_RENSEIGNEE"; availability[a] = (availability[a] ?? 0) + 1; }
    const strengths: string[] = [];
    strengths.push(`Couvre pleinement ${covered} compétence(s) requise(s) sur ${c.skills.length}.`);
    strengths.push(`Score individuel moyen : ${Math.round(f.m.avgIndividual)}/100.`);
    strengths.push(f.m.fields >= 3 ? `Équipe interdisciplinaire : ${f.m.fields} filières représentées (bonus de diversité).` : `${f.m.fields} filière(s) représentée(s).`);
    const validatedCount = members.filter((m) => m.skillScores.some((s) => s.validated)).length;
    if (validatedCount) strengths.push(`${validatedCount} membre(s) avec des compétences validées par des projets.`);
    const warnings: string[] = [];
    if (uncovered.length) warnings.push(`Compétence(s) faiblement couverte(s) : ${uncovered.join(", ")}.`);
    members.forEach((m) => m.penalties.forEach((p) => warnings.push(`Un membre : ${p.label}.`)));
    const noContribution = members.filter((m) => m.skillScores.every((s) => s.ratio === 0)).length;
    if (noContribution > 0) warnings.push(`${noContribution} membre(s) n'apportent aucune des compétences requises (profil de complément, faute de candidats plus adaptés).`);
    if (members.length < c.teamSize) warnings.push(`Équipe incomplète : ${members.length} étudiant(s) disponible(s) pour ${c.teamSize} recherché(s).`);
    if ((availability.WEEK_END ?? 0) + (availability.NON_RENSEIGNEE ?? 0) > 0) warnings.push("Certaines disponibilités sont limitées ou non renseignées.");
    return { rank: i + 1, totalScore: Math.round(f.m.total), diversityScore: Math.round(f.m.diversityBonus), coverage: Math.round(f.m.coverage), avgIndividual: Math.round(f.m.avgIndividual), fields: f.m.fields, incomplete: members.length < c.teamSize, members, explanation: { strengths, warnings, availability, coveredSkills: covered, requiredSkills: c.skills.length } };
  });
  return { proposals, ranking, weights: w, poolSize: scored.length };
}

export interface MatchingEngine { readonly name: string; readonly version: string; propose(students: StudentInput[], challenge: ChallengeInput, skillNames: Record<string, string>, weights: MatchWeights): MatchResult }
export const RulesEngine: MatchingEngine = { name: "REGLES", version: ENGINE_VERSION, propose: (s, c, n, w) => proposeTeams(s, c, n, w) };

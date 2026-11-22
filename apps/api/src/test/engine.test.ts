import { DEFAULT_WEIGHTS, proposeTeams, scoreStudent, type ChallengeInput, type StudentInput } from "../modules/matching/engine";

const challenge: ChallengeInput = {
  sectorName: "Finance & FinTech", teamSize: 3, minStudyLevel: "L3", durationWeeks: 10,
  skills: [{ skillId: "ml", minLevel: "CONFIRME", weight: 2 }, { skillId: "ux", minLevel: "PRATICIEN", weight: 1 }, { skillId: "fin", minLevel: "PRATICIEN", weight: 1 }],
};
const st = (id: string, over: Partial<StudentInput> = {}): StudentInput => ({
  id, studyLevel: "M1", institutionId: "i1", field: "info", availability: "PLEIN_TEMPS", sectorPreferences: [], skills: {}, activeProjects: 0, completedProjects: 0, avgRating: null, ...over,
});
const names = { ml: "Machine learning", ux: "UX / UI Design", fin: "Finance" };

describe("scoreStudent", () => {
  it("donne 100 % de la composante compétences quand tous les niveaux sont atteints", () => {
    const r = scoreStudent(st("a", { skills: { ml: { level: "CONFIRME", validated: false }, ux: { level: "PRATICIEN", validated: false }, fin: { level: "EXPERT", validated: false } } }), challenge);
    expect(r.components.find((c) => c.key === "skills")!.score).toBe(100);
  });
  it("calcule le ratio de niveau (PRATICIEN pour CONFIRME demandé = 2/3) et 0 pour une compétence absente", () => {
    const r = scoreStudent(st("a", { skills: { ml: { level: "PRATICIEN", validated: false } } }), challenge);
    expect(r.skillScores[0]!.ratio).toBeCloseTo(2 / 3);
    expect(r.skillScores[1]!.ratio).toBe(0);
    expect(r.components.find((c) => c.key === "skills")!.score).toBe(Math.round(((2 * (2 / 3)) / 4) * 100));
  });
  it("applique la pénalité de surcharge de 30 % à partir de 2 projets actifs", () => {
    const base = scoreStudent(st("a", { skills: { ml: { level: "CONFIRME", validated: false } }, activeProjects: 1 }), challenge);
    const over = scoreStudent(st("a", { skills: { ml: { level: "CONFIRME", validated: false } }, activeProjects: 2 }), challenge);
    expect(over.score).toBe(Math.round(base.base * 0.7));
    expect(over.penalties[0]!.code).toBe("OVERLOAD");
    expect(base.penalties).toHaveLength(0);
  });
  it("bonifie les compétences validées par un projet", () => {
    const a = scoreStudent(st("a", { skills: { ml: { level: "PRATICIEN", validated: false } } }), challenge).skillScores[0]!.ratio;
    const b = scoreStudent(st("a", { skills: { ml: { level: "PRATICIEN", validated: true } } }), challenge).skillScores[0]!.ratio;
    expect(b).toBeGreaterThan(a);
  });
  it("pénalise un niveau d'études inférieur au minimum demandé", () => {
    const ok = scoreStudent(st("a", { studyLevel: "L3" }), challenge).components.find((c) => c.key === "education")!.score;
    const low = scoreStudent(st("a", { studyLevel: "L1" }), challenge).components.find((c) => c.key === "education")!.score;
    expect(ok).toBe(100);
    expect(low).toBe(40);
  });
  it("reste neutre (et non inventé) sans historique", () => {
    expect(scoreStudent(st("a"), challenge).components.find((c) => c.key === "history")!.score).toBe(60);
  });
});

describe("proposeTeams", () => {
  const students = [
    st("ml1", { field: "info", skills: { ml: { level: "EXPERT", validated: true } } }),
    st("ml2", { field: "info", skills: { ml: { level: "CONFIRME", validated: false } } }),
    st("ux1", { field: "design", institutionId: "i2", skills: { ux: { level: "CONFIRME", validated: false } } }),
    st("fin1", { field: "gestion", institutionId: "i3", skills: { fin: { level: "PRATICIEN", validated: false } } }),
    st("weak", { field: "droit", institutionId: "i4", studyLevel: "L1", availability: "WEEK_END" }),
  ];
  it("propose des équipes qui couvrent les compétences et valorise la diversité des filières", () => {
    const r = proposeTeams(students, challenge, names);
    expect(r.proposals.length).toBeGreaterThanOrEqual(1);
    const best = r.proposals[0]!;
    expect(best.members).toHaveLength(3);
    expect(best.explanation.coveredSkills).toBe(3);
    expect(best.fields).toBe(3);
    expect(best.diversityScore).toBe(DEFAULT_WEIGHTS.diversityBonus3);
    expect(best.members.map((m) => m.studentId)).toEqual(expect.arrayContaining(["ml1", "ux1", "fin1"]));
  });
  it("renvoie au plus 3 propositions, toutes différentes et classées par score décroissant", () => {
    const r = proposeTeams(students, challenge, names);
    expect(r.proposals.length).toBeLessThanOrEqual(3);
    const keys = r.proposals.map((p) => p.members.map((m) => m.studentId).sort().join());
    expect(new Set(keys).size).toBe(keys.length);
    for (let i = 1; i < r.proposals.length; i++) expect(r.proposals[i - 1]!.totalScore).toBeGreaterThanOrEqual(r.proposals[i]!.totalScore);
    expect(r.proposals.map((p) => p.rank)).toEqual(r.proposals.map((_, i) => i + 1));
  });
  it("classe toujours les propositions par score décroissant, même avec peu de candidats qui se chevauchent", () => {
    const pool = Array.from({ length: 7 }, (_, i) => st(`p${i}`, { field: `f${i % 3}`, institutionId: `i${i % 3}`, skills: i < 3 ? { ml: { level: (["EXPERT", "CONFIRME", "PRATICIEN"] as const)[i]!, validated: false } } : {} }));
    const r = proposeTeams(pool, { ...challenge, teamSize: 4 }, names);
    for (let i = 1; i < r.proposals.length; i++) expect(r.proposals[i - 1]!.totalScore).toBeGreaterThanOrEqual(r.proposals[i]!.totalScore);
  });
  it("signale les membres qui n'apportent aucune compétence requise", () => {
    const r = proposeTeams([st("a", { skills: { ml: { level: "EXPERT", validated: false } } }), st("b", { field: "x", institutionId: "ix" })], challenge, names);
    expect(r.proposals[0]!.explanation.warnings.join(" ")).toMatch(/aucune des compétences requises/);
  });
  it("est déterministe", () => {
    expect(JSON.stringify(proposeTeams(students, challenge, names))).toBe(JSON.stringify(proposeTeams(students, challenge, names)));
  });
  it("signale une équipe incomplète au lieu d'inventer des profils", () => {
    const r = proposeTeams(students.slice(0, 2), challenge, names);
    expect(r.proposals[0]!.members).toHaveLength(2);
    expect(r.proposals[0]!.incomplete).toBe(true);
    expect(r.proposals[0]!.explanation.warnings.join(" ")).toMatch(/incomplète/);
  });
  it("ne propose rien avec moins de 2 candidats", () => {
    expect(proposeTeams([students[0]!], challenge, names).proposals).toHaveLength(0);
    expect(proposeTeams([], challenge, names).proposals).toHaveLength(0);
  });
  it("fournit un classement complet pour le remplacement automatique", () => {
    const r = proposeTeams(students, challenge, names);
    expect(r.ranking).toHaveLength(5);
    expect(r.ranking[0]!.score).toBeGreaterThanOrEqual(r.ranking[4]!.score);
  });
  it("répond en moins de 5 s sur 300 candidats (exigence du CDC)", () => {
    const many = Array.from({ length: 300 }, (_, i) => st(`s${i}`, { field: `f${i % 7}`, institutionId: `i${i % 5}`, skills: { ml: { level: (["SENSIBILISE", "PRATICIEN", "CONFIRME", "EXPERT"] as const)[i % 4]!, validated: i % 9 === 0 }, ux: { level: "PRATICIEN", validated: false } } }));
    const t = Date.now();
    const r = proposeTeams(many, { ...challenge, teamSize: 6 }, names);
    expect(Date.now() - t).toBeLessThan(5000);
    expect(r.proposals).toHaveLength(3);
  });
});

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, GraduationCap, Plus, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { BarList } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError, getAccessToken } from "@/lib/api";
import { cn } from "@/lib/cn";

type Tab = "apercu" | "etudiants" | "cohortes" | "credits" | "rapports";
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");
async function download(path: string, name: string) { const r = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: "include" }); if (!r.ok) return toast.error("Export impossible."); const u = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }

export default function AcademicHub() {
  usePageTitle("Pilotage académique");
  const [tab, setTab] = useState<Tab>("apercu");
  const tabs: [Tab, string][] = [["apercu", "Aperçu"], ["etudiants", "Étudiants"], ["cohortes", "Cohortes"], ["credits", "Crédits"], ["rapports", "Rapports"]];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl sm:text-3xl">Pilotage académique</h1><Button asChild variant="secondary"><Link to="/app/academique/validations"><GraduationCap className="h-4 w-4" aria-hidden />Validations d'équipes</Link></Button></div>
      <div role="tablist" aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-line">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold", tab === k ? "border-nexus text-nexus" : "border-transparent text-muted hover:text-night")}>{l}</button>)}</div>
      {tab === "apercu" && <Overview />}{tab === "etudiants" && <Students />}{tab === "cohortes" && <Cohorts />}{tab === "credits" && <Credits />}{tab === "rapports" && <Reports />}
    </div>
  );
}

function Overview() {
  const { data, isLoading } = useQuery({ queryKey: ["acad-overview"], queryFn: () => api<{ institution: { name: string; status: string }; totals: Record<string, number>; topSkills: { name: string; count: number }[]; insertionNote: string }>("/academic/overview") });
  if (isLoading || !data) return <Skeleton className="h-48" />;
  const t = data.totals;
  return (
    <div className="space-y-6">
      {data.institution.status !== "VALIDE" && <Alert tone="warning" title="Établissement en attente de validation">« {data.institution.name} » doit être validé par NEXBRIDGE avant la validation académique des projets.</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">{[["Étudiants inscrits", t.students], ["Cohortes", t.cohorts], ["Projets en cours", t.activeProjects], ["Projets terminés", t.completedProjects], ["Crédits validés", t.creditsValidated], ["Crédits à valider", t.creditsPending], ["Badges obtenus", t.badges]].map(([l, v]) => <Card key={l as string}><CardBody><p className="text-[13px] font-semibold leading-tight text-muted sm:text-sm">{l}</p><p className="mt-1 text-2xl font-extrabold text-night sm:text-3xl">{v}</p></CardBody></Card>)}</div>
      <Card><CardBody><h2 className="text-lg">Compétences les plus développées</h2>{data.topSkills.length === 0 ? <p className="mt-3 text-sm text-muted">Aucune compétence déclarée par vos étudiants pour l'instant.</p> : <div className="mt-4 max-w-xl"><BarList items={data.topSkills.map((s) => ({ label: s.name, value: s.count }))} /></div>}</CardBody></Card>
      <Alert tone="info">{data.insertionNote}</Alert>
    </div>
  );
}

function Students() {
  const { data, isLoading } = useQuery({ queryKey: ["acad-students"], queryFn: () => api<{ students: { id: string; name: string; program: string | null; studyLevel: string | null; cohorts: string[]; activeProjects: number; completedProjects: number; badges: number; credits: number }[] }>("/academic/students") });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="secondary" onClick={() => void download("/academic/export/students.csv", "etudiants.csv")}><Download className="h-4 w-4" aria-hidden />Exporter en CSV</Button></div>
      {isLoading && <Skeleton className="h-40" />}
      {data?.students.length === 0 && <EmptyState icon={<Users className="h-6 w-6" />} title="Aucun étudiant rattaché" />}
      {data && data.students.length > 0 && <Card className="overflow-x-auto"><table className="block w-full text-left text-sm sm:table sm:min-w-[720px]"><caption className="sr-only">Étudiants de l'établissement</caption><thead className="hidden border-b border-line text-muted sm:table-header-group"><tr>{["Étudiant", "Filière", "Cohortes", "Projets actifs", "Terminés", "Badges", "Crédits"].map((h) => <th key={h} scope="col" className="p-3 font-semibold">{h}</th>)}</tr></thead><tbody className="block divide-y divide-line sm:table-row-group">{data.students.map((s) => <tr key={s.id} className="grid grid-cols-3 gap-x-3 gap-y-2 px-4 py-3 sm:table-row sm:p-0"><th scope="row" className="col-span-3 p-0 text-left font-semibold text-night sm:table-cell sm:p-3">{s.name}</th><td data-label="Filière" className="block p-0 sm:table-cell sm:p-3 before:mb-0.5 before:block before:text-xs before:font-normal before:text-muted before:content-[attr(data-label)] sm:before:hidden text-muted">{[s.program, s.studyLevel].filter(Boolean).join(" · ") || "—"}</td><td data-label="Cohortes" className="block p-0 sm:table-cell sm:p-3 before:mb-0.5 before:block before:text-xs before:font-normal before:text-muted before:content-[attr(data-label)] sm:before:hidden text-muted">{s.cohorts.join(", ") || "—"}</td><td data-label="Projets actifs" className="block p-0 sm:table-cell sm:p-3 before:mb-0.5 before:block before:text-xs before:font-normal before:text-muted before:content-[attr(data-label)] sm:before:hidden tabular-nums">{s.activeProjects}</td><td data-label="Terminés" className="block p-0 sm:table-cell sm:p-3 before:mb-0.5 before:block before:text-xs before:font-normal before:text-muted before:content-[attr(data-label)] sm:before:hidden tabular-nums">{s.completedProjects}</td><td data-label="Badges" className="block p-0 sm:table-cell sm:p-3 before:mb-0.5 before:block before:text-xs before:font-normal before:text-muted before:content-[attr(data-label)] sm:before:hidden tabular-nums">{s.badges}</td><td data-label="Crédits" className="block p-0 sm:table-cell sm:p-3 before:mb-0.5 before:block before:text-xs before:font-normal before:text-muted before:content-[attr(data-label)] sm:before:hidden tabular-nums">{s.credits}</td></tr>)}</tbody></table></Card>}
    </div>
  );
}

function Cohorts() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["acad-cohorts"], queryFn: () => api<{ cohorts: { id: string; name: string; academicYear: string; members: number }[] }>("/academic/cohorts") });
  const students = useQuery({ queryKey: ["acad-students"], queryFn: () => api<{ students: { id: string; name: string; program: string | null }[] }>("/academic/students") });
  const [open, setOpen] = useState(false); const [f, setF] = useState({ name: "", academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` });
  const [sel, setSel] = useState<string | null>(null); const [picked, setPicked] = useState<string[]>([]);
  const detail = useQuery({ queryKey: ["acad-cohort", sel], enabled: Boolean(sel), queryFn: () => api<{ cohort: { name: string; members: { studentId: string; name: string; program: string | null; badges: number }[] } }>(`/academic/cohorts/${sel}`) });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["acad-cohorts"] }), qc.invalidateQueries({ queryKey: ["acad-cohort", sel] }), qc.invalidateQueries({ queryKey: ["acad-students"] })]);
  const create = useMutation({ mutationFn: () => api("/academic/cohorts", { method: "POST", body: f }), onSuccess: async () => { setOpen(false); await refresh(); }, onError: (e) => toast.error(err(e)) });
  const add = useMutation({ mutationFn: () => api(`/academic/cohorts/${sel}/members`, { method: "POST", body: { studentIds: picked } }), onSuccess: async () => { setPicked([]); await refresh(); toast.success("Étudiants ajoutés."); }, onError: (e) => toast.error(err(e)) });
  const remove = useMutation({ mutationFn: (sid: string) => api(`/academic/cohorts/${sel}/members/${sid}`, { method: "DELETE" }), onSuccess: refresh });
  const inCohort = new Set(detail.data?.cohort.members.map((m) => m.studentId));
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-3"><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Nouvelle cohorte</Button>
        {list.data?.cohorts.length === 0 && <p className="text-sm text-muted">Aucune cohorte.</p>}
        <ul className="space-y-2">{list.data?.cohorts.map((c) => <li key={c.id}><button onClick={() => { setSel(c.id); setPicked([]); }} aria-pressed={sel === c.id} className={cn("w-full rounded-lg border p-3 text-left", sel === c.id ? "border-nexus bg-blue-50" : "border-line bg-white hover:border-nexus")}><p className="font-semibold text-night">{c.name}</p><p className="text-sm text-muted">{c.academicYear} · {c.members} étudiant(s)</p></button></li>)}</ul></div>
      <div>{!sel ? <p className="text-sm text-muted">Sélectionnez une cohorte.</p> : (
        <Card><CardBody><h2 className="text-lg">{detail.data?.cohort.name}</h2>
          <ul className="mt-3 divide-y divide-line">{detail.data?.cohort.members.map((m) => <li key={m.studentId} className="flex items-center justify-between gap-3 py-2 text-sm"><span><strong className="text-night">{m.name}</strong> <span className="text-muted">{m.program ?? ""} · {m.badges} badge(s)</span></span><Button size="sm" variant="ghost" onClick={() => remove.mutate(m.studentId)}>Retirer</Button></li>)}{detail.data?.cohort.members.length === 0 && <li className="py-2 text-sm text-muted">Cohorte vide.</li>}</ul>
          <h3 className="mt-5 text-base">Ajouter des étudiants</h3>
          <div className="mt-2 flex flex-wrap gap-2">{students.data?.students.filter((s) => !inCohort.has(s.id)).map((s) => { const on = picked.includes(s.id); return <button key={s.id} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id])} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${on ? "border-nexus bg-nexus text-white" : "border-slate-300 bg-white hover:border-nexus"}`}>{s.name}</button>; })}</div>
          <Button className="mt-3" disabled={picked.length === 0} loading={add.isPending} onClick={() => add.mutate()}>Ajouter {picked.length || ""} étudiant(s)</Button></CardBody></Card>)}</div>
      <Modal open={open} onOpenChange={setOpen} title="Nouvelle cohorte"><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}><Field label="Nom">{(p) => <Input {...p} autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field><Field label="Année universitaire" help="Format 2026-2027">{(p) => <Input {...p} value={f.academicYear} onChange={(e) => setF({ ...f, academicYear: e.target.value })} />}</Field><div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={create.isPending} disabled={f.name.trim().length < 2}>Créer</Button></div></form></Modal>
    </div>
  );
}

function Credits() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["acad-credits"], queryFn: () => api<{ institution: { status: string }; validations: { id: string; status: string; credits: number | null; comment: string | null; project: string; projectStatus: string; company: string; student: string; program: string | null }[] }>("/academic/credits") });
  const [dec, setDec] = useState<{ id: string; name: string; decision: "VALIDE" | "REFUSE" } | null>(null); const [credits, setCredits] = useState("3"); const [comment, setComment] = useState("");
  const decide = useMutation({ mutationFn: () => api<{ finalized: boolean }>(`/academic/credits/${dec!.id}`, { method: "POST", body: dec!.decision === "VALIDE" ? { decision: "VALIDE", credits: Number(credits.replace(",", ".")), comment: comment || undefined } : { decision: "REFUSE", comment } }), onSuccess: async (r) => { setDec(null); toast.success(r.finalized ? "Décision enregistrée : le projet est terminé." : "Décision enregistrée."); await qc.invalidateQueries({ queryKey: ["acad-credits"] }); await qc.invalidateQueries({ queryKey: ["acad-overview"] }); }, onError: (e) => toast.error(err(e)) });
  if (isLoading || !data) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">À la clôture d'un projet, vous attribuez les crédits (ECTS ou équivalent) à chaque étudiant de votre établissement. Le projet est terminé une fois toutes les décisions prises.</p>
      {data.validations.length === 0 && <EmptyState title="Aucune validation de crédits" />}
      <ul className="space-y-3">{data.validations.map((v) => <li key={v.id}><Card><CardBody className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="font-semibold text-night">{v.student} <span className="font-normal text-muted">{v.program ?? ""}</span></p><p className="text-sm text-muted">{v.project} · {v.company}</p>{v.comment && <p className="text-xs text-muted">{v.comment}</p>}</div>{v.status === "EN_ATTENTE" ? (v.projectStatus === "EN_EVALUATION" ? <><Button size="sm" onClick={() => { setDec({ id: v.id, name: v.student, decision: "VALIDE" }); setCredits("3"); setComment(""); }}>Attribuer des crédits</Button><Button size="sm" variant="secondary" onClick={() => { setDec({ id: v.id, name: v.student, decision: "REFUSE" }); setComment(""); }}>Refuser</Button></> : <Badge tone="amber">Projet en cours</Badge>) : <Badge tone={v.status === "VALIDE" ? "green" : "red"}>{v.status === "VALIDE" ? `${v.credits} crédit(s)` : "Refusé"}</Badge>}</CardBody></Card></li>)}</ul>
      <Modal open={Boolean(dec)} onOpenChange={(o) => !o && setDec(null)} title={dec?.decision === "VALIDE" ? `Crédits pour ${dec?.name}` : `Refuser la validation de ${dec?.name}`}>{dec && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); decide.mutate(); }}>{dec.decision === "VALIDE" && <Field label="Nombre de crédits" help="0 si le projet est reconnu sans crédit.">{(p) => <Input {...p} inputMode="decimal" value={credits} onChange={(e) => setCredits(e.target.value)} />}</Field>}<Field label={dec.decision === "REFUSE" ? "Motif (obligatoire)" : "Commentaire"} optional={dec.decision === "VALIDE"}>{(p) => <Textarea {...p} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field><div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setDec(null)}>Annuler</Button><Button type="submit" loading={decide.isPending} disabled={dec.decision === "REFUSE" ? !comment.trim() : credits.trim() === ""}>Enregistrer</Button></div></form>}</Modal>
    </div>
  );
}

function Reports() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card><CardBody><FileText className="mb-2 h-6 w-6 text-nexus" aria-hidden /><h2 className="text-lg">Rapport pédagogique (PDF)</h2><p className="mt-1 text-sm text-muted">Synthèse des étudiants, projets terminés, badges et crédits, pour vos bilans pédagogiques.</p><Button className="mt-4" onClick={() => void download("/academic/export/report.pdf", "rapport-pedagogique.pdf")}><Download className="h-4 w-4" aria-hidden />Télécharger le PDF</Button></CardBody></Card>
      <Card><CardBody><FileText className="mb-2 h-6 w-6 text-collab-text" aria-hidden /><h2 className="text-lg">Liste des étudiants (CSV)</h2><p className="mt-1 text-sm text-muted">Filière, cohortes, projets, badges et crédits ; ouvrable dans Excel. Les adresses e-mail ne sont pas exportées.</p><Button className="mt-4" variant="secondary" onClick={() => void download("/academic/export/students.csv", "etudiants.csv")}><Download className="h-4 w-4" aria-hidden />Télécharger le CSV</Button></CardBody></Card>
    </div>
  );
}

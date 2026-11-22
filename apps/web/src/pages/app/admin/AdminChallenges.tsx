import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, EyeOff, Pencil, Search, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { CHALLENGE_STATUS_LABELS, DELIVERABLE_FORMAT_LABELS, SKILL_LEVEL_LABELS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { STATUS_TONE, type ChallengeDraft } from "@/lib/challenges";
import { formatDate } from "@/lib/format";

const CHECKS = [{ k: "detail", l: "Brief suffisamment détaillé" }, { k: "budget", l: "Budget renseigné et cohérent" }, { k: "skills", l: "Compétences précisées" }, { k: "sector", l: "Secteur clair" }, { k: "deliverables", l: "Livrables clairs" }] as const;

export default function AdminChallenges() {
  usePageTitle("Gestion des défis");
  const qc = useQueryClient();
  const [status, setStatus] = useState("EN_REVISION"); const [search, setSearch] = useState("");
  const list = useQuery({ queryKey: ["admin-challenges", status, search], queryFn: () => api<{ challenges: { id: string; title: string; status: keyof typeof CHALLENGE_STATUS_LABELS; company: { legalName: string; kycStatus: string }; sector: string | null; updatedAt: string; applications: number; projectId: string | null }[] }>(`/admin/challenges?status=${status}${search ? `&q=${encodeURIComponent(search)}` : ""}`) });
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useQuery({ queryKey: ["admin-challenge", openId], enabled: Boolean(openId), queryFn: () => api<{ challenge: ChallengeDraft }>(`/admin/challenges/${openId}`) });
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState("");
  const review = useMutation({
    mutationFn: (decision: "APPROUVE" | "REFUSE") => api(`/admin/challenges/${openId}/review`, { method: "POST", body: { decision, comment: comment || undefined, checklist: decision === "APPROUVE" ? { detail: false, budget: false, skills: false, sector: false, deliverables: false, ...checks } : undefined } }),
    onSuccess: async (_d, decision) => { toast.success(decision === "APPROUVE" ? "Défi publié." : "Défi renvoyé à l'entreprise."); setOpenId(null); setChecks({}); setComment(""); await qc.invalidateQueries({ queryKey: ["admin-challenges"] }); await qc.invalidateQueries({ queryKey: ["admin-overview"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Action impossible."),
  });
  const c = detail.data?.challenge;
  const failure = (e: unknown) => toast.error(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Action impossible.");
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["admin-challenges"] }); await qc.invalidateQueries({ queryKey: ["admin-challenge"] }); await qc.invalidateQueries({ queryKey: ["admin-overview"] }); };
  const [edit, setEdit] = useState<{ title: string; context: string; objectives: string; teamSize: string; durationWeeks: string; budgetAmount: string; budgetCurrency: "XOF" | "EUR" } | null>(null);
  const [unpub, setUnpub] = useState(false); const [del, setDel] = useState(false); const [reason, setReason] = useState("");
  const publish = useMutation({ mutationFn: () => api(`/admin/challenges/${openId}/publish`, { method: "POST", body: {} }), onSuccess: async () => { toast.success("Défi publié."); await refresh(); }, onError: failure });
  const unpublish = useMutation({ mutationFn: () => api(`/admin/challenges/${openId}/unpublish`, { method: "POST", body: { comment: reason.trim() } }), onSuccess: async () => { toast.success("Défi retiré de la marketplace."); setUnpub(false); setReason(""); await refresh(); }, onError: failure });
  const remove = useMutation({ mutationFn: () => api(`/admin/challenges/${openId}`, { method: "DELETE" }), onSuccess: async () => { toast.success("Défi supprimé."); setDel(false); setOpenId(null); await refresh(); }, onError: (e) => { setDel(false); failure(e); } });
  const save = useMutation({
    mutationFn: () => { const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", "."))); return api(`/admin/challenges/${openId}`, { method: "PUT", body: { title: edit!.title.trim(), context: edit!.context.trim(), objectives: edit!.objectives.trim(), teamSize: Number(edit!.teamSize), durationWeeks: n(edit!.durationWeeks), budgetAmount: n(edit!.budgetAmount), budgetCurrency: edit!.budgetCurrency } }); },
    onSuccess: async () => { toast.success("Défi modifié."); setEdit(null); await refresh(); }, onError: failure,
  });
  const editable = c ? ["BROUILLON", "EN_REVISION", "PUBLIE", "ARCHIVE"].includes(c.status) : false;
  const allChecked = CHECKS.every((x) => checks[x.k]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl">Gestion des défis</h1>
      <form role="search" className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-white p-3 sm:grid-cols-[220px_1fr]" onSubmit={(e) => e.preventDefault()}>
        <div><label className="sr-only" htmlFor="c-s">Statut</label><Select id="c-s" value={status} onChange={(e) => { setStatus(e.target.value); setOpenId(null); }}><option value="EN_REVISION">À valider</option><option value="PUBLIE">Publiés</option><option value="BROUILLON">Brouillons</option><option value="EN_COURS">En cours</option><option value="CLOTURE">Clôturés</option><option value="ARCHIVE">Archivés</option><option value="TOUS">Tous les statuts</option></Select></div>
        <div className="relative"><label className="sr-only" htmlFor="c-q">Rechercher</label><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden /><Input id="c-q" className="pl-9" placeholder="Titre ou entreprise" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </form>
      {list.isLoading && <Skeleton className="h-32" />}
      {list.data && list.data.challenges.length === 0 && <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="Aucun défi">Aucun défi ne correspond à ce filtre.</EmptyState>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {list.data && list.data.challenges.length > 0 && <ul className="space-y-2">{list.data.challenges.map((x) => (
          <li key={x.id}><button onClick={() => { setOpenId(x.id); setChecks({}); setComment(""); }} className={`w-full rounded-lg border p-4 text-left transition ${openId === x.id ? "border-nexus bg-blue-50" : "border-line bg-white hover:border-nexus"}`}><p className="font-semibold text-night">{x.title}</p><p className="text-sm text-muted">{x.company.legalName}{x.sector ? ` · ${x.sector}` : ""}</p><p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><Badge tone={STATUS_TONE[x.status]}>{CHALLENGE_STATUS_LABELS[x.status]}</Badge>{x.applications} candidature(s) · mis à jour le {formatDate(x.updatedAt)}</p></button></li>))}</ul>}
        {openId && (
          <Card><CardBody>
            {detail.isLoading || !c ? <Skeleton className="h-64" /> : (<>
              <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-xl">{c.title || "Défi sans titre"}</h2><Badge tone={STATUS_TONE[c.status]}>{CHALLENGE_STATUS_LABELS[c.status]}</Badge></div>
              <div className="mt-3 flex flex-wrap gap-2">
                {editable && <Button size="sm" variant="secondary" onClick={() => setEdit({ title: c.title, context: c.context, objectives: c.objectives ?? "", teamSize: String(c.teamSize), durationWeeks: c.durationWeeks != null ? String(c.durationWeeks) : "", budgetAmount: c.budgetAmount != null ? String(c.budgetAmount) : "", budgetCurrency: c.budgetCurrency })}><Pencil className="h-4 w-4" aria-hidden />Modifier</Button>}
                {["BROUILLON", "EN_REVISION", "ARCHIVE"].includes(c.status) && c.status !== "EN_REVISION" && <Button size="sm" onClick={() => publish.mutate()} loading={publish.isPending}><Send className="h-4 w-4" aria-hidden />Publier</Button>}
                {c.status === "PUBLIE" && <Button size="sm" variant="secondary" onClick={() => setUnpub(true)}><EyeOff className="h-4 w-4" aria-hidden />Dépublier</Button>}
                {!c.project && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" aria-hidden />Supprimer</Button>}
              </div>
              {c.project && <p className="mt-2 text-xs text-muted">Un projet est lié à ce défi : supprimez-le d'abord depuis « Gestion des projets » pour pouvoir supprimer le défi.</p>}<p className="text-sm text-muted">{c.company?.legalName} · {c.sector?.name} · équipe de {c.teamSize} · {c.durationWeeks} semaines · {c.budgetAmount != null ? `${new Intl.NumberFormat("fr-FR").format(c.budgetAmount)} ${c.budgetCurrency === "XOF" ? "FCFA" : "EUR"}` : "budget non renseigné"}</p>
              <h3 className="mt-4 text-base">Contexte</h3><p className="whitespace-pre-line text-[15px] leading-7">{c.context}</p>
              <h3 className="mt-4 text-base">Objectifs</h3><p className="whitespace-pre-line text-[15px] leading-7">{c.objectives}</p>
              <h3 className="mt-4 text-base">Livrables</h3><ul className="mt-1 text-[15px]">{c.deliverables.map((d, i) => <li key={i}>• {d.title} <Badge>{DELIVERABLE_FORMAT_LABELS[d.format]}</Badge></li>)}</ul>
              <h3 className="mt-4 text-base">Compétences</h3><ul className="mt-1 flex flex-wrap gap-2">{c.skills.map((s) => <li key={s.skillId}><Badge tone="violet">{s.skill.name} · {SKILL_LEVEL_LABELS[s.minLevel]}</Badge></li>)}</ul>
              {c.status === "EN_REVISION" && (<>
              <fieldset className="mt-6 rounded-md border border-line bg-cloud p-4"><legend className="px-1 text-sm font-bold text-night">Critères de validation</legend><div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">{CHECKS.map((x) => <Checkbox key={x.k} label={x.l} checked={Boolean(checks[x.k])} onChange={(e) => setChecks({ ...checks, [x.k]: e.target.checked })} />)}</div></fieldset>
              <div className="mt-4"><Field label="Commentaire" optional help="Obligatoire en cas de refus : il est transmis à l'entreprise.">{(p) => <Textarea {...p} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field></div>
              <div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => review.mutate("APPROUVE")} disabled={!allChecked} loading={review.isPending && review.variables === "APPROUVE"}><CheckCircle2 className="h-4 w-4" aria-hidden />Approuver et publier</Button><Button variant="secondary" onClick={() => review.mutate("REFUSE")} disabled={!comment.trim()} loading={review.isPending && review.variables === "REFUSE"}>Renvoyer à l'entreprise</Button></div>
              {!allChecked && <Alert tone="info" className="mt-4">Cochez tous les critères pour approuver.</Alert>}
              </>)}
            </>)}
          </CardBody></Card>)}
      </div>
      <Modal open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} title="Modifier le défi" description="Les compétences, livrables et jalons restent ceux déposés par l'entreprise.">
        {edit && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Titre">{(p) => <Input {...p} autoFocus maxLength={150} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />}</Field>
          <Field label="Contexte">{(p) => <Textarea {...p} rows={5} maxLength={5000} value={edit.context} onChange={(e) => setEdit({ ...edit, context: e.target.value })} />}</Field>
          <Field label="Objectifs" optional>{(p) => <Textarea {...p} rows={3} maxLength={3000} value={edit.objectives} onChange={(e) => setEdit({ ...edit, objectives: e.target.value })} />}</Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Équipe (étudiants)" help="De 2 à 8.">{(p) => <Input {...p} inputMode="numeric" value={edit.teamSize} onChange={(e) => setEdit({ ...edit, teamSize: e.target.value })} />}</Field><Field label="Durée (semaines)" optional>{(p) => <Input {...p} inputMode="numeric" value={edit.durationWeeks} onChange={(e) => setEdit({ ...edit, durationWeeks: e.target.value })} />}</Field></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]"><Field label="Budget (confidentiel)" optional>{(p) => <Input {...p} inputMode="decimal" value={edit.budgetAmount} onChange={(e) => setEdit({ ...edit, budgetAmount: e.target.value })} />}</Field><Field label="Devise">{(p) => <Select {...p} value={edit.budgetCurrency} onChange={(e) => setEdit({ ...edit, budgetCurrency: e.target.value as "XOF" | "EUR" })}><option value="XOF">FCFA</option><option value="EUR">EUR</option></Select>}</Field></div>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Annuler</Button><Button type="submit" loading={save.isPending} disabled={!edit.title.trim() || !edit.context.trim()}>Enregistrer</Button></div>
        </form>}
      </Modal>
      <Modal open={unpub} onOpenChange={(o) => { if (!o) { setUnpub(false); setReason(""); } }} title="Dépublier ce défi ?" description="Il disparaît de la marketplace et repasse en brouillon ; l'entreprise est prévenue.">
        <Field label="Motif (transmis à l'entreprise)">{(p) => <Textarea {...p} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => { setUnpub(false); setReason(""); }}>Annuler</Button><Button loading={unpublish.isPending} disabled={reason.trim().length < 5} onClick={() => unpublish.mutate()}>Dépublier</Button></div>
      </Modal>
      <Modal open={del} onOpenChange={setDel} title="Supprimer ce défi ?" description={c?.title}>
        <Alert tone="warning" title="Action irréversible">Le défi, ses candidatures et ses équipes en cours de constitution sont supprimés, et l'entreprise est prévenue. Pour le conserver sans l'afficher, choisissez plutôt « Dépublier ».</Alert>
        <div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setDel(false)}>Annuler</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Supprimer définitivement</Button></div>
      </Modal>
    </div>
  );
}

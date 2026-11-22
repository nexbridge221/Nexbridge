import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError, getAccessToken } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface Co { id: string; legalName: string; sector: string | null; country: string | null; city: string | null; ninea: string | null; rccm: string | null; owner: { firstName: string; lastName: string; email: string } | null; documents: { id: string; type: string; file: { id: string; originalName: string; size: number; mime: string; scanStatus: string } }[]; updatedAt: string }

export default function AdminOrganisations() {
  usePageTitle("Organisations et établissements");
  const qc = useQueryClient();
  const cos = useQuery({ queryKey: ["admin-companies"], queryFn: () => api<{ companies: Co[] }>("/admin/companies?kyc=EN_VERIFICATION") });
  const insts = useQuery({ queryKey: ["admin-institutions"], queryFn: () => api<{ institutions: { id: string; name: string; city: string | null; referents: number; students: number; createdAt: string }[] }>("/admin/institutions") });
  const [refuse, setRefuse] = useState<Co | null>(null);
  const [reason, setReason] = useState("");
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["admin-companies"] }), qc.invalidateQueries({ queryKey: ["admin-institutions"] }), qc.invalidateQueries({ queryKey: ["admin-overview"] })]);
  const kyc = useMutation({ mutationFn: (v: { id: string; decision: "VALIDE" | "REFUSE"; reason?: string }) => api(`/admin/companies/${v.id}/kyc`, { method: "POST", body: { decision: v.decision, reason: v.reason } }), onSuccess: async (_d, v) => { toast.success(v.decision === "VALIDE" ? "Organisation validée." : "Dossier refusé."); setRefuse(null); setReason(""); await refresh(); }, onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action impossible.") });
  const validate = useMutation({ mutationFn: (id: string) => api(`/admin/institutions/${id}/validate`, { method: "POST" }), onSuccess: async () => { toast.success("Établissement validé."); await refresh(); }, onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action impossible.") });
  const download = async (id: string, name: string) => { const res = await fetch(`/api/files/${id}`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: "include" }); if (!res.ok) return toast.error("Téléchargement impossible."); const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };

  return (
    <div className="space-y-8">
      <section className="space-y-4"><h1 className="text-2xl sm:text-3xl">Validation des organisations (KYC)</h1>
        {cos.isLoading && <Skeleton className="h-32" />}
        {cos.data?.companies.length === 0 && <EmptyState icon={<Building2 className="h-6 w-6" />} title="Aucun dossier en attente" />}
        {cos.data?.companies.map((c) => (
          <Card key={c.id}><CardBody>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg">{c.legalName}</h2><p className="text-sm text-muted">{[c.sector, c.city, c.country].filter(Boolean).join(" · ")}</p>{c.owner && <p className="text-sm text-muted">Propriétaire : {c.owner.firstName} {c.owner.lastName} — {c.owner.email}</p>}</div><span className="text-xs text-muted">Mis à jour le {formatDate(c.updatedAt)}</span></div>
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted">NINEA</dt><dd className="font-mono font-semibold text-night">{c.ninea ?? "—"}</dd></div><div><dt className="text-muted">Registre de commerce</dt><dd className="font-mono font-semibold text-night">{c.rccm ?? "—"}</dd></div></dl>
            <ul className="mt-4 space-y-2">{c.documents.map((d) => <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-md bg-cloud px-3 py-2 text-sm"><span className="flex-1">{d.type} — {d.file.originalName}</span><Badge tone={d.file.scanStatus === "NON_ANALYSE" ? "amber" : "green"}>{d.file.scanStatus === "NON_ANALYSE" ? "antivirus non configuré" : d.file.scanStatus}</Badge><Button size="sm" variant="ghost" onClick={() => download(d.file.id, d.file.originalName)} aria-label={`Télécharger ${d.file.originalName}`}><Download className="h-4 w-4" aria-hidden /></Button></li>)}</ul>
            <p className="mt-3 text-xs text-muted">Les identifiants sont déchiffrés pour cette vérification uniquement. Vérifiez la concordance avec les pièces avant de valider.</p>
            <div className="mt-4 flex gap-3"><Button onClick={() => kyc.mutate({ id: c.id, decision: "VALIDE" })} loading={kyc.isPending && kyc.variables?.id === c.id && kyc.variables.decision === "VALIDE"}>Valider l'organisation</Button><Button variant="secondary" onClick={() => setRefuse(c)}>Refuser</Button></div>
          </CardBody></Card>))}
      </section>
      <section className="space-y-4"><h2 className="text-xl">Établissements en attente de validation</h2>
        {insts.data?.institutions.length === 0 && <p className="text-sm text-muted">Aucun établissement en attente.</p>}
        {insts.data && insts.data.institutions.length > 0 && <Card><ul className="divide-y divide-line">{insts.data.institutions.map((i) => <li key={i.id} className="flex flex-wrap items-center gap-3 p-4 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold text-night">{i.name}</p><p className="text-muted">{i.referents} référent(s) · {i.students} étudiant(s) rattaché(s)</p></div><Button size="sm" onClick={() => validate.mutate(i.id)} loading={validate.isPending && validate.variables === i.id}>Valider</Button></li>)}</ul></Card>}
        <Alert tone="info">Un établissement validé ouvre la validation académique des projets pour ses étudiants.</Alert>
      </section>
      <Modal open={Boolean(refuse)} onOpenChange={(o) => !o && setRefuse(null)} title="Refuser ce dossier ?" description="Le motif est transmis à l'organisation.">
        <Field label="Motif">{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setRefuse(null)}>Retour</Button><Button variant="danger" disabled={!reason.trim()} loading={kyc.isPending} onClick={() => refuse && kyc.mutate({ id: refuse.id, decision: "REFUSE", reason })}>Refuser</Button></div>
      </Modal>
    </div>
  );
}

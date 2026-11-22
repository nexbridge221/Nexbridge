import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileCheck2, Upload, UserPlus } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { COMPANY_CONTACT_ROLE_LABELS, COMPANY_CONTACT_ROLES, companyIdentifiersSchema, companyMemberInviteSchema, KYC_STATUS_LABELS, type KycStatus } from "@nexbridge/shared";
import { CompanySection } from "@/components/profile/Sections";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError, getAccessToken } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useMe } from "@/lib/me";

interface CompanyView {
  isOwner: boolean;
  documents: { id: string; type: string; status: KycStatus; rejectionReason: string | null; createdAt: string; file: { id: string; originalName: string; size: number; scanStatus: string } }[];
  members: { id: string; isOwner: boolean; contactRole: string; jobTitle: string | null; user: { id: string; firstName: string; lastName: string; email: string; status: string } }[];
}
const kycTone = { NON_SOUMIS: "neutral", EN_VERIFICATION: "blue", VALIDE: "green", REFUSE: "red" } as const;

export default function Organisation() {
  const { t } = useTranslation("app");
  usePageTitle(t("company.title"));
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({ queryKey: ["company"], queryFn: () => api<CompanyView>("/company") });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["company"] }), qc.invalidateQueries({ queryKey: ["me"] })]);
  const kyc = me?.company?.kycStatus;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl sm:text-3xl">{t("company.title")}</h1>{kyc && <Badge tone={kycTone[kyc]}>{KYC_STATUS_LABELS[kyc]}</Badge>}</div>
      <CompanySection onSaved={refresh} />
      {isLoading && <Skeleton className="h-48" />}
      {data && me?.company && (<>
        <KycCard company={me.company} data={data} onChange={refresh} />
        <MembersCard data={data} onChange={refresh} />
      </>)}
    </div>
  );
}

function KycCard({ company, data, onChange }: { company: NonNullable<ReturnType<typeof useMe>["data"]>["company"] & object; data: CompanyView; onChange: () => Promise<unknown> }) {
  const { t } = useTranslation("app");
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<"NINEA" | "RCCM" | "AUTRE">("NINEA");
  const [uploading, setUploading] = useState(false);
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(companyIdentifiersSchema) });
  const owner = data.isOwner;
  const saveIds = handleSubmit(async (v) => {
    try { await api("/company/identifiers", { method: "POST", body: v }); reset(); await onChange(); toast.success(t("company.identifiersSaved")); }
    catch (e) { if (e instanceof ApiError && e.fields) for (const [k, m] of Object.entries(e.fields)) setError(k as never, { message: m }); else toast.error(e instanceof ApiError ? e.message : "Enregistrement impossible."); }
  });
  const upload = async (file: File) => {
    setUploading(true);
    try { const fd = new FormData(); fd.append("type", docType); fd.append("file", file); await api("/company/kyc-documents", { method: "POST", form: fd }); await onChange(); toast.success("Pièce déposée."); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : "Dépôt impossible."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const download = async (id: string, name: string) => {
    const res = await fetch(`/api/files/${id}`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: "include" });
    if (!res.ok) return toast.error("Téléchargement impossible.");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Card><CardBody>
      <h2 className="text-xl">{t("company.kyc")}</h2>
      <p className="mt-1 text-sm text-muted">{t("company.kycIntro")}</p>
      {company.kycStatus === "REFUSE" && <Alert tone="error" className="mt-4" title="Dossier refusé">{company.kycRejectionReason ?? "Corrigez les informations puis redéposez vos pièces."}</Alert>}
      {company.kycStatus === "VALIDE" && <Alert tone="success" className="mt-4">Votre organisation est validée.</Alert>}
      {!owner && <Alert tone="info" className="mt-4">Seul le propriétaire du compte peut gérer la validation.</Alert>}
      {owner && company.kycStatus !== "VALIDE" && (
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <form onSubmit={saveIds} noValidate className="space-y-4">
            <h3 className="text-base font-bold">1. Identifiants légaux</h3>
            {company.identifiersProvided && <p className="text-sm text-muted">Enregistrés : NINEA {company.nineaMasked} · RCCM {company.rccmMasked}. Saisissez de nouvelles valeurs pour les remplacer.</p>}
            <Field label={t("company.ninea")} error={errors.ninea?.message}>{(p) => <Input {...p} autoComplete="off" {...register("ninea")} />}</Field>
            <Field label={t("company.rccm")} help={t("company.identifiersHelp")} error={errors.rccm?.message}>{(p) => <Input {...p} autoComplete="off" {...register("rccm")} />}</Field>
            <Button type="submit" variant="secondary" loading={isSubmitting}>Enregistrer les identifiants</Button>
          </form>
          <div className="space-y-4">
            <h3 className="text-base font-bold">2. Pièces justificatives</h3>
            <Field label={t("company.docType")}>{(p) => <Select {...p} value={docType} onChange={(e) => setDocType(e.target.value as typeof docType)}>{(["NINEA", "RCCM", "AUTRE"] as const).map((d) => <option key={d} value={d}>{t(`company.docTypes.${d}`)}</option>)}</Select>}</Field>
            <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" id="kyc-file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button type="button" loading={uploading} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" aria-hidden />{t("company.upload")}</Button>
            <p className="text-xs text-muted">PDF, PNG ou JPEG — 10 Mo maximum. Le type réel du fichier est vérifié.</p>
          </div>
        </div>
      )}
      <h3 className="mb-2 mt-8 text-base font-bold">{t("company.documents")}</h3>
      {data.documents.length === 0 ? <p className="text-sm text-muted">{t("company.noDocuments")}</p> : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {data.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <FileCheck2 className="h-5 w-5 text-muted" aria-hidden />
              <span className="min-w-0 flex-1"><span className="font-semibold text-night">{t(`company.docTypes.${d.type}`)}</span><span className="block truncate text-muted">{d.file.originalName} · {formatDate(d.createdAt)}</span></span>
              <Badge tone={kycTone[d.status]}>{KYC_STATUS_LABELS[d.status]}</Badge>
              <Button size="sm" variant="ghost" onClick={() => download(d.file.id, d.file.originalName)} aria-label={`Télécharger ${d.file.originalName}`}><Download className="h-4 w-4" aria-hidden /></Button>
            </li>
          ))}
        </ul>
      )}
    </CardBody></Card>
  );
}

function MembersCard({ data, onChange }: { data: CompanyView; onChange: () => Promise<unknown> }) {
  const { t } = useTranslation("app");
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(companyMemberInviteSchema), defaultValues: { contactRole: "AUTRE" as const } });
  const invite = handleSubmit(async (v) => {
    try { await api("/company/members", { method: "POST", body: v }); await onChange(); reset(); setOpen(false); toast.success(t("company.invited")); }
    catch (e) { if (e instanceof ApiError && e.fields) for (const [k, m] of Object.entries(e.fields)) setError(k as never, { message: m }); else toast.error(e instanceof ApiError ? e.message : "Invitation impossible."); }
  });
  const remove = async (userId: string) => { if (!confirm("Retirer ce collaborateur de l'organisation ?")) return; try { await api(`/company/members/${userId}`, { method: "DELETE" }); await onChange(); } catch (e) { toast.error(e instanceof ApiError ? e.message : "Action impossible."); } };
  return (
    <Card><CardBody>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl">{t("company.members")}</h2><p className="mt-1 text-sm text-muted">{t("company.membersHelp")}</p></div>{data.isOwner && <Button variant="secondary" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" aria-hidden />{t("company.invite")}</Button>}</div>
      <ul className="mt-5 divide-y divide-line rounded-md border border-line">
        {data.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="min-w-0 flex-1"><span className="font-semibold text-night">{m.user.firstName} {m.user.lastName}</span><span className="block truncate text-muted">{m.user.email} · {COMPANY_CONTACT_ROLE_LABELS[m.contactRole as keyof typeof COMPANY_CONTACT_ROLE_LABELS] ?? m.contactRole}</span></span>
            {m.isOwner ? <Badge tone="blue">{t("company.owner")}</Badge> : m.user.status === "EN_ATTENTE_EMAIL" ? <Badge tone="amber">Invitation en attente</Badge> : null}
            {data.isOwner && !m.isOwner && <Button size="sm" variant="ghost" onClick={() => remove(m.user.id)}>Retirer</Button>}
          </li>
        ))}
      </ul>
      <Modal open={open} onOpenChange={setOpen} title={t("company.invite")} description="Le collaborateur recevra un e-mail pour activer son compte.">
        <form onSubmit={invite} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("profile.firstName")} error={errors.firstName?.message}>{(p) => <Input {...p} {...register("firstName")} />}</Field>
            <Field label={t("profile.lastName")} error={errors.lastName?.message}>{(p) => <Input {...p} {...register("lastName")} />}</Field>
          </div>
          <Field label={t("profile.email")} error={errors.email?.message}>{(p) => <Input {...p} type="email" {...register("email")} />}</Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("company.jobTitle")} optional error={errors.jobTitle?.message}>{(p) => <Input {...p} {...register("jobTitle")} />}</Field>
            <Field label={t("company.contactRole")} error={errors.contactRole?.message}>{(p) => <Select {...p} {...register("contactRole")}>{COMPANY_CONTACT_ROLES.map((r) => <option key={r} value={r}>{COMPANY_CONTACT_ROLE_LABELS[r]}</option>)}</Select>}</Field>
          </div>
          <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={isSubmitting}>Envoyer l'invitation</Button></div>
        </form>
      </Modal>
    </CardBody></Card>
  );
}

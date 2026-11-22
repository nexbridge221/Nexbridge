import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { changePasswordSchema } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/dialog";
import { Alert, Badge, Card, CardBody, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError, getAccessToken, setAccessToken } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/stores/auth";

type Tab = "security" | "notifications" | "privacy";

export default function Settings() {
  const { t } = useTranslation("app");
  usePageTitle(t("settings.title"));
  const [tab, setTab] = useState<Tab>("security");
  const tabs: Tab[] = ["security", "notifications", "privacy"];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl">{t("settings.title")}</h1>
      <div role="tablist" aria-label={t("settings.title")} className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {tabs.map((k) => <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} onClick={() => setTab(k)} className={cn("-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold", tab === k ? "border-nexus text-nexus" : "border-transparent text-muted hover:text-night")}>{t(`settings.tabs.${k}`)}</button>)}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-6">
        {tab === "security" && <><PasswordCard /><TwoFactorCard /></>}
        {tab === "notifications" && <NotificationsCard />}
        {tab === "privacy" && <PrivacyCard />}
      </div>
    </div>
  );
}

function PasswordCard() {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(changePasswordSchema) });
  const onSubmit = handleSubmit(async (v) => {
    try { await api("/auth/change-password", { method: "POST", body: v }); setAccessToken(null); useAuth.setState({ user: null, status: "anonymous" }); reset(); toast.success(t("settings.password.done")); navigate("/connexion", { replace: true }); }
    catch (e) { if (e instanceof ApiError && e.fields) for (const [k, m] of Object.entries(e.fields)) setError(k as never, { message: m }); else if (e instanceof ApiError) setError("currentPassword", { message: e.message }); }
  });
  return (
    <Card><CardBody>
      <h2 className="text-xl">{t("settings.password.title")}</h2>
      <form onSubmit={onSubmit} noValidate className="mt-5 max-w-md space-y-5">
        <Field label={t("settings.password.current")} error={errors.currentPassword?.message}>{(p) => <Input {...p} type="password" autoComplete="current-password" {...register("currentPassword")} />}</Field>
        <Field label={t("settings.password.new")} help="10 caractères minimum, avec au moins une lettre et un chiffre." error={errors.newPassword?.message}>{(p) => <Input {...p} type="password" autoComplete="new-password" {...register("newPassword")} />}</Field>
        <Button type="submit" loading={isSubmitting}>{t("settings.password.submit")}</Button>
      </form>
    </CardBody></Card>
  );
}

function TwoFactorCard() {
  const { t } = useTranslation("app");
  const user = useAuth((s) => s.user)!;
  const reload = useAuth((s) => s.reload);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [dcode, setDcode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const start = async () => { setBusy(true); setError(null); try { setSetup(await api("/auth/2fa/setup", { method: "POST" })); } catch (e) { setError(e instanceof ApiError ? e.message : "Impossible de démarrer la configuration."); } finally { setBusy(false); } };
  const enable = async () => { setBusy(true); setError(null); try { await api("/auth/2fa/enable", { method: "POST", body: { code } }); await reload(); setSetup(null); setCode(""); toast.success(t("settings.twofa.activated")); } catch (e) { setError(e instanceof ApiError ? e.message : "Code incorrect."); } finally { setBusy(false); } };
  const disable = async () => { setBusy(true); setError(null); try { await api("/auth/2fa/disable", { method: "POST", body: { password: pw, code: dcode } }); await reload(); setDisableOpen(false); setPw(""); setDcode(""); toast.success(t("settings.twofa.disabled")); } catch (e) { setError(e instanceof ApiError ? e.message : "Action impossible."); } finally { setBusy(false); } };

  return (
    <Card><CardBody>
      <div className="flex items-center gap-3"><h2 className="text-xl">{t("settings.twofa.title")}</h2>{user.twoFactorEnabled && <Badge tone="green"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Activée</Badge>}</div>
      <p className="mt-1 text-sm text-muted">{t("settings.twofa.body")}</p>
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      {!user.twoFactorEnabled && !setup && <Button className="mt-5" onClick={start} loading={busy} disabled={!user.emailVerified}>{t("settings.twofa.enable")}</Button>}
      {!user.twoFactorEnabled && !user.emailVerified && <p className="mt-2 text-sm text-muted">Confirmez d'abord votre adresse e-mail.</p>}
      {setup && (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr]">
          <div className="rounded-md border border-line bg-white p-3" role="img" aria-label="QR code de configuration"><QRCodeSVG value={setup.otpauthUrl} size={168} /></div>
          <div className="space-y-4"><p className="text-sm">{t("settings.twofa.scan")}</p>
            <p className="text-xs text-muted">{t("settings.twofa.secret")} : <code className="select-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-night">{setup.secret}</code></p>
            <Field label={t("settings.twofa.code")}>{(p) => <Input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />}</Field>
            <div className="flex gap-3"><Button onClick={enable} loading={busy} disabled={code.length !== 6}>{t("settings.twofa.confirm")}</Button><Button variant="secondary" onClick={() => setSetup(null)}>Annuler</Button></div></div>
        </div>
      )}
      {user.twoFactorEnabled && <Button className="mt-5" variant="danger" onClick={() => { setError(null); setDisableOpen(true); }}>{t("settings.twofa.disable")}</Button>}
      <Modal open={disableOpen} onOpenChange={setDisableOpen} title={t("settings.twofa.disable")} description="Confirmez avec votre mot de passe et un code actuel.">
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Mot de passe">{(p) => <Input {...p} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
          <Field label={t("settings.twofa.code")}>{(p) => <Input {...p} inputMode="numeric" maxLength={6} value={dcode} onChange={(e) => setDcode(e.target.value.replace(/\D/g, ""))} />}</Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setDisableOpen(false)}>Annuler</Button><Button variant="danger" onClick={disable} loading={busy} disabled={!pw || dcode.length !== 6}>Désactiver</Button></div>
        </div>
      </Modal>
    </CardBody></Card>
  );
}

function NotificationsCard() {
  const { t } = useTranslation("app");
  const qc = useQueryClient();
  const types = ["challenge", "match", "project", "message", "system"] as const;
  const { data, isLoading } = useQuery({ queryKey: ["notif-prefs"], queryFn: () => api<{ preferences: { type: string; inApp: boolean; email: boolean }[] }>("/me/notification-preferences") });
  const get = (type: string) => data?.preferences.find((p) => p.type === type) ?? { type, inApp: true, email: true };
  const set = async (type: string, patch: Partial<{ inApp: boolean; email: boolean }>) => {
    const next = { ...get(type), ...patch };
    try { await api("/me/notification-preferences", { method: "PUT", body: next }); await qc.invalidateQueries({ queryKey: ["notif-prefs"] }); } catch { toast.error("Enregistrement impossible."); }
  };
  return (
    <Card><CardBody>
      <h2 className="text-xl">{t("settings.notifications.title")}</h2><p className="mt-1 text-sm text-muted">{t("settings.notifications.body")}</p>
      {isLoading ? <Skeleton className="mt-5 h-40" /> : (
        <table className="mt-5 w-full text-sm"><thead><tr className="border-b border-line text-left text-muted"><th scope="col" className="py-2 font-semibold">Type d'événement</th><th scope="col" className="w-28 py-2 text-center font-semibold">{t("settings.notifications.inApp")}</th><th scope="col" className="w-28 py-2 text-center font-semibold">{t("settings.notifications.email")}</th></tr></thead>
          <tbody>{types.map((k) => { const p = get(k); return (
            <tr key={k} className="border-b border-line last:border-0"><th scope="row" className="py-3 text-left font-medium text-night">{t(`settings.notifications.types.${k}`)}</th>
              <td className="text-center"><input type="checkbox" className="h-5 w-5 accent-nexus" checked={p.inApp} onChange={(e) => set(k, { inApp: e.target.checked })} aria-label={`${t(`settings.notifications.types.${k}`)} : ${t("settings.notifications.inApp")}`} /></td>
              <td className="text-center"><input type="checkbox" className="h-5 w-5 accent-nexus" checked={p.email} onChange={(e) => set(k, { email: e.target.checked })} aria-label={`${t(`settings.notifications.types.${k}`)} : ${t("settings.notifications.email")}`} /></td></tr>); })}</tbody></table>
      )}
    </CardBody></Card>
  );
}

function PrivacyCard() {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["privacy"], queryFn: () => api<{ consents: { id: string; type: string; version: string; grantedAt: string }[] }>("/me/privacy") });
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportData = async () => {
    const res = await fetch("/api/me/export", { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: "include" });
    if (!res.ok) return toast.error("Export impossible.");
    const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = url; a.download = "nexbridge-mes-donnees.json"; a.click(); URL.revokeObjectURL(url);
  };
  const remove = async () => {
    setBusy(true); setError(null);
    try { await api("/me/delete-account", { method: "POST", body: { password: pw } }); setAccessToken(null); useAuth.setState({ user: null, status: "anonymous" }); toast.success(t("settings.privacy.deleted")); navigate("/", { replace: true }); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Suppression impossible."); } finally { setBusy(false); }
  };
  return (
    <>
      <Card><CardBody>
        <h2 className="text-xl">{t("settings.privacy.title")}</h2><p className="mt-1 text-sm text-muted">{t("settings.privacy.body")}</p>
        <h3 className="mt-5 text-base font-bold">{t("settings.privacy.consents")}</h3>
        <ul className="mt-2 space-y-1.5 text-sm">{data?.consents.map((c) => <li key={c.id} className="text-muted"><span className="font-semibold text-night">{c.type}</span> — version {c.version}, accepté le {formatDate(c.grantedAt)}</li>)}</ul>
        <Button className="mt-5" variant="secondary" onClick={exportData}><Download className="h-4 w-4" aria-hidden />{t("settings.privacy.export")}</Button>
      </CardBody></Card>
      <Card className="border-red-200"><CardBody>
        <h2 className="text-xl text-red-800">{t("settings.privacy.delete")}</h2><p className="mt-1 text-sm text-muted">{t("settings.privacy.deleteBody")}</p>
        <Button className="mt-5" variant="danger" onClick={() => { setError(null); setOpen(true); }}>{t("settings.privacy.delete")}</Button>
      </CardBody></Card>
      <Modal open={open} onOpenChange={setOpen} title={t("settings.privacy.delete")} description={t("settings.privacy.deleteBody")}>
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label={t("settings.privacy.deleteConfirm")}>{(p) => <Input {...p} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><Button variant="danger" onClick={remove} loading={busy} disabled={!pw}>{t("settings.privacy.deleteSubmit")}</Button></div>
        </div>
      </Modal>
    </>
  );
}

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { ROLE_LABELS, ROLES, type Role } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError, getAccessToken } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/stores/auth";

interface U { id: string; email: string; firstName: string; lastName: string; phone: string | null; role: Role; status: string; createdAt: string; lastLoginAt: string | null; emailVerified: boolean; isDemo: boolean }
export async function downloadCsv(kind: string) { const r = await fetch(`/api/admin/export/${kind}.csv`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: "include" }); if (!r.ok) return toast.error("Export impossible."); const u = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = u; a.download = `${kind}.csv`; a.click(); URL.revokeObjectURL(u); }

export default function AdminUsers() {
  usePageTitle("Utilisateurs");
  const me = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const [f, setF] = useState({ q: "", role: "", status: "" });
  const [act, setAct] = useState<{ u: U; kind: "suspend" | "reactivate" | "role"; role?: Role } | null>(null); const [reason, setReason] = useState("");
  const q = useInfiniteQuery({ queryKey: ["admin-users", f], initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => api<{ users: U[]; nextCursor: string | null }>(`/admin/users?limit=30${f.q ? `&q=${encodeURIComponent(f.q)}` : ""}${f.role ? `&role=${f.role}` : ""}${f.status ? `&status=${f.status}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`), getNextPageParam: (l) => l.nextCursor ?? undefined });
  const users = q.data?.pages.flatMap((p) => p.users) ?? [];
  const patch = useMutation({ mutationFn: () => api(`/admin/users/${act!.u.id}`, { method: "PATCH", body: act!.kind === "role" ? { role: act!.role, reason } : { status: act!.kind === "suspend" ? "SUSPENDU" : "ACTIF", reason } }), onSuccess: async () => { toast.success("Modification enregistrée."); setAct(null); setReason(""); await qc.invalidateQueries({ queryKey: ["admin-users"] }); }, onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action impossible.") });
  const isSuper = me.role === "SUPER_ADMIN";
  const failure = (e: unknown) => toast.error(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Action impossible.");
  const done = async (msg: string) => { toast.success(msg); await qc.invalidateQueries({ queryKey: ["admin-users"] }); };
  const [edit, setEdit] = useState<{ u: U; firstName: string; lastName: string; email: string; phone: string } | null>(null);
  const [del, setDel] = useState<U | null>(null);
  const [create, setCreate] = useState<{ firstName: string; lastName: string; email: string } | null>(null);
  const save = useMutation({ mutationFn: () => api(`/admin/users/${edit!.u.id}`, { method: "PATCH", body: { firstName: edit!.firstName.trim(), lastName: edit!.lastName.trim(), email: edit!.email.trim().toLowerCase(), phone: edit!.phone.trim() || null } }), onSuccess: async () => { setEdit(null); await done("Profil mis à jour."); }, onError: failure });
  const reset = useMutation({ mutationFn: (id: string) => api(`/admin/users/${id}/reset-password`, { method: "POST" }), onSuccess: () => toast.success("Lien de réinitialisation envoyé par e-mail."), onError: failure });
  const remove = useMutation({ mutationFn: () => api(`/admin/users/${del!.id}`, { method: "DELETE" }), onSuccess: async () => { setDel(null); await done("Compte supprimé (anonymisé)."); }, onError: failure });
  const add = useMutation({ mutationFn: () => api("/admin/users", { method: "POST", body: { firstName: create!.firstName.trim(), lastName: create!.lastName.trim(), email: create!.email.trim() } }), onSuccess: async () => { setCreate(null); await done("Administrateur créé : un lien d'activation lui a été envoyé."); }, onError: failure });
  const protectedAdmin = (u: U) => (u.role === "ADMIN" || u.role === "SUPER_ADMIN") && !isSuper;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl sm:text-3xl">Utilisateurs</h1><div className="flex flex-wrap gap-2">{isSuper && <Button onClick={() => setCreate({ firstName: "", lastName: "", email: "" })}><UserPlus className="h-4 w-4" aria-hidden />Nouvel administrateur</Button>}<Button variant="secondary" onClick={() => void downloadCsv("users")}><Download className="h-4 w-4" aria-hidden />Exporter (CSV)</Button></div></div>
      <form role="search" className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-white p-3 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
        <div className="relative"><label className="sr-only" htmlFor="u-q">Rechercher</label><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden /><Input id="u-q" className="pl-9" placeholder="Nom ou e-mail" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <div><label className="sr-only" htmlFor="u-r">Rôle</label><Select id="u-r" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="">Tous les rôles</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></div>
        <div><label className="sr-only" htmlFor="u-s">Statut</label><Select id="u-s" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Tous les statuts</option><option value="ACTIF">Actif</option><option value="EN_ATTENTE_EMAIL">En attente d'e-mail</option><option value="SUSPENDU">Suspendu</option></Select></div>
      </form>
      {q.isLoading && <Skeleton className="h-40" />}
      <Card className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">Utilisateurs</caption><thead className="border-b border-line text-muted"><tr>{["Utilisateur", "Rôle", "Statut", "Inscrit le", "Dernière connexion", "Actions"].map((h) => <th key={h} scope="col" className="p-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{users.map((u) => <tr key={u.id}><th scope="row" className="p-3 text-left"><span className="font-semibold text-night">{u.firstName} {u.lastName}</span>{u.isDemo && <Badge tone="amber" className="ml-2">démo</Badge>}<span className="block text-xs font-normal text-muted">{u.email}</span></th><td className="p-3">{ROLE_LABELS[u.role]}</td><td className="p-3"><Badge tone={u.status === "ACTIF" ? "green" : u.status === "SUSPENDU" ? "red" : "amber"}>{u.status === "ACTIF" ? "Actif" : u.status === "SUSPENDU" ? "Suspendu" : "E-mail non confirmé"}</Badge></td><td className="p-3 text-muted">{formatDate(u.createdAt)}</td><td className="p-3 text-muted">{u.lastLoginAt ? formatDate(u.lastLoginAt) : "—"}</td>
          <td className="p-3">{u.id === me.id ? <span className="text-xs text-muted">Vous</span> : <div className="flex flex-wrap gap-1.5">{u.status === "SUSPENDU" ? <Button size="sm" variant="secondary" onClick={() => setAct({ u, kind: "reactivate" })}>Réactiver</Button> : <Button size="sm" variant="ghost" onClick={() => setAct({ u, kind: "suspend" })} disabled={(u.role === "ADMIN" || u.role === "SUPER_ADMIN") && !isSuper}>Suspendre</Button>}{isSuper && (u.role === "ADMIN" || u.role === "SUPER_ADMIN") && <Button size="sm" variant="ghost" onClick={() => setAct({ u, kind: "role", role: u.role === "ADMIN" ? "SUPER_ADMIN" : "ADMIN" })}>{u.role === "ADMIN" ? "Promouvoir" : "Rétrograder"}</Button>}{!protectedAdmin(u) && <><Button size="sm" variant="ghost" onClick={() => setEdit({ u, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone ?? "" })} aria-label={`Modifier ${u.firstName} ${u.lastName}`}><Pencil className="h-4 w-4" aria-hidden />Modifier</Button><Button size="sm" variant="ghost" loading={reset.isPending && reset.variables === u.id} onClick={() => reset.mutate(u.id)}>Mot de passe</Button>{u.role !== "SUPER_ADMIN" && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setDel(u)} aria-label={`Supprimer ${u.firstName} ${u.lastName}`}><Trash2 className="h-4 w-4" aria-hidden />Supprimer</Button>}</>}</div>}</td></tr>)}
          {q.isSuccess && users.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted">Aucun utilisateur ne correspond.</td></tr>}</tbody></table></Card>
      {q.hasNextPage && <div className="text-center"><Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Voir plus</Button></div>}
      <Modal open={Boolean(act)} onOpenChange={(o) => !o && setAct(null)} title={act?.kind === "suspend" ? "Suspendre ce compte ?" : act?.kind === "reactivate" ? "Réactiver ce compte ?" : "Changer le rôle ?"} description={act ? `${act.u.firstName} ${act.u.lastName} — ${act.u.email}${act.kind === "suspend" ? ". Ses sessions seront coupées immédiatement." : ""}` : undefined}>
        <Field label="Motif" optional>{(p) => <Textarea {...p} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setAct(null)}>Annuler</Button><Button variant={act?.kind === "suspend" ? "danger" : "primary"} loading={patch.isPending} onClick={() => patch.mutate()}>Confirmer</Button></div>
      </Modal>
      <Modal open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} title="Modifier le profil" description={edit ? `Compte ${ROLE_LABELS[edit.u.role]}. Changer l'adresse e-mail coupe les sessions ouvertes.` : undefined}>
        {edit && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Prénom">{(p) => <Input {...p} autoFocus maxLength={80} value={edit.firstName} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} />}</Field><Field label="Nom">{(p) => <Input {...p} maxLength={80} value={edit.lastName} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} />}</Field></div>
          <Field label="Adresse e-mail">{(p) => <Input {...p} type="email" maxLength={254} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />}</Field>
          <Field label="Téléphone" optional>{(p) => <Input {...p} type="tel" maxLength={30} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />}</Field>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Annuler</Button><Button type="submit" loading={save.isPending} disabled={!edit.firstName.trim() || !edit.lastName.trim() || !edit.email.trim()}>Enregistrer</Button></div>
        </form>}
      </Modal>
      <Modal open={Boolean(del)} onOpenChange={(o) => !o && setDel(null)} title="Supprimer ce compte ?" description={del ? `${del.firstName} ${del.lastName} — ${del.email}` : undefined}>
        <Alert tone="warning" title="Action irréversible">Le compte est anonymisé : il ne pourra plus se connecter et ses données personnelles sont effacées. Les contenus partagés avec d'autres (projets, évaluations) sont conservés sous « Utilisateur supprimé ». Pour une mesure temporaire, préférez la suspension.</Alert>
        <div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setDel(null)}>Annuler</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Supprimer définitivement</Button></div>
      </Modal>
      <Modal open={Boolean(create)} onOpenChange={(o) => !o && setCreate(null)} title="Nouvel administrateur" description="La personne reçoit un e-mail pour choisir son mot de passe. Vous ne le voyez jamais.">
        {create && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Prénom">{(p) => <Input {...p} autoFocus maxLength={80} value={create.firstName} onChange={(e) => setCreate({ ...create, firstName: e.target.value })} />}</Field><Field label="Nom">{(p) => <Input {...p} maxLength={80} value={create.lastName} onChange={(e) => setCreate({ ...create, lastName: e.target.value })} />}</Field></div>
          <Field label="Adresse e-mail">{(p) => <Input {...p} type="email" maxLength={254} value={create.email} onChange={(e) => setCreate({ ...create, email: e.target.value })} />}</Field>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setCreate(null)}>Annuler</Button><Button type="submit" loading={add.isPending} disabled={!create.firstName.trim() || !create.lastName.trim() || !create.email.trim()}>Créer et envoyer l'invitation</Button></div>
        </form>}
      </Modal>
    </div>
  );
}

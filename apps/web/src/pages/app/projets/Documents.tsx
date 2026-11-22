import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileText, Folder, FolderPlus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DOC_VISIBILITIES, DOC_VISIBILITY_LABELS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { api, ApiError, getAccessToken } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDateTime, fmtSize } from "@/lib/dates";
import { canContribute } from "@/lib/space";
import { useSpace } from "./ProjectLayout";

interface Doc { id: string; name: string; folderId: string | null; visibility: keyof typeof DOC_VISIBILITY_LABELS; createdById: string; versionCount: number; current: { versionNo: number; size: number; mime: string; uploadedBy: string; createdAt: string; previewable: boolean }; versions: { id: string; versionNo: number; size: number; uploadedBy: string; createdAt: string }[] }
interface FolderT { id: string; name: string; parentId: string | null; visibility: string }
const err = (e: unknown) => (e instanceof ApiError ? e.message : "Action impossible.");

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(`/api${url}`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: "include" });
  if (!res.ok) throw new Error("download");
  return res.blob();
}
export async function downloadDoc(projectId: string, doc: { id: string; name: string }, version?: number) {
  try { const blob = await fetchBlob(`/projects/${projectId}/documents/${doc.id}/download${version ? `?version=${version}` : ""}`); const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = doc.name; a.click(); URL.revokeObjectURL(u); } catch { toast.error("Téléchargement impossible."); }
}

function Preview({ projectId, doc, onClose }: { projectId: string; doc: Doc; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let u: string | null = null; fetchBlob(`/projects/${projectId}/documents/${doc.id}/download?inline=1`).then((b) => { u = URL.createObjectURL(b); setUrl(u); }, () => toast.error("Aperçu impossible.")); return () => { if (u) URL.revokeObjectURL(u); }; }, [projectId, doc.id]);
  const m = doc.current.mime;
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={doc.name} description={`Version ${doc.current.versionNo} · ${fmtSize(doc.current.size)}`}>
      {!url ? <Skeleton className="h-64" /> : m.startsWith("image/") ? <img src={url} alt={doc.name} className="max-h-[70dvh] w-full rounded object-contain" /> : m === "video/mp4" ? <video src={url} controls className="max-h-[70dvh] w-full rounded" /> : <iframe src={url} title={doc.name} className="h-[70dvh] w-full rounded border border-line" />}
    </Modal>
  );
}

export default function Documents() {
  const { id, overview } = useSpace();
  const qc = useQueryClient();
  const write = canContribute(overview.access.role, overview.access.readOnly);
  const lead = overview.access.role === "CHEF_PROJET" || overview.access.role === "MENTOR";
  const [folder, setFolder] = useState<string>("root");
  const [vis, setVis] = useState<keyof typeof DOC_VISIBILITY_LABELS>("TOUS");
  const [preview, setPreview] = useState<Doc | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const folders = useQuery({ queryKey: ["space", id, "folders"], queryFn: () => api<{ folders: FolderT[] }>(`/projects/${id}/documents/folders`) });
  const docs = useQuery({ queryKey: ["space", id, "documents", folder], queryFn: () => api<{ documents: Doc[] }>(`/projects/${id}/documents?folderId=${folder}`) });
  const refresh = useCallback(() => Promise.all([qc.invalidateQueries({ queryKey: ["space", id, "documents"] }), qc.invalidateQueries({ queryKey: ["space", id, "folders"] }), qc.invalidateQueries({ queryKey: ["space", id, "overview"] })]), [qc, id]);
  const upload = async (files: FileList | File[]) => {
    setBusy(true);
    for (const file of Array.from(files)) {
      const fd = new FormData(); fd.append("file", file); fd.append("visibility", vis); if (folder !== "root") fd.append("folderId", folder);
      try { await api(`/projects/${id}/documents`, { method: "POST", form: fd }); toast.success(`« ${file.name} » déposé.`); } catch (e) { toast.error(`${file.name} : ${err(e)}`); }
    }
    setBusy(false); await refresh();
  };
  const update = useMutation({ mutationFn: (v: { id: string; body: object }) => api(`/projects/${id}/documents/${v.id}`, { method: "PATCH", body: v.body }), onSuccess: refresh, onError: (e) => toast.error(err(e)) });
  const remove = useMutation({ mutationFn: (d: Doc) => api(`/projects/${id}/documents/${d.id}`, { method: "DELETE" }), onSuccess: async () => { toast.success("Document supprimé."); await refresh(); }, onError: (e) => toast.error(err(e)) });
  const mkFolder = useMutation({ mutationFn: (name: string) => api(`/projects/${id}/documents/folders`, { method: "POST", body: { name, parentId: folder === "root" ? null : folder, visibility: vis } }), onSuccess: async () => { setNewFolder(null); await refresh(); }, onError: (e) => toast.error(err(e)) });
  const rmFolder = useMutation({ mutationFn: (fid: string) => api(`/projects/${id}/documents/folders/${fid}`, { method: "DELETE" }), onSuccess: async () => { setFolder("root"); await refresh(); }, onError: (e) => toast.error(err(e)) });
  const current = folders.data?.folders.find((f) => f.id === folder);
  const children = folders.data?.folders.filter((f) => (folder === "root" ? !f.parentId : f.parentId === folder)) ?? [];

  return (
    <div className="space-y-4">
      <nav aria-label="Chemin" className="flex flex-wrap items-center gap-2 text-sm"><button className={cn("font-semibold", folder === "root" ? "text-night" : "text-nexus hover:underline")} onClick={() => setFolder("root")}>Racine</button>{current && <><span aria-hidden>/</span><span className="font-semibold text-night">{current.name}</span>{write && <Button size="sm" variant="ghost" aria-label="Supprimer ce dossier" onClick={() => rmFolder.mutate(current.id)}><Trash2 className="h-4 w-4" aria-hidden /></Button>}</>}</nav>
      {children.length > 0 && <ul className="flex flex-wrap gap-2">{children.map((f) => <li key={f.id}><button onClick={() => setFolder(f.id)} className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-night hover:border-nexus"><Folder className="h-4 w-4 text-amber-500" aria-hidden />{f.name}</button></li>)}</ul>}
      {write && (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }} className={cn("flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition", drag ? "border-nexus bg-blue-50" : "border-slate-300 bg-white")}>
          <Upload className="h-7 w-7 text-nexus" aria-hidden /><p className="text-sm font-semibold text-night">Glissez des fichiers ici ou</p>
          <input ref={input} type="file" multiple className="sr-only" id="doc-input" onChange={(e) => e.target.files && void upload(e.target.files)} />
          <div className="flex flex-wrap items-center justify-center gap-3"><Button onClick={() => input.current?.click()} loading={busy}>Choisir des fichiers</Button><Button variant="secondary" onClick={() => setNewFolder("")}><FolderPlus className="h-4 w-4" aria-hidden />Nouveau dossier</Button><div className="flex items-center gap-2"><label htmlFor="vis" className="text-xs font-semibold text-muted">Visibilité</label><Select id="vis" className="!w-44 !py-1.5 text-xs" value={vis} onChange={(e) => setVis(e.target.value as typeof vis)}>{DOC_VISIBILITIES.map((v) => <option key={v} value={v}>{DOC_VISIBILITY_LABELS[v]}</option>)}</Select></div></div>
          <p className="text-xs text-muted">PDF, Word, Excel, PowerPoint, images (PNG, JPG), MP4 (200 Mo max), ZIP — 25 Mo max pour les autres. Un fichier de même nom devient une nouvelle version (3 conservées).</p>
        </div>)}
      {docs.isLoading && <Skeleton className="h-32" />}
      {docs.data?.documents.length === 0 && children.length === 0 && <EmptyState icon={<FileText className="h-6 w-6" />} title="Aucun document ici" />}
      {docs.data && docs.data.documents.length > 0 && <Card><ul className="divide-y divide-line">{docs.data.documents.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 flex-1"><p className="truncate font-semibold text-night">{d.name} <Badge>v{d.current.versionNo}</Badge></p><p className="text-xs text-muted">{fmtSize(d.current.size)} · {d.current.uploadedBy} · {fmtDateTime(d.current.createdAt)}{d.versionCount > 1 ? ` · ${d.versionCount} versions` : ""}</p>
            {d.versionCount > 1 && <details className="mt-1 text-xs"><summary className="cursor-pointer font-semibold text-nexus">Historique des versions</summary><ul className="mt-1 space-y-1">{d.versions.map((v) => <li key={v.id}>v{v.versionNo} — {v.uploadedBy}, {fmtDateTime(v.createdAt)} <button className="font-semibold text-nexus hover:underline" onClick={() => void downloadDoc(id, d, v.versionNo)}>télécharger</button></li>)}</ul></details>}</div>
          {write && (lead || d.createdById) ? <><label className="sr-only" htmlFor={`v-${d.id}`}>Visibilité de {d.name}</label><Select id={`v-${d.id}`} className="!w-40 !py-1.5 text-xs" value={d.visibility} onChange={(e) => update.mutate({ id: d.id, body: { visibility: e.target.value } })}>{DOC_VISIBILITIES.map((v) => <option key={v} value={v}>{DOC_VISIBILITY_LABELS[v]}</option>)}</Select></> : <Badge>{DOC_VISIBILITY_LABELS[d.visibility]}</Badge>}
          {d.current.previewable && <Button size="sm" variant="ghost" onClick={() => setPreview(d)} aria-label={`Aperçu de ${d.name}`}><Eye className="h-4 w-4" aria-hidden /></Button>}
          <Button size="sm" variant="ghost" onClick={() => void downloadDoc(id, d)} aria-label={`Télécharger ${d.name}`}><Download className="h-4 w-4" aria-hidden /></Button>
          {write && <Button size="sm" variant="ghost" aria-label={`Supprimer ${d.name}`} onClick={() => { if (confirm(`Supprimer « ${d.name} » ?`)) remove.mutate(d); }}><Trash2 className="h-4 w-4" aria-hidden /></Button>}
        </li>))}</ul></Card>}
      {preview && <Preview projectId={id} doc={preview} onClose={() => setPreview(null)} />}
      <Modal open={newFolder !== null} onOpenChange={(o) => !o && setNewFolder(null)} title="Nouveau dossier"><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (newFolder?.trim()) mkFolder.mutate(newFolder.trim()); }}><Field label="Nom du dossier">{(p) => <Input {...p} autoFocus maxLength={80} value={newFolder ?? ""} onChange={(e) => setNewFolder(e.target.value)} />}</Field><div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setNewFolder(null)}>Annuler</Button><Button type="submit" loading={mkFolder.isPending} disabled={!newFolder?.trim()}>Créer</Button></div></form></Modal>
      {!write && <Alert tone="info">Accès en lecture seule.</Alert>}
    </div>
  );
}

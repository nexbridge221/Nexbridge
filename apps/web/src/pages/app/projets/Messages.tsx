import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Hash, Paperclip, Plus, Send, Smile, User as UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EMOJIS } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { Alert, Avatar, Badge, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { api, ApiError, getAccessToken } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDateTime, fmtSize, startOfDay } from "@/lib/dates";
import { canContribute } from "@/lib/space";
import { useSpace } from "./ProjectLayout";

interface Chan { id: string; type: "GENERAL" | "THEMATIQUE" | "DIRECT"; name: string; unread: number; otherUserId: string | null }
interface Msg { id: string; channelId: string; body: string; deleted: boolean; author: string; authorId: string; parentId: string | null; createdAt: string; editedAt: string | null; mentions: string[]; file: { id: string; originalName: string; size: number } | null; replies: number; reactions: { emoji: string; count: number; mine: boolean }[] }
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");

async function downloadFile(url: string, name: string) {
  const res = await fetch(`/api${url}`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: "include" });
  if (!res.ok) return toast.error("Téléchargement impossible.");
  const u = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u);
}

function MessageItem({ m, mine, canWrite, names, onReply, onReact, onDelete, onEdit, onOpenThread, base }: { m: Msg; mine: boolean; canWrite: boolean; names: Map<string, string>; onReply: (m: Msg) => void; onReact: (m: Msg, e: string) => void; onDelete: (m: Msg) => void; onEdit: (m: Msg) => void; onOpenThread?: (m: Msg) => void; base: string }) {
  const [pick, setPick] = useState(false);
  const [first = "", ...last] = m.author.split(" ");
  if (m.deleted) return <li className="px-4 py-1.5 text-xs italic text-muted">Message supprimé</li>;
  const text = m.body.split(/(@[\p{L}'’-]+(?: [\p{L}'’-]+)?)/gu).map((part, i) => part.startsWith("@") && [...names.values()].some((n) => part.slice(1).startsWith(n)) ? <strong key={i} className="rounded bg-blue-100 px-0.5 text-nexus-dark">{part}</strong> : part);
  return (
    <li className="group flex gap-3 px-4 py-2 hover:bg-slate-50">
      <Avatar first={first} last={last.join(" ")} size={34} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm"><span className="font-bold text-night">{m.author}</span> <span className="text-xs text-muted">{fmtDateTime(m.createdAt)}{m.editedAt ? " · modifié" : ""}</span></p>
        <p className="whitespace-pre-wrap break-words text-[15px] text-ink">{text}</p>
        {m.file && <button className="mt-1 inline-flex items-center gap-2 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-nexus hover:bg-cloud" onClick={() => void downloadFile(`${base}/channels/${m.channelId}/messages/${m.id}/file`, m.file!.originalName)}><Paperclip className="h-3.5 w-3.5" aria-hidden />{m.file.originalName} <span className="font-normal text-muted">({fmtSize(m.file.size)})</span></button>}
        {(m.reactions.length > 0 || m.replies > 0) && <div className="mt-1 flex flex-wrap items-center gap-1.5">{m.reactions.map((r) => <button key={r.emoji} disabled={!canWrite} aria-pressed={r.mine} aria-label={`${r.emoji} ${r.count}`} onClick={() => onReact(m, r.emoji)} className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", r.mine ? "border-nexus bg-blue-50 text-nexus" : "border-line bg-white")}>{r.emoji} {r.count}</button>)}{m.replies > 0 && onOpenThread && <button className="text-xs font-semibold text-nexus hover:underline" onClick={() => onOpenThread(m)}>{m.replies} réponse{m.replies > 1 ? "s" : ""}</button>}</div>}
        {canWrite && <div className="mt-1 flex flex-wrap items-center gap-3 text-xs opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
          {!m.parentId && <button className="font-semibold text-muted hover:text-nexus" onClick={() => onReply(m)}>Répondre</button>}
          <span className="relative"><button className="inline-flex items-center gap-1 font-semibold text-muted hover:text-nexus" aria-expanded={pick} onClick={() => setPick(!pick)}><Smile className="h-3.5 w-3.5" aria-hidden />Réagir</button>{pick && <span className="absolute left-0 top-5 z-10 flex gap-1 rounded-md border border-line bg-white p-1 shadow-pop">{EMOJIS.map((e) => <button key={e} className="rounded p-1 text-base hover:bg-slate-100" aria-label={`Réagir ${e}`} onClick={() => { onReact(m, e); setPick(false); }}>{e}</button>)}</span>}</span>
          {mine && <button className="font-semibold text-muted hover:text-nexus" onClick={() => onEdit(m)}>Modifier</button>}
          {(mine || canWrite) && <button className="font-semibold text-muted hover:text-red-700" onClick={() => onDelete(m)}>Supprimer</button>}
        </div>}
      </div>
    </li>
  );
}

export default function Messages() {
  const { id, overview, connected } = useSpace();
  const qc = useQueryClient();
  const me = JSON.parse(atob(String(getAccessToken()).split(".")[1] ?? "e30=")).sub as string;
  const canWrite = canContribute(overview.access.role, overview.access.readOnly);
  const base = `/projects/${id}`;
  const [sp, setSp] = useSearchParams();
  const names = new Map(overview.members.map((m) => [m.userId, m.name]));
  const chans = useQuery({ queryKey: ["space", id, "channels"], queryFn: () => api<{ channels: Chan[] }>(`${base}/channels`), refetchInterval: connected ? false : 10_000 });
  const cid = sp.get("canal") ?? chans.data?.channels[0]?.id ?? null;
  const current = chans.data?.channels.find((c) => c.id === cid);
  const [thread, setThread] = useState<Msg | null>(null);
  const msgs = useInfiniteQuery({ queryKey: ["space", id, "messages", cid, thread?.id ?? "top"], enabled: Boolean(cid), initialPageParam: undefined as string | undefined, refetchInterval: connected ? false : 8_000,
    queryFn: ({ pageParam }) => api<{ messages: Msg[]; nextCursor: string | null }>(`${base}/channels/${cid}/messages?limit=30${pageParam ? `&cursor=${pageParam}` : ""}${thread ? `&parentId=${thread.id}` : ""}`), getNextPageParam: (l) => l.nextCursor ?? undefined });
  const list = [...(msgs.data?.pages ?? [])].reverse().flatMap((p) => p.messages);
  const [body, setBody] = useState(""); const [mentionIds, setMentionIds] = useState<string[]>([]); const [file, setFile] = useState<{ id: string; originalName: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null); const [editing, setEditing] = useState<Msg | null>(null);
  const [showMentions, setShowMentions] = useState(false); const [newChan, setNewChan] = useState<{ type: "THEMATIQUE" | "DIRECT"; name: string; userId: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null); const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["space", id, "messages"] }), qc.invalidateQueries({ queryKey: ["space", id, "channels"] })]);
  // Marque comme lu à l'ouverture et à chaque nouveau message reçu pendant la lecture.
  const lastId = list[list.length - 1]?.id;
  useEffect(() => { if (cid && canWrite && !thread) { void api(`${base}/channels/${cid}/read`, { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: ["space", id, "channels"] })); } }, [cid, lastId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lastId, cid, thread?.id]);

  const send = useMutation({
    mutationFn: () => api(`${base}/channels/${cid}/messages`, { method: "POST", body: { body, parentId: (replyTo ?? thread)?.id ?? null, mentions: mentionIds.filter((u) => body.includes(`@${names.get(u)}`)), fileId: file?.id ?? null } }),
    onSuccess: async () => { setBody(""); setMentionIds([]); setFile(null); setReplyTo(null); await refresh(); }, onError: (e) => toast.error(err(e)),
  });
  const save = useMutation({ mutationFn: () => api(`${base}/channels/${cid}/messages/${editing!.id}`, { method: "PATCH", body: { body } }), onSuccess: async () => { setEditing(null); setBody(""); await refresh(); }, onError: (e) => toast.error(err(e)) });
  const react = useMutation({ mutationFn: (v: { m: Msg; e: string }) => api(`${base}/channels/${cid}/messages/${v.m.id}/reactions`, { method: "POST", body: { emoji: v.e } }), onSuccess: refresh, onError: (e) => toast.error(err(e)) });
  const del = useMutation({ mutationFn: (m: Msg) => api(`${base}/channels/${cid}/messages/${m.id}`, { method: "DELETE" }), onSuccess: refresh, onError: (e) => toast.error(err(e)) });
  const mkChan = useMutation({ mutationFn: () => api<{ channel: { id: string } }>(`${base}/channels`, { method: "POST", body: newChan!.type === "DIRECT" ? { type: "DIRECT", userId: newChan!.userId } : { type: "THEMATIQUE", name: newChan!.name } }), onSuccess: async (r) => { setNewChan(null); await qc.invalidateQueries({ queryKey: ["space", id, "channels"] }); setSp({ canal: r.channel.id }); }, onError: (e) => toast.error(err(e)) });
  const upload = async (f: File) => { const fd = new FormData(); fd.append("file", f); try { const r = await api<{ file: { id: string; originalName: string } }>(`${base}/channels/${cid}/upload`, { method: "POST", form: fd }); setFile(r.file); } catch (e) { toast.error(err(e)); } };
  const submit = () => { if (editing) save.mutate(); else send.mutate(); };

  if (overview.access.readOnly || !overview.members.some((m) => m.userId === me)) return <Alert tone="info" title="Messagerie réservée aux membres">Les échanges d'un projet ne sont lisibles que par ses membres.</Alert>;
  let lastDay = "";
  return (
    <div className="grid grid-cols-1 h-[calc(100dvh-340px)] min-h-[460px] overflow-hidden rounded-lg border border-line bg-white md:grid-cols-[230px_1fr]">
      <aside aria-label="Canaux" className="flex max-h-48 flex-col border-b border-line bg-cloud md:max-h-none md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-3 py-2.5"><h2 className="text-sm font-bold text-night">Canaux</h2>{canWrite && <Button size="sm" variant="ghost" aria-label="Nouveau canal ou message direct" onClick={() => setNewChan({ type: "THEMATIQUE", name: "", userId: "" })}><Plus className="h-4 w-4" /></Button>}</div>
        <ul className="flex-1 overflow-y-auto px-1.5 pb-2">{chans.data?.channels.map((c) => <li key={c.id}><button onClick={() => { setThread(null); setSp({ canal: c.id }); }} aria-current={c.id === cid} className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm", c.id === cid ? "bg-nexus font-semibold text-white" : "text-night hover:bg-slate-200/70")}>{c.type === "DIRECT" ? <UserIcon className="h-4 w-4 shrink-0" aria-hidden /> : <Hash className="h-4 w-4 shrink-0" aria-hidden />}<span className="flex-1 truncate">{c.name}</span>{c.unread > 0 && <span className={cn("rounded-full px-1.5 text-[11px] font-bold", c.id === cid ? "bg-white text-nexus" : "bg-red-600 text-white")}><span className="sr-only">{c.unread} non lus : </span>{c.unread}</span>}</button></li>)}</ul>
      </aside>
      <section aria-label={thread ? "Fil de discussion" : `Canal ${current?.name ?? ""}`} className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5"><h2 className="flex items-center gap-1.5 text-base font-bold text-night">{thread ? <><button className="text-nexus hover:underline" onClick={() => setThread(null)}>← #{current?.name}</button><span className="text-muted">/ fil</span></> : <>{current?.type === "DIRECT" ? <UserIcon className="h-4 w-4" aria-hidden /> : <Hash className="h-4 w-4" aria-hidden />}{current?.name}</>}</h2><Badge tone={connected ? "green" : "neutral"}>{connected ? "En direct" : "Actualisation périodique"}</Badge></header>
        <div className="flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="Messages">
          {msgs.hasNextPage && <div className="p-3 text-center"><Button size="sm" variant="secondary" onClick={() => msgs.fetchNextPage()} loading={msgs.isFetchingNextPage}>Messages précédents</Button></div>}
          {msgs.isLoading && <div className="space-y-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
          {thread && <ul className="border-b border-line bg-slate-50"><MessageItem m={thread} mine={thread.authorId === me} canWrite={false} names={names} onReply={() => undefined} onReact={() => undefined} onDelete={() => undefined} onEdit={() => undefined} base={base} /></ul>}
          <ul>{list.map((m) => { const day = startOfDay(new Date(m.createdAt)).toDateString(); const sep = day !== lastDay; lastDay = day; return (<div key={m.id}>{sep && <li className="sticky top-0 z-[1] bg-white/90 px-4 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-muted">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(m.createdAt))}</li>}<MessageItem m={m} mine={m.authorId === me} canWrite={canWrite} names={names} onReply={(x) => { setReplyTo(x); setThread(x); }} onReact={(x, e) => react.mutate({ m: x, e })} onDelete={(x) => { if (confirm("Supprimer ce message ?")) del.mutate(x); }} onEdit={(x) => { setEditing(x); setBody(x.body); }} onOpenThread={thread ? undefined : setThread} base={base} /></div>); })}</ul>
          {!msgs.isLoading && list.length === 0 && <p className="p-8 text-center text-sm text-muted">{thread ? "Aucune réponse pour l'instant." : "Aucun message. Lancez la conversation !"}</p>}
          <div ref={endRef} />
        </div>
        {canWrite && (
          <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); if (body.trim() || file) submit(); }}>
            {(editing || file) && <p className="mb-1.5 flex items-center gap-2 text-xs text-muted">{editing && <>Modification du message <button type="button" className="font-semibold text-nexus" onClick={() => { setEditing(null); setBody(""); }}>Annuler</button></>}{file && <><Paperclip className="h-3.5 w-3.5" aria-hidden />{file.originalName}<button type="button" className="font-semibold text-nexus" onClick={() => setFile(null)}>Retirer</button></>}</p>}
            <div className="flex items-end gap-2">
              <div className="relative flex-1"><label className="sr-only" htmlFor="composer">Votre message</label>
                <textarea id="composer" rows={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (body.trim() || file) submit(); } }} placeholder={thread ? "Répondre dans le fil…" : "Écrire un message (Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne)"} className="block w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-[15px] focus:border-nexus focus:outline-none focus:ring-2 focus:ring-nexus/30" />
                {showMentions && <ul className="absolute bottom-full left-0 z-10 mb-1 max-h-48 w-56 overflow-y-auto rounded-md border border-line bg-white p-1 shadow-pop">{overview.members.filter((m) => m.userId !== me).map((m) => <li key={m.userId}><button type="button" className="w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-slate-100" onClick={() => { setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${m.name} `); setMentionIds((x) => [...x, m.userId]); setShowMentions(false); }}>{m.name}</button></li>)}</ul>}
              </div>
              <input ref={fileRef} type="file" className="sr-only" id="chat-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
              <Button type="button" variant="ghost" aria-label="Mentionner un membre" aria-expanded={showMentions} onClick={() => setShowMentions(!showMentions)}><AtSign className="h-5 w-5" /></Button>
              <Button type="button" variant="ghost" aria-label="Joindre un fichier (25 Mo max)" onClick={() => fileRef.current?.click()}><Paperclip className="h-5 w-5" /></Button>
              <Button type="submit" loading={send.isPending || save.isPending} disabled={!body.trim() && !file}><Send className="h-4 w-4" aria-hidden /><span className="sr-only">Envoyer</span></Button>
            </div>
          </form>)}
      </section>
      <Modal open={Boolean(newChan)} onOpenChange={(o) => !o && setNewChan(null)} title="Nouvelle conversation">
        {newChan && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mkChan.mutate(); }}>
          <div role="group" aria-label="Type" className="inline-flex rounded-md border border-line p-0.5">{(["THEMATIQUE", "DIRECT"] as const).map((t) => <button type="button" key={t} aria-pressed={newChan.type === t} onClick={() => setNewChan({ ...newChan, type: t })} className={cn("rounded px-3 py-1.5 text-sm font-semibold", newChan.type === t ? "bg-nexus text-white" : "text-muted")}>{t === "THEMATIQUE" ? "Canal thématique" : "Message direct"}</button>)}</div>
          {newChan.type === "THEMATIQUE" ? <Field label="Nom du canal">{(p) => <Input {...p} autoFocus maxLength={60} value={newChan.name} onChange={(e) => setNewChan({ ...newChan, name: e.target.value })} />}</Field> : <Field label="Destinataire">{(p) => <select {...p} className="block w-full rounded-md border border-slate-300 px-3 py-2.5 text-[15px]" value={newChan.userId} onChange={(e) => setNewChan({ ...newChan, userId: e.target.value })}><option value="">Choisir…</option>{overview.members.filter((m) => m.userId !== me).map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select>}</Field>}
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setNewChan(null)}>Annuler</Button><Button type="submit" loading={mkChan.isPending} disabled={newChan.type === "THEMATIQUE" ? newChan.name.trim().length < 2 : !newChan.userId}>Ouvrir</Button></div></form>}
      </Modal>
    </div>
  );
}

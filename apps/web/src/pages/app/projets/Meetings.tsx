import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarPlus, Download, Video } from "lucide-react";
import { useState } from "react";
import { MEETING_TYPE_LABELS, MEETING_TYPES } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { api, ApiError, getAccessToken } from "@/lib/api";
import { fmtDateTime } from "@/lib/dates";
import { canContribute } from "@/lib/space";
import { useSpace } from "./ProjectLayout";
import { useSpaceInvalidate } from "./TaskPanel";

interface M { id: string; title: string; type: keyof typeof MEETING_TYPE_LABELS; startsAt: string; durationMin: number; agenda: string | null; videoUrl: string | null; minutes: string | null; createdById: string; createdBy: string; participants: { userId: string; name: string; rsvp: string }[] }
const isJitsi = (u: string | null) => { try { return Boolean(u) && new URL(u!).hostname === "meet.jit.si"; } catch { return false; } };
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");

export default function Meetings() {
  const { id, overview } = useSpace();
  const refresh = useSpaceInvalidate(id);
  const me = JSON.parse(atob(String(getAccessToken()).split(".")[1] ?? "e30=")).sub as string;
  const write = canContribute(overview.access.role, overview.access.readOnly);
  const { data, isLoading } = useQuery({ queryKey: ["space", id, "meetings"], queryFn: () => api<{ meetings: M[] }>(`/projects/${id}/meetings`) });
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState<M | null>(null);
  const [f, setF] = useState({ title: "", type: "COURANTE" as keyof typeof MEETING_TYPE_LABELS, date: "", time: "10:00", durationMin: 60, agenda: "", videoUrl: "", participantIds: [] as string[] });
  const [min, setMin] = useState<{ m: M; text: string } | null>(null);
  const create = useMutation({ mutationFn: () => api(`/projects/${id}/meetings`, { method: "POST", body: { title: f.title, type: f.type, startsAt: new Date(`${f.date}T${f.time}`).toISOString(), durationMin: f.durationMin, agenda: f.agenda || undefined, videoUrl: f.videoUrl || null, generateVideo: !f.videoUrl, participantIds: f.participantIds } }), onSuccess: async () => { setOpen(false); await refresh(); toast.success("Réunion planifiée, participants invités."); }, onError: (e) => toast.error(err(e)) });
  const rsvp = useMutation({ mutationFn: (v: { id: string; rsvp: "ACCEPTE" | "REFUSE" }) => api(`/projects/${id}/meetings/${v.id}/rsvp`, { method: "POST", body: { rsvp: v.rsvp } }), onSuccess: refresh });
  const saveMin = useMutation({ mutationFn: () => api(`/projects/${id}/meetings/${min!.m.id}`, { method: "PATCH", body: { minutes: min!.text } }), onSuccess: async () => { setMin(null); await refresh(); toast.success("Compte rendu enregistré."); }, onError: (e) => toast.error(err(e)) });
  const ics = async (m: M) => { const res = await fetch(`/api/projects/${id}/meetings/${m.id}/ics`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: "include" }); const u = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = u; a.download = "reunion.ics"; a.click(); URL.revokeObjectURL(u); };
  const now = Date.now(); const upcoming = (data?.meetings ?? []).filter((m) => new Date(m.startsAt).getTime() + m.durationMin * 60000 >= now).reverse(); const past = (data?.meetings ?? []).filter((m) => !upcoming.includes(m));
  const Row = (m: M) => { const mineP = m.participants.find((p) => p.userId === me); return (
    <li key={m.id}><Card><CardBody>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base">{m.title} <Badge>{MEETING_TYPE_LABELS[m.type]}</Badge></h3><p className="text-sm text-muted">{fmtDateTime(m.startsAt)} · {m.durationMin} min · organisée par {m.createdBy}</p></div>
        <div className="flex flex-wrap gap-2">{m.videoUrl && <Button asChild size="sm"><a href={m.videoUrl} target="_blank" rel="noopener noreferrer"><Video className="h-4 w-4" aria-hidden />Rejoindre</a></Button>}{isJitsi(m.videoUrl) && <Button size="sm" variant="secondary" onClick={() => setRoom(m)}>Rejoindre ici</Button>}<Button size="sm" variant="secondary" onClick={() => void ics(m)}><Download className="h-4 w-4" aria-hidden />.ics</Button></div></div>
      {m.agenda && <p className="mt-2 whitespace-pre-line text-sm"><strong>Ordre du jour :</strong> {m.agenda}</p>}
      <p className="mt-2 text-xs text-muted">Participants : {m.participants.map((p) => `${p.name}${p.rsvp === "ACCEPTE" ? " ✔" : p.rsvp === "REFUSE" ? " ✘" : ""}`).join(", ")}</p>
      <div className="mt-3 flex flex-wrap gap-2">{write && mineP && mineP.rsvp !== "ACCEPTE" && <Button size="sm" variant="secondary" onClick={() => rsvp.mutate({ id: m.id, rsvp: "ACCEPTE" })}>Je participe</Button>}{write && mineP && mineP.rsvp !== "REFUSE" && <Button size="sm" variant="ghost" onClick={() => rsvp.mutate({ id: m.id, rsvp: "REFUSE" })}>Je ne peux pas</Button>}{write && (m.createdById === me || ["CHEF_PROJET", "MENTOR"].includes(overview.access.role)) && <Button size="sm" variant="ghost" onClick={() => setMin({ m, text: m.minutes ?? "" })}>{m.minutes ? "Modifier le compte rendu" : "Ajouter un compte rendu"}</Button>}</div>
      {m.minutes && <details className="mt-3 rounded-md bg-cloud p-3 text-sm"><summary className="cursor-pointer font-semibold text-night">Compte rendu</summary><p className="mt-2 whitespace-pre-line">{m.minutes}</p></details>}
    </CardBody></Card></li>); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">Les liens de visioconférence sont générés automatiquement (Jitsi Meet). Vous pouvez les ouvrir dans un nouvel onglet ou « ici », dans la page (le service Jitsi n'est contacté qu'au clic).</p>{write && <Button onClick={() => { setF({ ...f, title: "", agenda: "", videoUrl: "", participantIds: [] }); setOpen(true); }}><CalendarPlus className="h-4 w-4" aria-hidden />Planifier une réunion</Button>}</div>
      {isLoading && <Skeleton className="h-32" />}
      {data && data.meetings.length === 0 && <EmptyState icon={<Video className="h-6 w-6" />} title="Aucune réunion planifiée" />}
      {upcoming.length > 0 && <section aria-labelledby="up-h"><h2 id="up-h" className="mb-2 text-lg">À venir</h2><ul className="space-y-3">{upcoming.map(Row)}</ul></section>}
      {past.length > 0 && <section aria-labelledby="past-h"><h2 id="past-h" className="mb-2 mt-4 text-lg">Historique</h2><ul className="space-y-3">{past.map(Row)}</ul></section>}
      <Modal open={open} onOpenChange={setOpen} title="Planifier une réunion">
        <form className="max-h-[70dvh] space-y-4 overflow-y-auto pr-1" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label="Titre">{(p) => <Input {...p} autoFocus maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4"><Field label="Type" className="sm:col-span-2">{(p) => <Select {...p} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}>{MEETING_TYPES.map((t) => <option key={t} value={t}>{MEETING_TYPE_LABELS[t]}</option>)}</Select>}</Field><Field label="Date">{(p) => <Input {...p} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}</Field><Field label="Heure">{(p) => <Input {...p} type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />}</Field></div>
          <Field label="Durée (minutes)">{(p) => <Input {...p} type="number" min={5} max={480} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) || 60 })} />}</Field>
          <Field label="Ordre du jour" optional>{(p) => <Textarea {...p} rows={3} value={f.agenda} onChange={(e) => setF({ ...f, agenda: e.target.value })} />}</Field>
          <Field label="Lien de visioconférence" optional help="Laissez vide pour générer un lien Jitsi Meet automatiquement.">{(p) => <Input {...p} type="url" placeholder="https://" value={f.videoUrl} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} />}</Field>
          <fieldset><legend className="mb-1.5 text-sm font-semibold text-night">Participants <span className="font-normal text-muted">(tous les membres si aucun choix)</span></legend><div className="flex flex-wrap gap-2">{overview.members.map((m) => { const on = f.participantIds.includes(m.userId); return <button key={m.userId} type="button" aria-pressed={on} onClick={() => setF({ ...f, participantIds: on ? f.participantIds.filter((x) => x !== m.userId) : [...f.participantIds, m.userId] })} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${on ? "border-nexus bg-nexus text-white" : "border-slate-300 bg-white hover:border-nexus"}`}>{m.name}</button>; })}</div></fieldset>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={create.isPending} disabled={!f.title.trim() || !f.date}>Planifier</Button></div>
        </form>
      </Modal>
      <Modal open={Boolean(min)} onOpenChange={(o) => !o && setMin(null)} title="Compte rendu" description={min?.m.title}>{min && <div className="space-y-4"><Textarea rows={10} value={min.text} onChange={(e) => setMin({ ...min, text: e.target.value })} aria-label="Compte rendu" maxLength={10000} /><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setMin(null)}>Annuler</Button><Button loading={saveMin.isPending} onClick={() => saveMin.mutate()}>Enregistrer</Button></div></div>}</Modal>
      <Modal open={Boolean(room)} onOpenChange={(o) => !o && setRoom(null)} title={room?.title ?? ""} description="Visioconférence Jitsi Meet : autorisez la caméra et le micro dans votre navigateur." wide>
        {room?.videoUrl && <iframe title={`Visioconférence : ${room.title}`} src={`${room.videoUrl}#config.prejoinPageEnabled=true`} allow="camera; microphone; display-capture; fullscreen" referrerPolicy="no-referrer" className="h-[70dvh] w-full rounded-md border border-line" />}
      </Modal>
    </div>
  );
}

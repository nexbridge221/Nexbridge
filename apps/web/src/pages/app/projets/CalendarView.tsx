import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { addDays, isoDay, sameDay, startOfDay, startOfMonth, startOfWeek } from "@/lib/dates";
import { useSpace } from "./ProjectLayout";

type Mode = "mois" | "semaine" | "jour";
interface Ev { kind: "TASK" | "MEETING" | "MILESTONE" | "DELIVERABLE"; id: string; title: string; at: string; status?: string }
const KIND = { TASK: { label: "Tâche", cls: "bg-blue-100 text-blue-900 border-blue-300" }, MEETING: { label: "Réunion", cls: "bg-violet-100 text-violet-900 border-violet-300" }, MILESTONE: { label: "Jalon", cls: "bg-amber-100 text-amber-900 border-amber-300" }, DELIVERABLE: { label: "Livrable", cls: "bg-teal-100 text-teal-900 border-teal-300" } } as const;
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function CalendarView({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const { id } = useSpace();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("mois");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const range = useMemo(() => {
    if (mode === "jour") return { from: cursor, to: addDays(cursor, 1) };
    if (mode === "semaine") { const s = startOfWeek(cursor); return { from: s, to: addDays(s, 7) }; }
    const s = startOfWeek(startOfMonth(cursor)); return { from: s, to: addDays(s, 42) };
  }, [mode, cursor]);
  const { data } = useQuery({ queryKey: ["space", id, "calendar", range.from.toISOString(), range.to.toISOString()], queryFn: () => api<{ events: Ev[] }>(`/projects/${id}/calendar?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`) });
  const events = data?.events ?? [];
  const step = (dir: 1 | -1) => setCursor((c) => mode === "jour" ? addDays(c, dir) : mode === "semaine" ? addDays(c, 7 * dir) : new Date(c.getFullYear(), c.getMonth() + dir, 1));
  const open = (e: Ev) => (e.kind === "TASK" ? onOpenTask(e.id) : navigate(e.kind === "MEETING" ? "../reunions" : e.kind === "MILESTONE" ? "../jalons" : "../livrables", { relative: "path" }));
  const title = new Intl.DateTimeFormat("fr-FR", mode === "jour" ? { dateStyle: "full" } : { month: "long", year: "numeric" }).format(cursor);
  const days = Array.from({ length: mode === "jour" ? 1 : mode === "semaine" ? 7 : 42 }, (_, i) => addDays(range.from, i));
  const Chip = ({ e }: { e: Ev }) => <button onClick={() => open(e)} className={cn("block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-semibold", KIND[e.kind].cls, e.status === "TERMINE" && "line-through opacity-60")} title={`${KIND[e.kind].label} : ${e.title}`}><span className="sr-only">{KIND[e.kind].label} : </span>{e.kind === "MEETING" ? `${new Date(e.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} ` : ""}{e.title}</button>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={() => step(-1)} aria-label="Précédent"><ChevronLeft className="h-4 w-4" /></Button><Button variant="secondary" size="sm" onClick={() => step(1)} aria-label="Suivant"><ChevronRight className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={() => setCursor(startOfDay(new Date()))}>Aujourd'hui</Button><h2 className="ml-2 text-lg capitalize" aria-live="polite">{title}</h2></div>
        <div role="group" aria-label="Affichage" className="inline-flex rounded-md border border-line bg-white p-0.5">{(["mois", "semaine", "jour"] as Mode[]).map((m) => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className={cn("rounded px-3 py-1.5 text-sm font-semibold capitalize", mode === m ? "bg-nexus text-white" : "text-muted hover:text-night")}>{m}</button>)}</div>
      </div>
      <ul className="flex flex-wrap gap-2 text-xs" aria-label="Légende">{Object.values(KIND).map((k) => <li key={k.label} className={cn("rounded border px-2 py-0.5 font-semibold", k.cls)}>{k.label}</li>)}</ul>
      {mode === "jour" ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">{events.length === 0 ? <li className="p-6 text-center text-sm text-muted">Rien de prévu ce jour.</li> : events.map((e) => <li key={`${e.kind}${e.id}`} className="p-3"><Chip e={e} /></li>)}</ul>
      ) : (
        <div className="overflow-x-auto"><div className="min-w-[640px] overflow-hidden rounded-lg border border-line bg-white">
          <div className="grid grid-cols-7 border-b border-line bg-cloud text-center text-xs font-bold text-muted">{DAYS.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">{days.map((d) => { const evs = events.filter((e) => sameDay(new Date(e.at), d)); const other = mode === "mois" && d.getMonth() !== cursor.getMonth(); return (
            <div key={isoDay(d)} className={cn("min-h-[104px] space-y-1 border-b border-r border-line p-1.5", other && "bg-slate-50/70")}>
              <p className={cn("text-xs font-bold", sameDay(d, new Date()) ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-nexus text-white" : other ? "text-slate-400" : "text-night")}>{d.getDate()}</p>
              {evs.slice(0, mode === "semaine" ? 8 : 3).map((e) => <Chip key={`${e.kind}${e.id}`} e={e} />)}{evs.length > (mode === "semaine" ? 8 : 3) && <button className="text-[11px] font-semibold text-nexus" onClick={() => { setMode("jour"); setCursor(d); }}>+{evs.length - 3} autres</button>}
            </div>); })}</div>
        </div></div>
      )}
    </div>
  );
}

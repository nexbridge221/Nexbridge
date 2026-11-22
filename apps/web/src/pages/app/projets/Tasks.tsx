import { closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Download, GripVertical, KanbanSquare, List, MessageSquare, Paperclip, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, taskCreateSchema, type TaskPriorityCode, type TaskStatusCode } from "@nexbridge/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { AvatarStack, PriorityBadge, StatusBadge, STATUS_DOT } from "@/components/space/bits";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDateTime, fmtDay, isLate } from "@/lib/dates";
import { canWriteTasks, type TaskT } from "@/lib/space";
import CalendarView from "./CalendarView";
import { useSpace } from "./ProjectLayout";
import TaskPanel, { useSpaceInvalidate } from "./TaskPanel";

type View = "kanban" | "liste" | "calendrier";
const byPos = (a: TaskT, b: TaskT) => a.position - b.position;
const err = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Action impossible.");

/* ---------------- Carte ---------------- */
function CardBody({ t, onOpen }: { t: TaskT; onOpen?: () => void }) {
  const late = isLate(t.dueDate, t.status === "TERMINE");
  return (
    <div className="space-y-2">
      <button type="button" onClick={onOpen} className="block w-full text-left text-sm font-semibold text-night hover:text-nexus">{t.title}</button>
      {t.labels.length > 0 && <ul className="flex flex-wrap gap-1">{t.labels.map((l) => <li key={l.id} className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: l.color }}>{l.name}</li>)}</ul>}
      <div className="flex flex-wrap items-center gap-2"><PriorityBadge p={t.priority} />{t.dueDate && <span className={cn("text-xs font-semibold", late ? "text-red-700" : "text-muted")}>{late ? "En retard · " : ""}{fmtDay(t.dueDate)}</span>}</div>
      <div className="flex items-center justify-between text-xs text-muted"><AvatarStack names={t.assignees.map((a) => a.name)} /><span className="flex items-center gap-2">{t.subtasks.total > 0 && <span title="Sous-tâches terminées">☑ {t.subtasks.done}/{t.subtasks.total}</span>}{t.comments > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="h-3 w-3" aria-hidden />{t.comments}</span>}{t.attachments > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="h-3 w-3" aria-hidden />{t.attachments}</span>}</span></div>
    </div>
  );
}
function SortableCard({ t, onOpen, canDrag }: { t: TaskT; onOpen: () => void; canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, disabled: !canDrag });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("rounded-md border border-line bg-white p-3 shadow-sm", isDragging && "opacity-40")}>
      <div className="flex gap-2">{canDrag && <button type="button" className="mt-0.5 cursor-grab touch-none text-slate-400 hover:text-night focus-visible:text-nexus" aria-label={`Déplacer « ${t.title} » (touches fléchées après avoir appuyé sur Espace)`} {...attributes} {...listeners}><GripVertical className="h-4 w-4" aria-hidden /></button>}<div className="min-w-0 flex-1"><CardBody t={t} onOpen={onOpen} /></div></div>
    </li>
  );
}
function Column({ status, tasks, onOpen, canWrite, onQuickAdd }: { status: TaskStatusCode; tasks: TaskT[]; onOpen: (id: string) => void; canWrite: boolean; onQuickAdd: (title: string) => Promise<void> }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  const [adding, setAdding] = useState(false); const [title, setTitle] = useState("");
  return (
    <section aria-label={TASK_STATUS_LABELS[status]} className={cn("flex w-[272px] shrink-0 flex-col rounded-lg bg-slate-100/80 p-2.5 xl:w-auto", isOver && "ring-2 ring-nexus/40")}>
      <header className="mb-2 flex items-center justify-between px-1"><h3 className="flex items-center gap-2 text-sm font-bold text-night"><span className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[status])} aria-hidden />{TASK_STATUS_LABELS[status]}</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-muted">{tasks.length}</span></header>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="min-h-[72px] flex-1 space-y-2">{tasks.map((t) => <SortableCard key={t.id} t={t} onOpen={() => onOpen(t.id)} canDrag={canWrite} />)}</ul>
      </SortableContext>
      {canWrite && (adding ? (
        <form className="mt-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); const t = title.trim(); if (!t) return; setTitle(""); await onQuickAdd(t); }}>
          <label className="sr-only" htmlFor={`qa-${status}`}>Titre de la nouvelle tâche</label><Input id={`qa-${status}`} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de la tâche" maxLength={160} onKeyDown={(e) => e.key === "Escape" && setAdding(false)} />
          <div className="flex gap-2"><Button type="submit" size="sm" disabled={!title.trim()}>Ajouter</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Annuler</Button></div>
        </form>
      ) : <button className="mt-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-muted hover:bg-white hover:text-night" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />Ajouter une tâche</button>)}
    </section>
  );
}

/* ---------------- Formulaire complet de création ---------------- */
function NewTaskModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<unknown> }) {
  const { id, overview } = useSpace();
  const [f, setF] = useState({ title: "", description: "", priority: "NORMALE" as TaskPriorityCode, dueDate: "", status: "A_FAIRE" as TaskStatusCode, assigneeIds: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => { const body = taskCreateSchema.parse({ ...f, dueDate: f.dueDate || null, description: f.description || undefined }); return api(`/projects/${id}/tasks`, { method: "POST", body }); },
    onSuccess: async () => { setF({ title: "", description: "", priority: "NORMALE", dueDate: "", status: "A_FAIRE", assigneeIds: [] }); setError(null); await onCreated(); onClose(); toast.success("Tâche créée."); },
    onError: (e) => setError(e instanceof Error && !(e instanceof ApiError) ? "Vérifiez les champs (titre obligatoire)." : err(e)),
  });
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Nouvelle tâche">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
        <Field label="Titre">{(p) => <Input {...p} autoFocus maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
        <Field label="Description" optional>{(p) => <Textarea {...p} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Colonne">{(p) => <Select {...p} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as TaskStatusCode })}>{TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}</Select>}</Field>
          <Field label="Priorité">{(p) => <Select {...p} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as TaskPriorityCode })}>{TASK_PRIORITIES.map((s) => <option key={s} value={s}>{TASK_PRIORITY_LABELS[s]}</option>)}</Select>}</Field>
          <Field label="Échéance" optional>{(p) => <Input {...p} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />}</Field>
        </div>
        <fieldset><legend className="mb-1.5 text-sm font-semibold text-night">Responsables</legend><div className="flex flex-wrap gap-2">{overview.members.map((m) => { const on = f.assigneeIds.includes(m.userId); return <button key={m.userId} type="button" aria-pressed={on} onClick={() => setF({ ...f, assigneeIds: on ? f.assigneeIds.filter((x) => x !== m.userId) : [...f.assigneeIds, m.userId] })} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${on ? "border-nexus bg-nexus text-white" : "border-slate-300 bg-white hover:border-nexus"}`}>{m.name}</button>; })}</div></fieldset>
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={onClose}>Annuler</Button><Button type="submit" loading={create.isPending} disabled={!f.title.trim()}>Créer la tâche</Button></div>
      </form>
    </Modal>
  );
}

/* ---------------- Page ---------------- */
export default function Tasks() {
  const { id, overview } = useSpace();
  const qc = useQueryClient();
  const refresh = useSpaceInvalidate(id);
  const [sp, setSp] = useSearchParams();
  const view = (sp.get("vue") as View) ?? "kanban";
  const openId = sp.get("tache");
  const write = canWriteTasks(overview.access.role, overview.access.readOnly);
  const [filters, setFilters] = useState({ q: "", assignee: "", priority: "", due: "" });
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: "title" | "status" | "priority" | "dueDate" | "updatedAt"; dir: 1 | -1 }>({ key: "dueDate", dir: 1 });
  const { data, isLoading } = useQuery({ queryKey: ["space", id, "tasks"], queryFn: () => api<{ tasks: TaskT[] }>(`/projects/${id}/tasks`), refetchInterval: 45_000 });
  const setParam = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const filtered = useMemo(() => (data?.tasks ?? []).filter((t) => {
    if (filters.q && !`${t.title} ${t.description ?? ""}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.assignee && !t.assignees.some((a) => a.userId === filters.assignee)) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.due === "late" && !isLate(t.dueDate, t.status === "TERMINE")) return false;
    if (filters.due === "week" && !(t.dueDate && new Date(t.dueDate) >= new Date() && new Date(t.dueDate) <= new Date(Date.now() + 7 * 86400_000))) return false;
    if (filters.due === "none" && t.dueDate) return false;
    return true;
  }), [data, filters]);
  const columns = useMemo(() => TASK_STATUSES.map((s) => ({ status: s, tasks: filtered.filter((t) => t.status === s).sort(byPos) })), [filtered]);

  const move = useMutation({
    mutationFn: (v: { taskId: string; status: TaskStatusCode; beforeId: string | null; afterId: string | null }) => api(`/projects/${id}/tasks/${v.taskId}/move`, { method: "POST", body: { status: v.status, beforeId: v.beforeId, afterId: v.afterId } }),
    onMutate: async (v) => { // mise à jour optimiste : la carte bouge tout de suite
      await qc.cancelQueries({ queryKey: ["space", id, "tasks"] });
      const prev = qc.getQueryData<{ tasks: TaskT[] }>(["space", id, "tasks"]);
      if (prev) {
        const pos = (tid: string | null) => prev.tasks.find((t) => t.id === tid)?.position;
        const a = pos(v.afterId), b = pos(v.beforeId);
        const newPos = a != null && b != null ? (a + b) / 2 : a != null ? a + 1000 : b != null ? b - 1000 : Math.max(0, ...prev.tasks.filter((t) => t.status === v.status).map((t) => t.position)) + 1000;
        qc.setQueryData(["space", id, "tasks"], { tasks: prev.tasks.map((t) => (t.id === v.taskId ? { ...t, status: v.status, position: newPos } : t)) });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["space", id, "tasks"], ctx.prev); toast.error(err(e)); },
    onSettled: () => void refresh(),
  });

  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const { active, over } = e; if (!over || !data) return;
    const activeTask = data.tasks.find((t) => t.id === active.id); if (!activeTask) return;
    const overId = String(over.id);
    const overTask = data.tasks.find((t) => t.id === overId);
    const status = overId.startsWith("col:") ? (overId.slice(4) as TaskStatusCode) : overTask?.status; if (!status) return;
    const col = columns.find((c) => c.status === status)!.tasks;
    const without = col.filter((t) => t.id !== activeTask.id);
    let idx = overTask ? without.findIndex((t) => t.id === overTask.id) : without.length;
    if (overTask && activeTask.status === status) { const oldI = col.findIndex((t) => t.id === activeTask.id), overI = col.findIndex((t) => t.id === overTask.id); if (oldI < overI) idx += 1; if (oldI === overI) return; }
    move.mutate({ taskId: activeTask.id, status, afterId: without[idx - 1]?.id ?? null, beforeId: without[idx]?.id ?? null });
  };

  const quickAdd = (status: TaskStatusCode) => async (title: string) => { try { await api(`/projects/${id}/tasks`, { method: "POST", body: { title, status } }); await refresh(); } catch (e) { toast.error(err(e)); } };
  const exportCsv = () => {
    const rows = [["Tâche", "Responsables", "Statut", "Priorité", "Début", "Échéance", "Sous-tâches", "Dernière modification"], ...filtered.map((t) => [t.title, t.assignees.map((a) => a.name).join(" / "), TASK_STATUS_LABELS[t.status], TASK_PRIORITY_LABELS[t.priority], t.startDate?.slice(0, 10) ?? "", t.dueDate?.slice(0, 10) ?? "", `${t.subtasks.done}/${t.subtasks.total}`, t.updatedAt.slice(0, 10)])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`).join(";")).join("\r\n"); // neutralise l'injection de formules
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "taches.csv"; a.click(); URL.revokeObjectURL(url);
  };
  const sorted = useMemo(() => [...filtered].sort((a, b) => { const k = sort.key; const va = k === "priority" ? TASK_PRIORITIES.indexOf(a.priority) : k === "status" ? TASK_STATUSES.indexOf(a.status) : (a[k] ?? "￿"); const vb = k === "priority" ? TASK_PRIORITIES.indexOf(b.priority) : k === "status" ? TASK_STATUSES.indexOf(b.status) : (b[k] ?? "￿"); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; }), [filtered, sort]);
  const th = (key: typeof sort.key, label: string) => <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="p-3 font-semibold"><button className="hover:text-night" onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : 1 })}>{label}{sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button></th>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Mode d'affichage" className="inline-flex rounded-md border border-line bg-white p-0.5">{([["kanban", "Kanban", KanbanSquare], ["liste", "Liste", List], ["calendrier", "Calendrier", CalendarDays]] as const).map(([k, l, Icon]) => <button key={k} aria-pressed={view === k} onClick={() => setParam("vue", k === "kanban" ? null : k)} className={cn("flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold", view === k ? "bg-nexus text-white" : "text-muted hover:text-night")}><Icon className="h-4 w-4" aria-hidden />{l}</button>)}</div>
        <div className="flex gap-2">{view === "liste" && <Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" aria-hidden />Exporter CSV</Button>}{write && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden />Nouvelle tâche</Button>}</div>
      </div>
      {view !== "calendrier" && (
        <form role="search" aria-label="Filtrer les tâches" className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
          <div className="relative"><label className="sr-only" htmlFor="f-q">Rechercher</label><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden /><Input id="f-q" className="pl-9" placeholder="Rechercher une tâche" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></div>
          <div><label className="sr-only" htmlFor="f-a">Responsable</label><Select id="f-a" value={filters.assignee} onChange={(e) => setFilters({ ...filters, assignee: e.target.value })}><option value="">Tous les responsables</option>{overview.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</Select></div>
          <div><label className="sr-only" htmlFor="f-p">Priorité</label><Select id="f-p" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}><option value="">Toutes les priorités</option>{TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}</Select></div>
          <div><label className="sr-only" htmlFor="f-d">Échéance</label><Select id="f-d" value={filters.due} onChange={(e) => setFilters({ ...filters, due: e.target.value })}><option value="">Toutes les échéances</option><option value="late">En retard</option><option value="week">Cette semaine</option><option value="none">Sans échéance</option></Select></div>
        </form>
      )}
      {isLoading && <div className="grid grid-cols-1 gap-3 sm:grid-cols-4"><Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" /></div>}

      {data && view === "kanban" && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))} onDragCancel={() => setDragId(null)} onDragEnd={onDragEnd}>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 xl:grid xl:grid-cols-4 xl:overflow-visible">{columns.map((c) => <Column key={c.status} status={c.status} tasks={c.tasks} onOpen={(tid) => setParam("tache", tid)} canWrite={write} onQuickAdd={quickAdd(c.status)} />)}</div>
          <DragOverlay>{dragId ? <div className="rounded-md border border-nexus bg-white p-3 shadow-pop"><CardBody t={data.tasks.find((t) => t.id === dragId)!} /></div> : null}</DragOverlay>
        </DndContext>
      )}
      {data && view === "kanban" && data.tasks.length === 0 && <EmptyState icon={<KanbanSquare className="h-6 w-6" />} title="Aucune tâche pour l'instant">{write ? "Ajoutez la première tâche dans la colonne « À faire »." : "L'équipe n'a pas encore créé de tâche."}</EmptyState>}

      {data && view === "liste" && (
        <div className="overflow-x-auto rounded-lg border border-line bg-white"><table className="w-full min-w-[860px] text-left text-sm"><caption className="sr-only">Liste des tâches</caption>
          <thead className="border-b border-line text-muted"><tr>{th("title", "Tâche")}<th scope="col" className="p-3 font-semibold">Responsable</th>{th("status", "Statut")}{th("priority", "Priorité")}<th scope="col" className="p-3 font-semibold">Début</th>{th("dueDate", "Échéance")}<th scope="col" className="p-3 font-semibold">Progression</th>{th("updatedAt", "Modifiée")}</tr></thead>
          <tbody className="divide-y divide-line">{sorted.map((t) => (
            <tr key={t.id} className="hover:bg-cloud/60"><td className="p-3"><button className="text-left font-semibold text-night hover:text-nexus hover:underline" onClick={() => setParam("tache", t.id)}>{t.title}</button></td><td className="p-3"><AvatarStack names={t.assignees.map((a) => a.name)} /></td>
              <td className="p-3">{write ? <><label className="sr-only" htmlFor={`st-${t.id}`}>Statut de {t.title}</label><Select id={`st-${t.id}`} className="!py-1.5 text-xs" value={t.status} onChange={(e) => move.mutate({ taskId: t.id, status: e.target.value as TaskStatusCode, afterId: null, beforeId: null })}>{TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}</Select></> : <StatusBadge s={t.status} />}</td>
              <td className="p-3"><PriorityBadge p={t.priority} /></td><td className="p-3 text-muted">{t.startDate ? fmtDay(t.startDate) : "—"}</td><td className={cn("p-3", isLate(t.dueDate, t.status === "TERMINE") ? "font-bold text-red-700" : "text-muted")}>{t.dueDate ? fmtDay(t.dueDate) : "—"}</td>
              <td className="p-3 text-muted">{t.subtasks.total ? `${t.subtasks.done}/${t.subtasks.total}` : t.status === "TERMINE" ? "100 %" : "—"}</td><td className="p-3 text-xs text-muted">{fmtDateTime(t.updatedAt)}</td></tr>))}
            {sorted.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted">Aucune tâche ne correspond aux filtres.</td></tr>}</tbody></table></div>
      )}
      {view === "calendrier" && <CalendarView onOpenTask={(tid) => setParam("tache", tid)} />}
      {openId && <TaskPanel taskId={openId} onClose={() => setParam("tache", null)} />}
      <NewTaskModal open={creating} onClose={() => setCreating(false)} onCreated={refresh} />
      <p className="text-xs text-muted"><Badge>Astuce</Badge> Glissez les cartes entre colonnes, ou utilisez le clavier : Tab jusqu'à la poignée, Espace pour saisir, flèches pour déplacer, Espace pour déposer.</p>
    </div>
  );
}

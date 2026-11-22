import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskPriorityCode, type TaskStatusCode } from "@nexbridge/shared";
import { Badge, Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

export const PRIORITY_TONE: Record<TaskPriorityCode, "teal" | "blue" | "amber" | "red"> = { BASSE: "teal", NORMALE: "blue", HAUTE: "amber", URGENTE: "red" };
export const STATUS_DOT: Record<TaskStatusCode, string> = { A_FAIRE: "bg-slate-400", EN_COURS: "bg-nexus", EN_REVISION: "bg-impact", TERMINE: "bg-emerald-600" };
export const PriorityBadge = ({ p }: { p: TaskPriorityCode }) => <Badge tone={PRIORITY_TONE[p]}>{TASK_PRIORITY_LABELS[p]}</Badge>;
export const StatusBadge = ({ s }: { s: TaskStatusCode }) => <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-night"><span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} aria-hidden />{TASK_STATUS_LABELS[s]}</span>;
export function AvatarStack({ names, max = 3 }: { names: string[]; max?: number }) {
  return (<span className="inline-flex -space-x-2" role="img" aria-label={names.join(", ") || "Non assigné"}>{names.slice(0, max).map((n) => { const [f = "", ...l] = n.split(" "); return <Avatar key={n} first={f} last={l.join(" ")} size={26} className="ring-2 ring-white" />; })}{names.length > max && <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-night ring-2 ring-white">+{names.length - max}</span>}</span>);
}
export const HEALTH = { VERT: { label: "Bonne santé", tone: "green" }, ORANGE: { label: "À surveiller", tone: "amber" }, ROUGE: { label: "En difficulté", tone: "red" } } as const;

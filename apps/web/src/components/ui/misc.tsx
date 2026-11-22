import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn("rounded-lg border border-line bg-white shadow-card", className)} {...p} />;
export const CardHeader = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn("p-5 pb-0 sm:p-6 sm:pb-0", className)} {...p} />;
export const CardBody = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn("p-5 sm:p-6", className)} {...p} />;

const badge = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    tone: {
      neutral: "bg-slate-100 text-slate-700",
      blue: "bg-blue-50 text-blue-800",
      violet: "bg-violet-50 text-impact-text",
      teal: "bg-teal-50 text-collab-text",
      amber: "bg-amber-50 text-amber-text",
      red: "bg-red-50 text-red-800",
      green: "bg-emerald-50 text-emerald-800",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export const Badge = ({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) => <span className={cn(badge({ tone }), className)} {...p} />;

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("nb-skeleton h-4 w-full", className)} aria-hidden />;

const alertTone = {
  info: { cls: "border-blue-200 bg-blue-50 text-blue-950", Icon: Info },
  success: { cls: "border-emerald-200 bg-emerald-50 text-emerald-950", Icon: CheckCircle2 },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-950", Icon: TriangleAlert },
  error: { cls: "border-red-200 bg-red-50 text-red-950", Icon: AlertCircle },
} as const;
export function Alert({ tone = "info", title, children, className, action }: { tone?: keyof typeof alertTone; title?: string; children?: ReactNode; className?: string; action?: ReactNode }) {
  const { cls, Icon } = alertTone[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border p-4 text-sm", cls, className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{title && <p className="font-semibold">{title}</p>}{children && <div className={title ? "mt-0.5" : ""}>{children}</div>}</div>
      {action}
    </div>
  );
}

export function Avatar({ first, last, size = 36, className }: { first: string; last: string; size?: number; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-nexus to-impact font-bold text-white", className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {`${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()}
    </span>
  );
}

export function Progress({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-200", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-gradient-to-r from-nexus to-impact transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

export const Spinner = ({ className }: { className?: string }) => <span role="status" aria-label="Chargement" className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-nexus", className)} />;

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nexus" aria-hidden>{icon}</div>}
      <p className="text-lg font-bold text-night">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Section({ id, tone = "light", eyebrow, title, subtitle, children, className, center = true }: { id?: string; tone?: "light" | "white" | "dark"; eyebrow?: string; title?: ReactNode; subtitle?: ReactNode; children?: ReactNode; className?: string; center?: boolean }) {
  const dark = tone === "dark";
  return (
    <section id={id} className={cn("py-16 sm:py-20 lg:py-24", tone === "white" && "bg-white", tone === "light" && "bg-cloud", dark && "bg-night text-slate-200", className)} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="nb-container">
        {(eyebrow || title || subtitle) && (
          <header className={cn("mb-10 max-w-3xl sm:mb-14", center && "mx-auto text-center")}>
            {eyebrow && <p className={cn("mb-3 text-sm font-bold uppercase tracking-[0.14em]", dark ? "text-innovation" : "text-nexus")}>{eyebrow}</p>}
            {title && <h2 id={id ? `${id}-title` : undefined} className={cn("text-3xl sm:text-4xl", dark && "text-white")}>{title}</h2>}
            {subtitle && <p className={cn("mt-4 text-lg", dark ? "text-slate-300" : "text-muted")}>{subtitle}</p>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}

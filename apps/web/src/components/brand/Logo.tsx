import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";

/** Logo NEXBRIDGE. `onDark` : icône d'application + mot-symbole recomposé en texte (NEX blanc, BRIDGE bleu clair), comme sur la bannière de la charte. */
export function Logo({ onDark = false, className, to = "/", compact = false }: { onDark?: boolean; className?: string; to?: string | null; compact?: boolean }) {
  const inner = onDark ? (
    <span className={cn("inline-flex shrink-0 items-center gap-2 sm:gap-2.5", className)}>
      <img src="/brand/app-icon.png" alt="" width={40} height={39} className="h-8 w-auto sm:h-10" />
      {!compact && (
        <span className="text-[18px] font-extrabold leading-none tracking-tight sm:text-[22px]" aria-hidden>
          <span className="text-white">NEX</span><span className="text-innovation">BRIDGE</span>
        </span>
      )}
      <span className="sr-only">NEXBRIDGE</span>
    </span>
  ) : (
    <img src="/brand/logo-full.png" alt="NEXBRIDGE — Connect. Innovate. Transform." width={1011} height={228} className={cn("h-9 w-auto max-w-full sm:h-12", className)} />
  );
  return to ? <Link to={to} aria-label="NEXBRIDGE — accueil" className="inline-flex rounded-md">{inner}</Link> : inner;
}

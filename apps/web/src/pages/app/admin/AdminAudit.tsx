import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Card, Skeleton } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/dates";

export default function AdminAudit() {
  usePageTitle("Journal d'audit");
  const [action, setAction] = useState("");
  const q = useInfiniteQuery({ queryKey: ["admin-audit", action], initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => api<{ entries: { id: string; action: string; actor: string; entityType: string | null; entityId: string | null; metadata: unknown; createdAt: string }[]; nextCursor: string | null }>(`/admin/audit?limit=50${action ? `&action=${encodeURIComponent(action)}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`), getNextPageParam: (l) => l.nextCursor ?? undefined });
  const rows = q.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl sm:text-3xl">Journal d'audit</h1>
      <p className="text-sm text-muted">Qui a fait quoi, quand. Journal en ajout seul : aucune entrée ne peut être modifiée ni supprimée depuis l'application. Les adresses IP sont conservées sous forme hachée.</p>
      <div className="max-w-sm"><label htmlFor="a-f" className="sr-only">Filtrer par action</label><Input id="a-f" placeholder="Filtrer par action (ex. auth, kyc, user)" value={action} onChange={(e) => setAction(e.target.value)} /></div>
      {q.isLoading && <Skeleton className="h-40" />}
      <Card><div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Journal d'audit (défilement horizontal)"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Journal d'audit</caption><thead className="border-b border-line text-muted"><tr>{["Date", "Acteur", "Action", "Objet", "Détails"].map((h) => <th key={h} scope="col" className="p-3 font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap p-3 text-muted">{fmtDateTime(r.createdAt)}</td><td className="p-3">{r.actor}</td><td className="p-3 font-mono text-xs font-semibold text-night">{r.action}</td><td className="p-3 text-xs text-muted">{r.entityType ?? "—"}{r.entityId ? ` · ${r.entityId.slice(0, 8)}…` : ""}</td><td className="max-w-xs truncate p-3 font-mono text-xs text-muted" title={r.metadata ? JSON.stringify(r.metadata) : ""}>{r.metadata ? JSON.stringify(r.metadata) : ""}</td></tr>)}{q.isSuccess && rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted">Aucune entrée.</td></tr>}</tbody></table></div></Card>
      {q.hasNextPage && <div className="text-center"><Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Voir plus</Button></div>}
    </div>
  );
}

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

interface N { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }

export default function Notifications() {
  const { t } = useTranslation("app");
  usePageTitle(t("notifications.title"));
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ["notifications", "list"], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<{ notifications: N[]; nextCursor: string | null; unreadCount: number }>(`/notifications?limit=20${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.notifications) ?? [];
  const unread = q.data?.pages[0]?.unreadCount ?? 0;
  const markAll = async () => { await api("/notifications/read-all", { method: "POST" }); await qc.invalidateQueries({ queryKey: ["notifications"] }); };
  const read = async (id: string) => { await api(`/notifications/${id}/read`, { method: "POST" }); await qc.invalidateQueries({ queryKey: ["notifications"] }); };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl sm:text-3xl">{t("notifications.title")}</h1>{unread > 0 && <Button variant="secondary" onClick={markAll}>{t("notifications.markAll")}</Button>}</div>
      {q.isLoading && <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
      {q.isSuccess && items.length === 0 && <EmptyState icon={<BellOff className="h-6 w-6" />} title={t("notifications.empty")} />}
      {items.length > 0 && <Card><ul className="divide-y divide-line">{items.map((n) => (
        <li key={n.id} className={cn("flex items-start gap-3 p-4", !n.readAt && "bg-blue-50/50")}>
          <span className={cn("mt-2 h-2.5 w-2.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-nexus")} aria-hidden />
          <div className="min-w-0 flex-1"><p className={cn("text-[15px]", n.readAt ? "font-medium" : "font-bold")}>{n.link ? <Link to={n.link} onClick={() => read(n.id)} className="hover:underline">{n.title}</Link> : n.title}{!n.readAt && <span className="sr-only"> (non lue)</span>}</p>{n.body && <p className="text-sm text-muted">{n.body}</p>}<p className="mt-1 text-xs text-muted">{formatDate(n.createdAt)}</p></div>
          {!n.readAt && <Button size="sm" variant="ghost" onClick={() => read(n.id)}>Marquer comme lue</Button>}
        </li>))}</ul></Card>}
      {q.hasNextPage && <div className="text-center"><Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Voir plus</Button></div>}
    </div>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Bell, Briefcase, ClipboardList, FolderKanban, GraduationCap, LayoutDashboard, LogOut, Menu as MenuIcon, Search, Settings, ShieldCheck, UserCircle, Users, X, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ROLE_LABELS, type Role } from "@nexbridge/shared";
import { Logo } from "@/components/brand/Logo";
import { EnvBanners } from "@/components/EnvBanners";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/dropdown";
import { Alert, Avatar, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/stores/auth";

interface NavItem { to: string; label: string; Icon: LucideIcon; soon?: boolean }

function navFor(role: Role, t: (k: string) => string): NavItem[] {
  const base: NavItem[] = [{ to: "/app/dashboard", label: t("nav.dashboard"), Icon: LayoutDashboard }];
  switch (role) {
    case "ETUDIANT": return [...base, { to: "/projets", label: t("nav.challenges"), Icon: Briefcase }, { to: "/app/candidatures", label: t("nav.applications"), Icon: ClipboardList }, { to: "/app/projets", label: t("nav.projects"), Icon: FolderKanban }, { to: "/app/badges", label: t("nav.badges"), Icon: Award }];
    case "ENTREPRISE": return [...base, { to: "/app/defis", label: "Mes défis", Icon: ClipboardList }, { to: "/app/organisation", label: t("nav.company"), Icon: Briefcase }, { to: "/app/projets", label: t("nav.projects"), Icon: FolderKanban }];
    case "MENTOR": return [...base, { to: "/app/mentor/projets", label: t("nav.mentoring"), Icon: FolderKanban }];
    case "REFERENT_ACADEMIQUE": return [...base, { to: "/app/academique/validations", label: "Validations", Icon: GraduationCap }, { to: "/app/projets", label: t("nav.projects"), Icon: FolderKanban }, { to: "/app/academique", label: "Cohortes et rapports", Icon: Users }];
    default: return [{ to: "/app/admin/tableau-de-bord", label: t("nav.adminDashboard"), Icon: ShieldCheck }, { to: "/app/admin/defis", label: t("nav.review"), Icon: ClipboardList }, { to: "/app/admin/organisations", label: "Organisations", Icon: Briefcase }, { to: "/app/admin/projets", label: "Gestion des projets", Icon: FolderKanban }, { to: "/app/projets", label: "Espaces projets", Icon: ClipboardList }, { to: "/app/admin/utilisateurs", label: t("nav.users"), Icon: Users }, { to: "/app/admin/catalogue", label: "Compétences et badges", Icon: Award }, { to: "/app/admin/moderation", label: "Modération", Icon: ShieldCheck }, { to: "/app/admin/paiements", label: "Paiements", Icon: Briefcase }, { to: "/app/admin/contenus", label: "Contenus du site", Icon: ClipboardList }, ...(role === "SUPER_ADMIN" ? [{ to: "/app/admin/audit", label: "Journal d'audit", Icon: ShieldCheck }, { to: "/app/admin/configuration", label: "Configuration", Icon: Settings }] : [])];
  }
}

export function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === "loading") return <div className="grid min-h-dvh place-items-center bg-cloud"><div className="w-72 space-y-3"><Skeleton className="h-10" /><Skeleton className="h-4" /><Skeleton className="h-4 w-2/3" /></div></div>;
  if (!user) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  return <AppLayout />;
}

/** Garde d'interface : un rôle non autorisé est renvoyé au tableau de bord (l'API reste l'autorité, elle répond 403/404). */
export function RequireRole({ roles }: { roles: string[] }) {
  const { user } = useAuth();
  if (!user) return null;
  return roles.includes(user.role) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}

function AppLayout() {
  const { t } = useTranslation("app");
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);

  const notifications = useQuery({ queryKey: ["notifications", "preview"], queryFn: () => api<{ notifications: { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }[]; unreadCount: number }>("/notifications?limit=5"), refetchInterval: 60_000, enabled: Boolean(user) });
  if (!user) return null;

  // Onboarding obligatoire tant que le profil de base n'est pas complété (hors pages de profil, paramètres, organisation).
  const free = ["/app/onboarding", "/app/profil", "/app/parametres", "/app/organisation", "/app/notifications"].some((p) => pathname.startsWith(p));
  if (!user.onboardingDone && !free && user.emailVerified) return <Navigate to="/app/onboarding" replace />;

  const items = navFor(user.role, t as never);
  const unread = notifications.data?.unreadCount ?? 0;
  const resend = async () => { try { await api("/auth/resend-verification", { method: "POST" }); toast.success(t("banner.resent")); } catch { toast.error("Envoi impossible pour le moment."); } };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5"><Logo className="h-11" /></div>
      <nav aria-label={t("nav.primary")} className="flex-1 space-y-1 overflow-y-auto px-3">
        {items.map(({ to, label, Icon, soon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cn("group flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-semibold transition-colors", isActive ? "bg-nexus text-white shadow-sm" : "text-slate-700 hover:bg-slate-100")}>
            <Icon className="h-5 w-5 shrink-0" aria-hidden /><span className="flex-1">{label}</span>{soon && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700 group-[.bg-nexus]:bg-white/25 group-[.bg-nexus]:text-white">Bientôt</span>}
          </NavLink>
        ))}
        <div className="my-3 h-px bg-line" />
        <NavLink to="/app/profil" className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-semibold", isActive ? "bg-nexus text-white" : "text-slate-700 hover:bg-slate-100")}><UserCircle className="h-5 w-5" aria-hidden />{t("nav.profile")}</NavLink>
        <NavLink to="/app/parametres" className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-semibold", isActive ? "bg-nexus text-white" : "text-slate-700 hover:bg-slate-100")}><Settings className="h-5 w-5" aria-hidden />{t("nav.settings")}</NavLink>
      </nav>
      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3"><Avatar first={user.firstName} last={user.lastName} /><div className="min-w-0"><p className="truncate text-sm font-bold text-night">{user.firstName} {user.lastName}</p><p className="truncate text-xs text-muted">{ROLE_LABELS[user.role]}</p></div></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-cloud">
      <a href="#contenu" className="nb-skip">Aller au contenu principal</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-white lg:block">{sidebar}</aside>
      {open && (<div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-night/60" onClick={() => setOpen(false)} aria-hidden /><div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-pop" role="dialog" aria-modal="true" aria-label={t("nav.primary")}><button className="absolute right-3 top-3 rounded-md p-2 text-muted hover:bg-slate-100" onClick={() => setOpen(false)} aria-label={t("nav.closeMenu")}><X className="h-5 w-5" /></button>{sidebar}</div></div>)}
      <div className="lg:pl-64">
        <EnvBanners />
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-2.5 text-night hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label={t("nav.openMenu")} aria-expanded={open}><MenuIcon className="h-6 w-6" /></button>
          <span className="min-w-0 lg:hidden"><Logo className="h-8" /></span>
          <form role="search" className="relative hidden max-w-md flex-1 sm:block" onSubmit={(e) => { e.preventDefault(); navigate(`/projets${search ? `?q=${encodeURIComponent(search)}` : ""}`); }}>
            <label htmlFor="global-search" className="sr-only">Rechercher un défi</label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input id="global-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un défi…" className="w-full rounded-full border border-line bg-cloud py-2.5 pl-10 pr-4 text-sm placeholder:text-slate-500 focus:border-nexus focus:outline-none focus:ring-2 focus:ring-nexus/30" />
          </form>
          <div className="ml-auto flex items-center gap-1.5">
            <Menu>
              <MenuTrigger className="relative rounded-full p-2.5 text-night hover:bg-slate-100" aria-label={unread ? `Notifications, ${unread} non lues` : "Notifications"}>
                <Bell className="h-5 w-5" aria-hidden />{unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
              </MenuTrigger>
              <MenuContent className="w-[min(20rem,calc(100vw-2rem))] p-0">
                <div className="border-b border-line px-4 py-3 text-sm font-bold text-night">{t("notifications.title")}</div>
                {notifications.data?.notifications.length ? notifications.data.notifications.map((n) => (
                  <MenuItem key={n.id} className="block rounded-none px-4 py-3" onSelect={() => { void api(`/notifications/${n.id}/read`, { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: ["notifications"] })); if (n.link) navigate(n.link); }}>
                    <span className={cn("block text-sm", n.readAt ? "font-medium" : "font-bold")}>{n.title}</span>{n.body && <span className="mt-0.5 block text-xs text-muted">{n.body}</span>}
                  </MenuItem>
                )) : <p className="px-4 py-6 text-center text-sm text-muted">{t("notifications.empty")}</p>}
                <div className="border-t border-line p-2"><MenuItem asChild><Link to="/app/notifications" className="justify-center text-nexus">Voir toutes les notifications</Link></MenuItem></div>
              </MenuContent>
            </Menu>
            <Menu>
              <MenuTrigger className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-slate-100" ><Avatar first={user.firstName} last={user.lastName} size={34} /><span className="sr-only">{t("nav.account")}</span></MenuTrigger>
              <MenuContent>
                <div className="px-3 py-2"><p className="text-sm font-bold text-night">{user.firstName} {user.lastName}</p><p className="text-xs text-muted">{user.email}</p></div>
                <MenuSeparator />
                <MenuItem asChild><Link to="/app/profil"><UserCircle className="h-4 w-4" aria-hidden />{t("nav.profile")}</Link></MenuItem>
                <MenuItem asChild><Link to="/app/parametres"><Settings className="h-4 w-4" aria-hidden />{t("nav.settings")}</Link></MenuItem>
                <MenuSeparator />
                <MenuItem onSelect={async () => { await logout(); qc.clear(); navigate("/", { replace: true }); }}><LogOut className="h-4 w-4" aria-hidden />{t("nav.logout")}</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </header>
        <main id="contenu" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {!user.emailVerified && <Alert tone="warning" className="mb-6" action={<Button size="sm" variant="secondary" onClick={resend}>{t("banner.resend")}</Button>}>{t("banner.verify")}</Alert>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

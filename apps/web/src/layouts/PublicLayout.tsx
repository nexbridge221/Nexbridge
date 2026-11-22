import { ChevronDown, Menu as MenuIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/dropdown";
import { EnvBanners } from "@/components/EnvBanners";
import { cn } from "@/lib/cn";
import { useAuth } from "@/stores/auth";
import { homePathForRole } from "@nexbridge/shared";

const link = ({ isActive }: { isActive: boolean }) =>
  cn("whitespace-nowrap rounded-md px-2.5 py-2 text-[13.5px] font-semibold transition-colors", isActive ? "bg-white/15 text-white" : "text-slate-200 hover:bg-white/10 hover:text-white");

export function PublicLayout() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { user, status } = useAuth();
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [pathname]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);

  const audience = [
    { to: "/entreprises", label: t("nav.companies") },
    { to: "/etudiants", label: t("nav.students") },
    { to: "/etablissements", label: t("nav.institutions") },
    { to: "/experts-mentors", label: t("nav.mentors") },
  ];
  const all = [{ to: "/", label: t("nav.home"), end: true }, { to: "/comment-ca-marche", label: t("nav.how") }, ...audience, { to: "/projets", label: t("nav.projects") }];

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenu" className="nb-skip">{t("nav.skip")}</a>
      <EnvBanners />
      <header className="sticky top-0 z-50 border-b border-white/10 bg-night/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo onDark />
          <nav aria-label={t("nav.main")} className="hidden items-center gap-0.5 lg:flex">
            <NavLink to="/" end className={link}>{t("nav.home")}</NavLink>
            <NavLink to="/comment-ca-marche" className={link}>{t("nav.how")}</NavLink>
            {/* ≥ 1380 px : tous les liens visibles ; sinon regroupés pour tenir sur une ligne */}
            <span className="hidden items-center gap-0.5 min-[1380px]:flex">{audience.map((a) => <NavLink key={a.to} to={a.to} className={link}>{a.label}</NavLink>)}</span>
            <span className="min-[1380px]:hidden">
              <Menu>
                <MenuTrigger className="flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-2 text-[13.5px] font-semibold text-slate-200 hover:bg-white/10 hover:text-white">Pour qui ?<ChevronDown className="h-4 w-4" aria-hidden /></MenuTrigger>
                <MenuContent align="start">{audience.map((a) => <MenuItem key={a.to} asChild><Link to={a.to}>{a.label}</Link></MenuItem>)}</MenuContent>
              </Menu>
            </span>
            <NavLink to="/projets" className={link}>{t("nav.projects")}</NavLink>
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            {status === "authenticated" && user ? (
              <Button asChild size="sm"><Link to={homePathForRole(user.role)}>Mon espace</Link></Button>
            ) : (
              <>
                <Button asChild variant="outlineLight" size="sm"><Link to="/connexion">{t("nav.login")}</Link></Button>
                <Button asChild size="sm"><Link to="/inscription">{t("nav.join")}</Link></Button>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <Button asChild size="sm" className="hidden sm:inline-flex"><Link to={status === "authenticated" && user ? homePathForRole(user.role) : "/inscription"}>{status === "authenticated" && user ? "Mon espace" : t("nav.join")}</Link></Button>
          <button className="rounded-md p-2.5 text-white hover:bg-white/10" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="menu-mobile" aria-label={open ? t("nav.close") : t("nav.menu")}>
            {open ? <X className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
          </button>
          </div>
        </div>
        {open && (
          <div id="menu-mobile" className="max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-white/10 bg-night px-4 pb-6 pt-3 lg:hidden">
            <nav aria-label={t("nav.main")} className="flex flex-col">
              {all.map((a) => <NavLink key={a.to} to={a.to} end={"end" in a} className={({ isActive }) => cn("rounded-md px-3 py-3 text-base font-semibold", isActive ? "bg-white/15 text-white" : "text-slate-200")}>{a.label}</NavLink>)}
            </nav>
            <div className="mt-4 grid gap-2">
              {status === "authenticated" && user ? (
                <Button asChild size="lg"><Link to={homePathForRole(user.role)}>Mon espace</Link></Button>
              ) : (
                <>
                  <Button asChild size="lg"><Link to="/inscription">{t("nav.join")}</Link></Button>
                  <Button asChild variant="outlineLight" size="lg"><Link to="/connexion">{t("nav.login")}</Link></Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>
      <main id="contenu" className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}

function Footer() {
  const { t } = useTranslation();
  const socials = [
    { label: "LinkedIn", href: import.meta.env.VITE_SOCIAL_LINKEDIN as string | undefined },
    { label: "Facebook", href: import.meta.env.VITE_SOCIAL_FACEBOOK as string | undefined },
    { label: "X", href: import.meta.env.VITE_SOCIAL_X as string | undefined },
    { label: "Instagram", href: import.meta.env.VITE_SOCIAL_INSTAGRAM as string | undefined },
    { label: "YouTube", href: import.meta.env.VITE_SOCIAL_YOUTUBE as string | undefined },
  ].filter((s) => s.href);
  const col = "space-y-2.5 text-sm";
  const a = "text-slate-300 hover:text-white";
  return (
    <footer className="bg-night text-slate-300">
      <div className="nb-container grid grid-cols-1 gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo onDark />
          <p className="mt-4 max-w-xs text-sm text-slate-300">{t("footer.tagline")}</p>
          <p className="mt-3 text-sm font-semibold tracking-wide text-white">{t("brand.slogan")}</p>
          {socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label={t("footer.social")}>
              {socials.map((s) => <li key={s.label}><a href={s.href} target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10">{s.label}</a></li>)}
            </ul>
          )}
        </div>
        <nav aria-label={t("footer.platform")}>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">{t("footer.platform")}</h2>
          <ul className={col}>
            <li><Link className={a} to="/comment-ca-marche">{t("nav.how")}</Link></li>
            <li><Link className={a} to="/projets">{t("nav.projects")}</Link></li>
            <li><Link className={a} to="/entreprises">{t("nav.companies")}</Link></li>
            <li><Link className={a} to="/etudiants">{t("nav.students")}</Link></li>
            <li><Link className={a} to="/etablissements">{t("nav.institutions")}</Link></li>
            <li><Link className={a} to="/experts-mentors">{t("nav.mentors")}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t("footer.company")}>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">{t("footer.company")}</h2>
          <ul className={col}>
            <li><Link className={a} to="/faq">{t("footer.faq")}</Link></li>
            <li><Link className={a} to="/contact">{t("footer.contact")}</Link></li>
            <li><Link className={a} to="/connexion">{t("nav.login")}</Link></li>
            <li><Link className={a} to="/inscription">{t("nav.join")}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t("footer.legal")}>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">{t("footer.legal")}</h2>
          <ul className={col}>
            <li><Link className={a} to="/mentions-legales">{t("footer.mentions")}</Link></li>
            <li><Link className={a} to="/cgu">{t("footer.cgu")}</Link></li>
            <li><Link className={a} to="/confidentialite">{t("footer.privacy")}</Link></li>
            <li><Link className={a} to="/cookies">{t("footer.cookies")}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10"><div className="nb-container py-5 text-[13px] text-slate-400">{t("footer.rights", { year: new Date().getFullYear() })}</div></div>
    </footer>
  );
}

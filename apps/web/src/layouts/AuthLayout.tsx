import { Link, Outlet } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { EnvBanners } from "@/components/EnvBanners";

export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-cloud">
      <a href="#contenu" className="nb-skip">Aller au contenu principal</a>
      <EnvBanners />
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <main id="contenu" className="flex min-w-0 flex-col px-4 py-8 sm:px-10">
          <div className="mx-auto w-full max-w-md flex-1"><div className="mb-10"><Logo /></div><Outlet /></div>
          <p className="mx-auto mt-10 w-full max-w-md text-xs text-muted"><Link to="/" className="font-semibold text-nexus hover:underline">← Retour au site</Link></p>
        </main>
        <aside className="relative hidden overflow-hidden bg-night lg:block" aria-hidden>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="a1" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#0b5fff" stopOpacity="0" /><stop offset="1" stopColor="#3b82f6" stopOpacity=".85" /></linearGradient>
              <linearGradient id="a2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#8b5cf6" stopOpacity="0" /><stop offset="1" stopColor="#a78bfa" stopOpacity=".75" /></linearGradient>
            </defs>
            <path d="M-50 820 C 180 600, 380 360, 650 120 L650 -10 L420 -10 C 300 240, 160 480, -50 700 Z" fill="url(#a1)" />
            <path d="M80 820 C 300 680, 480 520, 650 400 L650 260 C 470 380, 300 540, 180 820 Z" fill="url(#a2)" />
          </svg>
          <div className="relative flex h-full flex-col justify-end p-12 text-white">
            <img src="/brand/logo-mark.png" alt="" className="mb-8 h-16 w-auto" />
            <p className="max-w-md text-3xl font-extrabold leading-tight text-white">Les idées prennent vie lorsque les talents se rencontrent.</p>
            <p className="mt-4 text-sm font-semibold tracking-[0.18em] text-slate-300">CONNECT. INNOVATE. TRANSFORM.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

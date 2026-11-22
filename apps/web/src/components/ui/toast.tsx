import { CheckCircle2, X, AlertCircle } from "lucide-react";
import { create } from "zustand";

interface ToastItem { id: number; tone: "success" | "error"; message: string }
const useToastStore = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, "id">) => void; dismiss: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items, { ...t, id }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 5000);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (message: string) => useToastStore.getState().push({ tone: "success", message }),
  error: (message: string) => useToastStore.getState().push({ tone: "error", message }),
};

/** Région vocale (aria-live) : annonce les confirmations et erreurs aux lecteurs d'écran. */
export function Toaster() {
  const { items, dismiss } = useToastStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4" aria-live="polite" aria-atomic="false">
      {items.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-md border border-line bg-white p-4 text-sm shadow-pop nb-in">
          {t.tone === "success" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden />}
          <p className="flex-1 font-medium text-ink">{t.message}</p>
          <button onClick={() => dismiss(t.id)} aria-label="Fermer la notification" className="rounded p-1 text-muted hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

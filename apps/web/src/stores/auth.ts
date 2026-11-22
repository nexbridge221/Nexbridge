import { create } from "zustand";
import type { Role } from "@nexbridge/shared";
import { ApiError, api, refreshSession, setAccessToken, setSessionLostHandler } from "@/lib/api";

export interface SessionUser {
  id: string; email: string; firstName: string; lastName: string; role: Role;
  status: string; emailVerified: boolean; twoFactorEnabled: boolean; locale: string; onboardingDone: boolean; isDemo: boolean;
}
interface AuthState {
  user: SessionUser | null;
  status: "loading" | "authenticated" | "anonymous";
  bootstrap: () => Promise<void>;
  login: (input: { email: string; password: string; totp?: string }) => Promise<SessionUser>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: "loading",
  async bootstrap() {
    // Restaure la session grâce au cookie de rafraîchissement (jeton d'accès gardé en mémoire).
    if (await refreshSession()) {
      try {
        const { user } = await api<{ user: SessionUser }>("/auth/me");
        set({ user, status: "authenticated" });
        return;
      } catch { /* retombe sur anonyme */ }
    }
    set({ user: null, status: "anonymous" });
  },
  async login(input) {
    const res = await api<{ accessToken: string; user: SessionUser }>("/auth/login", { method: "POST", body: input, auth: false });
    setAccessToken(res.accessToken);
    set({ user: res.user, status: "authenticated" });
    return res.user;
  },
  async logout() {
    try { await api("/auth/logout", { method: "POST", auth: true }); } catch (e) { if (!(e instanceof ApiError)) throw e; }
    setAccessToken(null);
    set({ user: null, status: "anonymous" });
  },
  async reload() {
    const { user } = await api<{ user: SessionUser }>("/auth/me");
    set({ user });
  },
}));

setSessionLostHandler(() => { setAccessToken(null); useAuth.setState({ user: null, status: "anonymous" }); });
export const isAuthed = () => get_().status === "authenticated";
const get_ = () => useAuth.getState();

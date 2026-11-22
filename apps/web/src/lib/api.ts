/**
 * Client HTTP. Le jeton d'accès (15 min) est gardé UNIQUEMENT en mémoire (jamais dans localStorage) ;
 * la session persiste grâce au cookie HttpOnly de rafraîchissement. Sur 401, un rafraîchissement
 * unique est tenté (les appels concurrents partagent la même promesse), puis la requête est rejouée.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;
export const setSessionLostHandler = (fn: () => void) => { onSessionLost = fn; };

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return text; }
}

function toError(res: Response, body: unknown): ApiError {
  const e = (body as { error?: { code?: string; message?: string; details?: Record<string, string> } } | undefined)?.error;
  return new ApiError(res.status, e?.code ?? "ERROR", e?.message ?? "Une erreur est survenue. Réessayez.", e?.details && typeof e.details === "object" ? e.details : undefined);
}

export async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include", headers: { "X-Requested-With": "nexbridge" } });
      if (!res.ok) { accessToken = null; return false; }
      const body = (await res.json()) as { accessToken: string };
      accessToken = body.accessToken;
      return true;
    } catch { return false; } finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; form?: FormData; auth?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const doFetch = () => {
    const headers: Record<string, string> = { Accept: "application/json", "X-Requested-With": "nexbridge" };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (accessToken && init.auth !== false) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(`/api${path}`, {
      method: init.method ?? (init.body !== undefined || init.form ? "POST" : "GET"),
      credentials: "include",
      headers,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      signal: init.signal,
    });
  };
  let res: Response;
  try { res = await doFetch(); } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK", "Connexion impossible. Vérifiez votre réseau et réessayez.");
  }
  if (res.status === 401 && init.auth !== false && !path.startsWith("/auth/login") && !path.startsWith("/auth/refresh")) {
    const body = await parse(res.clone());
    const code = (body as { error?: { code?: string } })?.error?.code;
    if (code === "TOKEN_INVALID" || code === "UNAUTHENTICATED") {
      if (await refreshSession()) res = await doFetch();
      else { onSessionLost?.(); throw toError(res, body); }
    }
  }
  const body = await parse(res);
  if (!res.ok) throw toError(res, body);
  return body as T;
}

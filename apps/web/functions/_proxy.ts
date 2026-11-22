/** Relais vers l'API : le navigateur ne voit qu'une seule origine (cookie de session « SameSite=Strict » inchangé). */
export interface ProxyEnv { API_ORIGIN?: string }

export async function proxyToApi(request: Request, env: ProxyEnv): Promise<Response> {
  if (!env.API_ORIGIN) {
    return new Response(JSON.stringify({ error: { code: "API_NOT_CONFIGURED", message: "L'adresse de l'API n'est pas configurée (variable API_ORIGIN)." } }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, env.API_ORIGIN);
  const headers = new Headers(request.headers);
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) headers.set("X-Forwarded-For", clientIp);
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", "https");
  return fetch(new Request(target.toString(), { method: request.method, headers, body: request.body, redirect: "manual" }));
}

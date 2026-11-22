import { proxyToApi, type ProxyEnv } from "../_proxy";

export const onRequest = (ctx: { request: Request; env: ProxyEnv }) => proxyToApi(ctx.request, ctx.env);

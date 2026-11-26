/* Entrada do Cloudflare Worker: /api/* vai para o handler; o resto são os arquivos estáticos. */
import { handle } from "./handler.js";
import { d1Store } from "./d1store.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return handle(request, env, d1Store(env.DB));
    return env.ASSETS.fetch(request);
  },
};

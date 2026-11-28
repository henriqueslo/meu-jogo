/* Entrada do Cloudflare Worker.
 *   /api/v1/cups*                  -> salas de campeonato (Durable Objects)
 *   /api/*                         -> desafio do dia, saúde (D1)
 *   resto                          -> arquivos estáticos
 * Cada resposta de API é contada em segundo plano (metrics.js) sem atrasar o jogador. */
import { handle } from "./handler.js";
import { handleRooms } from "./rooms-api.js";
import { d1Store } from "./d1store.js";
import { observe } from "./metrics.js";
import { runPurge } from "./retention.js";

export { CupRoom } from "./room-do.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const store = d1Store(env.DB);
    const res = (await handleRooms(request, env, store)) ?? (await handle(request, env, store));
    ctx.waitUntil(observe(request, res, store));
    return res;
  },
  // Cron diário (wrangler.toml [triggers]): aplica os prazos de retenção da Política de Privacidade.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runPurge(d1Store(env.DB)));
  },
};

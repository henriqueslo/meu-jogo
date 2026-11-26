/* Entrada do Cloudflare Worker.
 *   /api/v1/rooms*, /api/v1/cups*  -> salas (Durable Objects)
 *   /api/*                         -> desafio do dia, saúde (D1)
 *   resto                          -> arquivos estáticos
 * Cada resposta de API é contada em segundo plano (metrics.js) sem atrasar o jogador. */
import { handle } from "./handler.js";
import { handleRooms } from "./rooms-api.js";
import { d1Store } from "./d1store.js";
import { observe } from "./metrics.js";

export { Room, CupRoom } from "./room-do.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const store = d1Store(env.DB);
    const res = (await handleRooms(request, env, store)) ?? (await handle(request, env, store));
    ctx.waitUntil(observe(request, res, store));
    return res;
  },
};

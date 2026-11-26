/* Entrada do Cloudflare Worker.
 *   /api/v1/rooms*  -> salas de duelo (Durable Object)
 *   /api/*          -> desafio do dia (D1)
 *   resto           -> arquivos estáticos */
import { handle } from "./handler.js";
import { handleRooms } from "./rooms-api.js";
import { d1Store } from "./d1store.js";

export { Room } from "./room-do.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const store = d1Store(env.DB);
    return (await handleRooms(request, env, store)) ?? handle(request, env, store);
  },
};

/* Rotas HTTP/WebSocket das salas de duelo (Fase 2).
 *   POST /api/v1/rooms              -> 201 { code }   (cria a sala; rate limit por rede)
 *   GET  /api/v1/rooms/:code/ws     -> upgrade WebSocket (mesma origem obrigatória)
 * Protocolo das mensagens: docs/API.md. */
import { ApiError, json, problem, secretOf, sha256Hex } from "./handler.js";
import { newCode, isCode, normalizeCode, originAllowed } from "./rooms.js";

export const MAX_ROOMS_PER_HOUR = 10;

const randomSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];

export async function createRoom(request, env, store, now = new Date()) {
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const hour = now.toISOString().slice(0, 13);                       // janela de 1 h
  const key = "room:" + (await sha256Hex(`${secretOf(env)}|${hour}|${ip}`));
  if ((await store.hit(key, now.toISOString())) > MAX_ROOMS_PER_HOUR) {
    throw new ApiError(429, "rate-limited", "Too many requests", "Limite de salas por hora atingido.", { retry_after: 3600 });
  }
  for (let i = 0; i < 4; i++) {                                      // colisão de código é raríssima; tenta de novo
    const code = newCode();
    const res = await env.ROOM.get(env.ROOM.idFromName(code)).fetch("https://room/init", {
      method: "POST", body: JSON.stringify({ code, seed: randomSeed() }),
    });
    if (res.status === 201) return json({ code }, 201);
    if (res.status !== 409) break;
  }
  throw new Error("não foi possível criar a sala");
}

export async function roomSocket(request, env, rawCode) {
  const code = normalizeCode(rawCode);
  if (!isCode(code)) throw new ApiError(404, "not-found", "Not found", "Sala inexistente.");
  if (request.headers.get("upgrade") !== "websocket") throw new ApiError(426, "upgrade-required", "Upgrade required", "Use WebSocket.");
  if (!originAllowed(request)) throw new ApiError(403, "forbidden-origin", "Forbidden origin", "Origem não permitida.");
  return env.ROOM.get(env.ROOM.idFromName(code)).fetch(request);
}

/* Retorna Response se a rota for de salas, senão null. */
export async function handleRooms(request, env, store, now = new Date()) {
  const { pathname } = new URL(request.url);
  const path = pathname.replace(/\/+$/, "");
  try {
    if (path === "/api/v1/rooms") {
      if (request.method !== "POST") throw new ApiError(405, "method-not-allowed", "Method not allowed", "Use POST.");
      return await createRoom(request, env, store, now);
    }
    const m = path.match(/^\/api\/v1\/rooms\/([^/]+)\/ws$/);
    if (m && request.method === "GET") return await roomSocket(request, env, m[1]);
    return null;
  } catch (e) {
    if (e instanceof ApiError) return problem(e, path);
    console.error("rooms unhandled", e);
    return problem(new ApiError(500, "internal", "Internal error", "Erro interno."), path);
  }
}

/* Rotas HTTP/WebSocket das salas multiplayer (campeonato e leilão).
 *   POST /api/v1/{cups|auctions}            -> 201 { code }   (cria a sala; rate limit por rede)
 *   GET  /api/v1/{cups|auctions}/:code/ws   -> upgrade WebSocket (mesma origem obrigatória)
 * Protocolo das mensagens: docs/API.md. */
import { ApiError, json, problem, secretOf, sha256Hex } from "./handler.js";
import { newCode, isCode, normalizeCode, originAllowed } from "./rooms.js";
import { log } from "./log.js";

export const MAX_ROOMS_PER_HOUR = 10;
const KINDS = { cups: { ns: "CUP", key: "cup" }, auctions: { ns: "AUCTION", key: "auction" } };

const randomSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];

export async function createRoom(request, env, store, now = new Date(), kind = KINDS.cups) {
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const hour = now.toISOString().slice(0, 13);                       // janela de 1 h
  const key = kind.key + ":" + (await sha256Hex(`${secretOf(env)}|${hour}|${ip}`));
  if ((await store.hit(key, now.toISOString())) > MAX_ROOMS_PER_HOUR) {
    throw new ApiError(429, "rate-limited", "Too many requests", "Limite de salas por hora atingido.", { retry_after: 3600 });
  }
  for (let i = 0; i < 4; i++) {                                      // colisão de código é raríssima; tenta de novo
    const code = newCode();
    const res = await env[kind.ns].get(env[kind.ns].idFromName(code)).fetch("https://room/init", {
      method: "POST", body: JSON.stringify({ code, seed: randomSeed() }),
    });
    if (res.status === 201) return json({ code }, 201);
    if (res.status !== 409) break;
  }
  throw new Error("não foi possível criar a sala");
}

/* Existe? (usado para validar a sala guardada antes de oferecer "voltar"). Não revela mais que a fase. */
export const MAX_INFO_PER_HOUR = 60;
export async function roomInfo(request, env, store, rawCode, kind = KINDS.cups, now = new Date()) {
  const code = normalizeCode(rawCode);
  if (!isCode(code)) throw new ApiError(404, "not-found", "Not found", "Sala inexistente.");
  // limite por rede: impede varrer códigos para descobrir salas existentes
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const key = "info:" + (await sha256Hex(`${secretOf(env)}|${now.toISOString().slice(0, 13)}|${ip}`));
  if ((await store.hit(key, now.toISOString())) > MAX_INFO_PER_HOUR) {
    throw new ApiError(429, "rate-limited", "Too many requests", "Muitas consultas. Tente mais tarde.", { retry_after: 3600 });
  }
  const res = await env[kind.ns].get(env[kind.ns].idFromName(code)).fetch("https://room/info");
  if (res.status === 404) throw new ApiError(404, "not-found", "Not found", "Sala inexistente.");
  return json({ exists: true, ...(await res.json()) });
}

export async function roomSocket(request, env, rawCode, kind = KINDS.cups) {
  const code = normalizeCode(rawCode);
  if (!isCode(code)) throw new ApiError(404, "not-found", "Not found", "Sala inexistente.");
  if (request.headers.get("upgrade") !== "websocket") throw new ApiError(426, "upgrade-required", "Upgrade required", "Use WebSocket.");
  if (!originAllowed(request)) throw new ApiError(403, "forbidden-origin", "Forbidden origin", "Origem não permitida.");
  return env[kind.ns].get(env[kind.ns].idFromName(code)).fetch(request);
}

/* Retorna Response se a rota for de salas, senão null. */
export async function handleRooms(request, env, store, now = new Date()) {
  const { pathname } = new URL(request.url);
  const path = pathname.replace(/\/+$/, "");
  try {
    const c = path.match(/^\/api\/v1\/(cups|auctions)$/);
    if (c) {
      if (request.method !== "POST") throw new ApiError(405, "method-not-allowed", "Method not allowed", "Use POST.");
      return await createRoom(request, env, store, now, KINDS[c[1]]);
    }
    const m = path.match(/^\/api\/v1\/(cups|auctions)\/([^/]+)\/ws$/);
    if (m && request.method === "GET") return await roomSocket(request, env, m[2], KINDS[m[1]]);
    const i = path.match(/^\/api\/v1\/(cups|auctions)\/([^/]+)$/);
    if (i && request.method === "GET") return await roomInfo(request, env, store, i[2], KINDS[i[1]], now);
    return null;
  } catch (e) {
    if (e instanceof ApiError) return problem(e, path);
    log("error", { where: "rooms", message: String(e?.message ?? e) }, "error");
    return problem(new ApiError(500, "internal", "Internal error", "Erro interno."), path);
  }
}

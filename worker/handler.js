/* API do Desafio do Dia (v1). Independe de Cloudflare: recebe um `store` e um `env`,
 * então roda igual em teste (store em memória) e em produção (D1).
 *
 *   GET  /api/v1/daily               -> { day, seed }
 *   POST /api/v1/daily/entries       -> 201 { entry, rank }
 *   GET  /api/v1/daily/leaderboard   -> { day, data:[...] }
 *
 * O cliente NUNCA envia resultado: envia o log do draft; o servidor re-simula.
 * Erros: application/problem+json (RFC 7807). */
import {
  hashSeed, verifyDraft, resolveSquad, createTournament, playToEnd, summarize,
  sanitizeTeamName, STYLES, MAX_REFRESHES,
} from "../site/js/engine.js";

const MAX_BODY = 4096;
const MAX_ENTRIES_PER_IP_PER_DAY = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERR = (s) => `https://minhalineup.com/errors/${s}`;

export class ApiError extends Error {
  constructor(status, slug, title, detail, extra = {}) { super(detail); Object.assign(this, { status, slug, title, detail, extra }); }
}

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

const problem = (e, instance) =>
  new Response(JSON.stringify({ type: ERR(e.slug), title: e.title, status: e.status, detail: e.detail, instance, ...e.extra }), {
    status: e.status, headers: { "content-type": "application/problem+json; charset=utf-8", "cache-control": "no-store", ...(e.extra.retry_after ? { "retry-after": String(e.extra.retry_after) } : {}) },
  });

/* Dia no fuso de São Paulo: o "dia" do desafio vira à meia-noite do Brasil. */
export function dayOf(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/* Seed do dia derivada de um segredo do servidor: ninguém consegue calcular
 * (e pré-jogar) os dias futuros só conhecendo o código público. */
export function seedForDay(day, env) {
  return hashSeed(`${env.DAILY_SECRET ?? "dev-only-secret"}|${day}`);
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* tier: 4 perfeito · 3 campeão · 2 playoffs · 1 eliminado no suíço */
const tierOf = (s) => (s.perfeito ? 4 : s.isChampion ? 3 : s.wasInPlayoffs ? 2 : 1);

async function readJson(request) {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) throw new ApiError(413, "payload-too-large", "Payload too large", "Corpo da requisição acima do limite.");
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    throw new ApiError(415, "unsupported-media-type", "Unsupported media type", "Use Content-Type: application/json.");
  }
  const text = await request.text();
  if (text.length > MAX_BODY) throw new ApiError(413, "payload-too-large", "Payload too large", "Corpo da requisição acima do limite.");
  try { return JSON.parse(text); } catch { throw new ApiError(400, "invalid-json", "Invalid JSON", "O corpo não é JSON válido."); }
}

async function submitEntry(request, env, store, now) {
  const body = await readJson(request);
  const day = dayOf(now);
  const playerId = body?.player_id;
  if (typeof playerId !== "string" || !UUID.test(playerId)) throw new ApiError(422, "validation-error", "Validation error", "player_id deve ser um UUID.", { errors: [{ field: "player_id" }] });
  const teamName = sanitizeTeamName(body?.team_name);
  if (teamName.length < 2) throw new ApiError(422, "validation-error", "Validation error", "team_name precisa de 2–24 caracteres válidos.", { errors: [{ field: "team_name" }] });
  if (!STYLES.includes(body?.style)) throw new ApiError(422, "validation-error", "Validation error", "style inválido.", { errors: [{ field: "style" }] });

  let squad;
  try { squad = resolveSquad(verifyDraft(seedForDay(day, env), body?.draft)); }
  catch (e) { throw new ApiError(422, "invalid-draft", "Invalid draft", `Draft não confere com o desafio de hoje: ${e.message}.`, { errors: [{ field: "draft" }] }); }

  // Anti-abuso: IP só em forma de hash com sal diário (não guardamos o IP).
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const ipHash = await sha256Hex(`${env.DAILY_SECRET ?? "dev-only-secret"}|${day}|${ip}`);
  if ((await store.countByIp(day, ipHash)) >= MAX_ENTRIES_PER_IP_PER_DAY) {
    throw new ApiError(429, "rate-limited", "Too many requests", "Limite diário de participações por rede atingido.", { retry_after: 3600 });
  }
  if (await store.hasEntry(day, playerId)) throw new ApiError(409, "already-submitted", "Already submitted", "Você já participou do desafio de hoje.");

  // Re-simulação autoritativa
  const t = createTournament({ teamName, squad, style: body.style, seed: seedForDay(day, env) });
  playToEnd(t);
  const s = summarize(t);
  const entry = {
    day, player_id: playerId, team_name: teamName, style: s.style, forca: s.forca,
    wins: s.wins, losses: s.losses, tier: tierOf(s), champion: s.isChampion ? 1 : 0, perfeito: s.perfeito ? 1 : 0,
    squad_json: JSON.stringify(Object.fromEntries(Object.entries(squad).map(([r, p]) => [r, p.nick]))),
    ip_hash: ipHash, created_at: now.toISOString(),
  };
  await store.insertEntry(entry);
  const rank = await store.rankOf(day, entry);
  const { ip_hash, squad_json, player_id, ...pub } = entry;
  return json({ entry: { ...pub, squad: JSON.parse(squad_json) }, rank }, 201);
}

export async function handle(request, env, store, now = new Date()) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  try {
    if (path === "/api/v1/daily" && request.method === "GET") {
      const day = dayOf(now);
      return json({ day, seed: seedForDay(day, env), max_refreshes: MAX_REFRESHES });
    }
    if (path === "/api/v1/daily/entries") {
      if (request.method !== "POST") throw new ApiError(405, "method-not-allowed", "Method not allowed", "Use POST.");
      return await submitEntry(request, env, store, now);
    }
    if (path === "/api/v1/daily/leaderboard" && request.method === "GET") {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("day") ?? "") ? url.searchParams.get("day") : dayOf(now);
      const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
      const rows = await store.leaderboard(day, limit);
      return json({ day, data: rows.map((r, i) => ({ rank: i + 1, team_name: r.team_name, style: r.style, forca: r.forca, wins: r.wins, losses: r.losses, tier: r.tier, champion: !!r.champion, perfeito: !!r.perfeito, squad: JSON.parse(r.squad_json) })) },
        200, { "cache-control": "public, max-age=30" });
    }
    throw new ApiError(404, "not-found", "Not found", "Recurso inexistente.");
  } catch (e) {
    if (e instanceof ApiError) return problem(e, path);
    console.error("unhandled", e); // não vaza detalhes internos ao cliente
    return problem(new ApiError(500, "internal", "Internal error", "Erro interno."), path);
  }
}

/* Ordem do ranking: melhor tier, mais vitórias, MENOR força (zebra vale mais), quem enviou antes. */
export const ORDER = (a, b) => b.tier - a.tier || b.wins - a.wins || a.forca - b.forca || (a.created_at < b.created_at ? -1 : 1);

/* Store em memória (testes e dev local). */
export function memoryStore() {
  const rows = [];
  return {
    rows,
    async countByIp(day, h) { return rows.filter((r) => r.day === day && r.ip_hash === h).length; },
    async hasEntry(day, id) { return rows.some((r) => r.day === day && r.player_id === id); },
    async insertEntry(e) { rows.push(e); },
    async rankOf(day, e) { return rows.filter((r) => r.day === day).sort(ORDER).findIndex((r) => r === e) + 1; },
    async leaderboard(day, limit) { return rows.filter((r) => r.day === day).sort(ORDER).slice(0, limit); },
  };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../worker/handler.js";
import { handleRooms, MAX_ROOMS_PER_HOUR, MAX_INFO_PER_HOUR } from "../worker/rooms-api.js";
import { isCode } from "../worker/rooms.js";

const NOW = new Date("2026-08-10T15:00:00Z");

/* Namespace de Durable Objects falso: guarda quais salas foram iniciadas. */
function fakeRoomNs() {
  const rooms = new Map(), forwarded = [];
  return {
    rooms, forwarded,
    idFromName: (n) => n,
    get: (id) => ({
      async fetch(urlOrReq, init) {
        if (typeof urlOrReq === "string" && urlOrReq.endsWith("/info")) {
          return rooms.has(id) ? Response.json({ phase: "lobby" }) : new Response(null, { status: 404 });
        }
        if (typeof urlOrReq === "string") {            // /init interno
          if (rooms.has(id)) return new Response(null, { status: 409 });
          rooms.set(id, JSON.parse(init.body)); return new Response(null, { status: 201 });
        }
        forwarded.push(id); return new Response("ok", { status: 200 });
      },
    }),
  };
}
const mkEnv = () => ({ DAILY_SECRET: "test-secret-0123456789", CUP: fakeRoomNs() });
const post = (env, store, ip = "1.1.1.1") =>
  handleRooms(new Request("http://x/api/v1/cups", { method: "POST", headers: { "cf-connecting-ip": ip } }), env, store, NOW);
const ws = (env, store, code, headers = {}) =>
  handleRooms(new Request(`https://minhalineup.com/api/v1/cups/${code}/ws`, { headers }), env, store, NOW);

test("POST /cups cria sala com código válido e seed aleatória no DO", async () => {
  const env = mkEnv(), r = await post(env, memoryStore());
  assert.equal(r.status, 201);
  const { code } = await r.json();
  assert.ok(isCode(code)); assert.ok(env.CUP.rooms.get(code).seed >= 0);
});

test("rate limit: a 11ª sala por hora/rede dá 429; outra rede não é afetada", async () => {
  const env = mkEnv(), store = memoryStore();
  for (let i = 0; i < MAX_ROOMS_PER_HOUR; i++) assert.equal((await post(env, store)).status, 201);
  const r = await post(env, store);
  assert.equal(r.status, 429); assert.equal(r.headers.get("retry-after"), "3600");
  assert.equal((await post(env, store, "2.2.2.2")).status, 201);
  assert.equal(env.CUP.rooms.size, MAX_ROOMS_PER_HOUR + 1);   // a recusada não criou DO
});

test("método errado em /cups = 405 problem+json; rotas alheias e antigas retornam null", async () => {
  const env = mkEnv(), s = memoryStore();
  const r = await handleRooms(new Request("http://x/api/v1/cups"), env, s, NOW);
  assert.equal(r.status, 405); assert.match(r.headers.get("content-type"), /problem\+json/);
  assert.equal(await handleRooms(new Request("http://x/api/v1/daily"), env, s, NOW), null);
  assert.equal(await handleRooms(new Request("http://x/api/v1/rooms", { method: "POST" }), env, s, NOW), null);   // o duelo 1×1 não existe mais
});

test("WebSocket: código inválido 404, sem upgrade 426, origem errada 403, ok encaminha ao DO", async () => {
  const env = mkEnv(), s = memoryStore();
  const ok = { upgrade: "websocket", origin: "https://minhalineup.com" };
  assert.equal((await ws(env, s, "abc", ok)).status, 404);
  assert.equal((await ws(env, s, "ABC234", { origin: ok.origin })).status, 426);
  assert.equal((await ws(env, s, "ABC234", { upgrade: "websocket", origin: "https://evil.example" })).status, 403);
  assert.equal((await ws(env, s, "ABC234", { upgrade: "websocket" })).status, 403);
  assert.equal(env.CUP.forwarded.length, 0);
  assert.equal((await ws(env, s, "abc234", ok)).status, 200);          // minúsculas normalizadas
  assert.deepEqual(env.CUP.forwarded, ["ABC234"]);
});

test("sem DAILY_SECRET a criação de sala falha fechada (500 sem detalhes)", async () => {
  const r = await post({ CUP: fakeRoomNs() }, memoryStore());
  assert.equal(r.status, 500); assert.ok(!(await r.text()).includes("SECRET"));
});

test("GET /cups/:code (info): sala existente 200; inexistente ou inválida 404", async () => {
  const env = mkEnv(), s = memoryStore();
  const { code } = await (await post(env, s)).json();
  const get = (path) => handleRooms(new Request("http://x" + path, { headers: { "cf-connecting-ip": "4.4.4.4" } }), env, s, NOW);
  const ok = await get(`/api/v1/cups/${code}`);
  assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), { exists: true, phase: "lobby" });
  assert.equal((await get(`/api/v1/cups/ZZZZZZ`)).status, 404);
  assert.equal((await get(`/api/v1/cups/abc`)).status, 404);
});

test("info tem rate limit por rede (anti-varredura de códigos)", async () => {
  const env = mkEnv(), s = memoryStore();
  const get = () => handleRooms(new Request("http://x/api/v1/cups/ZZZZZZ", { headers: { "cf-connecting-ip": "5.5.5.5" } }), env, s, NOW);
  for (let i = 0; i < MAX_INFO_PER_HOUR; i++) assert.equal((await get()).status, 404);
  const r = await get();
  assert.equal(r.status, 429); assert.equal(r.headers.get("retry-after"), "3600");
});

test("leilão: POST /auctions usa o namespace AUCTION e tem limite próprio (independente do campeonato)", async () => {
  const env = { ...mkEnv(), AUCTION: fakeRoomNs() }, store = memoryStore();
  const mk = () => handleRooms(new Request("http://x/api/v1/auctions", { method: "POST", headers: { "cf-connecting-ip": "6.6.6.6" } }), env, store, NOW);
  for (let i = 0; i < MAX_ROOMS_PER_HOUR; i++) assert.equal((await mk()).status, 201);
  assert.equal((await mk()).status, 429);
  assert.equal(env.AUCTION.rooms.size, MAX_ROOMS_PER_HOUR); assert.equal(env.CUP.rooms.size, 0);
  assert.equal((await post(env, store, "6.6.6.6")).status, 201);       // campeonato na mesma rede não foi afetado
});

test("leilão: WebSocket e consulta de sala vão para o DO AUCTION, com as mesmas checagens", async () => {
  const env = { ...mkEnv(), AUCTION: fakeRoomNs() }, s = memoryStore();
  const req = (h) => handleRooms(new Request("https://minhalineup.com/api/v1/auctions/abc234/ws", { headers: h }), env, s, NOW);
  assert.equal((await req({ upgrade: "websocket", origin: "https://evil.example" })).status, 403);
  assert.equal((await req({ upgrade: "websocket", origin: "https://minhalineup.com" })).status, 200);
  assert.deepEqual(env.AUCTION.forwarded, ["ABC234"]); assert.deepEqual(env.CUP.forwarded, []);
  const { code } = await (await handleRooms(new Request("http://x/api/v1/auctions", { method: "POST", headers: { "cf-connecting-ip": "7.7.7.7" } }), env, s, NOW)).json();
  const info = await handleRooms(new Request(`http://x/api/v1/auctions/${code}`, { headers: { "cf-connecting-ip": "7.7.7.7" } }), env, s, NOW);
  assert.equal(info.status, 200);
  const outro = await handleRooms(new Request(`http://x/api/v1/cups/${code}`, { headers: { "cf-connecting-ip": "7.7.7.7" } }), env, s, NOW);
  assert.equal(outro.status, 404);                                      // o código é de leilão, não de campeonato
});

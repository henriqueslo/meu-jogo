import { test } from "node:test";
import assert from "node:assert/strict";
import { log, sanitizeFields } from "../worker/log.js";
import { metricFor, observe, routeOf } from "../worker/metrics.js";
import { handle, memoryStore, dayOf } from "../worker/handler.js";

const NOW = new Date("2026-08-10T15:00:00Z");
const DAY = dayOf(NOW);

function capture(fn) {            // captura console.log/warn/error
  const lines = [], orig = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig)) console[k] = (l) => lines.push({ k, l });
  return Promise.resolve().then(fn).then(() => lines).finally(() => Object.assign(console, orig));
}

test("log: uma linha JSON com level e event; campos sensíveis NUNCA saem", async () => {
  const lines = await capture(() => log("x", { ip: "1.2.3.4", token: "t", player_id: "p", team_name: "Fulano", name: "n", secret: "s", body: "b", origin: "o", Authorization: "Bearer a", kind: "Duel", slot: 1, ok: true }));
  assert.equal(lines.length, 1);
  const o = JSON.parse(lines[0].l);
  assert.deepEqual(o, { level: "info", event: "x", kind: "Duel", slot: 1, ok: true });
  assert.ok(!lines[0].l.includes("1.2.3.4") && !lines[0].l.includes("Fulano"));
});

test("log: objetos/arrays são descartados e strings longas truncadas; níveis usam o console certo", async () => {
  assert.deepEqual(sanitizeFields({ a: { x: 1 }, b: [1], c: "x".repeat(500), d: null, e: undefined }), { c: "x".repeat(200), d: null });
  const lines = await capture(() => { log("a", {}, "warn"); log("b", {}, "error"); log("c"); });
  assert.deepEqual(lines.map((l) => l.k), ["warn", "error", "log"]);
});

test("routeOf generaliza códigos de sala (sem cardinalidade nem códigos no log)", () => {
  assert.equal(routeOf("/api/v1/rooms/ABC234/ws"), "/api/v1/rooms/:code/ws");
  assert.equal(routeOf("/api/v1/cups/ABC234"), "/api/v1/cups/:code");
  assert.equal(routeOf("/api/v1/daily/"), "/api/v1/daily");
});

test("metricFor: mapeia respostas para contadores", () => {
  const m = metricFor;
  assert.equal(m("POST", "/api/v1/rooms", 201), "room_created");
  assert.equal(m("POST", "/api/v1/cups", 201), "cup_created");
  assert.equal(m("POST", "/api/v1/daily/entries", 201), "daily_entry");
  assert.equal(m("POST", "/api/v1/daily/entries", 422), "daily_rejected");
  assert.equal(m("POST", "/api/v1/daily/entries", 409), "daily_duplicate");
  assert.equal(m("POST", "/api/v1/rooms", 429), "rate_limited");
  assert.equal(m("GET", "/api/v1/rooms/ABC234", 429), "rate_limited");
  assert.equal(m("GET", "/api/v1/cups/ABC234/ws", 101), "ws_connected");
  assert.equal(m("GET", "/api/v1/rooms/ABC234/ws", 403), "ws_forbidden_origin");
  assert.equal(m("GET", "/api/v1/daily", 500), "server_error");
  for (const [me, p, s] of [["GET", "/api/v1/daily", 200], ["GET", "/api/v1/health", 200], ["GET", "/api/v1/daily/leaderboard", 200], ["GET", "/api/v1/rooms/ZZZZZZ", 404]]) assert.equal(m(me, p, s), null);
});

test("observe: conta no store e registra 5xx sem expor IP/corpo", async () => {
  const store = memoryStore();
  const req = new Request("http://x/api/v1/rooms", { method: "POST", headers: { "cf-connecting-ip": "9.9.9.9" } });
  await observe(req, new Response(null, { status: 201 }), store, NOW);
  await observe(req, new Response(null, { status: 201 }), store, NOW);
  assert.equal(store.counts.get(`${DAY}|room_created`), 2);
  const lines = await capture(() => observe(req, new Response(null, { status: 500 }), store, NOW));
  assert.equal(store.counts.get(`${DAY}|server_error`), 1);
  const o = JSON.parse(lines.find((l) => l.k === "error").l);
  assert.deepEqual(o, { level: "error", event: "http_5xx", route: "/api/v1/rooms", status: 500, method: "POST" });
  assert.ok(!lines.some((l) => l.l.includes("9.9.9.9")));
});

test("observe nunca lança, mesmo com o D1 fora do ar", async () => {
  const boom = { count: async () => { throw new Error("d1 down"); } };
  const lines = await capture(() => observe(new Request("http://x/api/v1/rooms", { method: "POST" }), new Response(null, { status: 201 }), boom, NOW));
  assert.ok(lines.some((l) => l.l.includes("metrics_failed")));
});

test("GET /health: 200 com D1 ok; 503 sem cache quando o D1 falha; não vaza segredos", async () => {
  const env = { DAILY_SECRET: "test-secret-0123456789" };
  const ok = await handle(new Request("http://x/api/v1/health"), env, memoryStore(), NOW);
  assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), { ok: true, db: true, time: NOW.toISOString() });
  assert.equal(ok.headers.get("cache-control"), "public, max-age=30");
  const down = await handle(new Request("http://x/api/v1/health"), env, { ping: async () => { throw new Error("x"); } }, NOW);
  assert.equal(down.status, 503); assert.equal(down.headers.get("cache-control"), "no-store");
  const txt = JSON.stringify(await down.json());
  assert.ok(!txt.includes("secret") && !txt.includes("test-secret"));
  assert.equal((await handle(new Request("http://x/api/v1/health", { method: "POST" }), env, memoryStore(), NOW)).status, 404);
});

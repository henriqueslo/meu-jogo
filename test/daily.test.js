import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../site/js/data.js";
import { createStreams, pickRandomLineups, verifyDraft } from "../site/js/engine.js";
import { handle, memoryStore, seedForDay, dayOf } from "../worker/handler.js";

const env = { DAILY_SECRET: "test-secret-0123456789" };
const NOW = new Date("2026-08-10T15:00:00Z");
const DAY = dayOf(NOW);
const uuid = () => crypto.randomUUID();

/* Joga um draft honesto como o cliente faria, usando `refreshPlan` atualizações por vaga. */
function honestDraft(seed, refreshPlan = [0, 1, 2, 3, 0]) {
  const { draftRand } = createStreams(seed);
  const taken = { roles: new Set(), nicks: new Set() };
  const draft = [];
  for (let i = 0; i < 5; i++) {
    let offers;
    for (let k = 0; k <= refreshPlan[i]; k++) offers = pickRandomLineups(draftRand, taken);
    let pick = null;
    for (const lu of offers) for (const p of lu.jogadores)
      if (!pick && !taken.roles.has(p.papel) && !taken.nicks.has(p.nick)) pick = { lineupId: lu.id, nick: p.nick, papel: p.papel };
    taken.roles.add(pick.papel); taken.nicks.add(pick.nick);
    draft.push({ refreshes: refreshPlan[i], lineupId: pick.lineupId, nick: pick.nick });
  }
  return draft;
}
const post = (body, store, headers = {}, raw) =>
  handle(new Request("http://x/api/v1/daily/entries", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4", ...headers }, body: raw ?? JSON.stringify(body) }), env, store, NOW);
const entry = (over = {}) => ({ player_id: uuid(), team_name: "Falcons BR", style: "rush", draft: honestDraft(seedForDay(DAY, env)), ...over });

test("verifyDraft aceita draft honesto e devolve picks por papel", () => {
  const picks = verifyDraft(seedForDay(DAY, env), honestDraft(seedForDay(DAY, env)));
  assert.deepEqual(Object.keys(picks).sort(), [...ROLES].sort());
});

test("verifyDraft rejeita: escolha fora da oferta, refreshes>3, tamanho errado", () => {
  const seed = seedForDay(DAY, env), d = honestDraft(seed);
  assert.throws(() => verifyDraft(seed, d.slice(0, 4)));
  assert.throws(() => verifyDraft(seed, d.map((s, i) => (i === 0 ? { ...s, refreshes: 4 } : s))));
  assert.throws(() => verifyDraft(seed, d.map((s, i) => (i === 2 ? { ...s, lineupId: "x" } : s))));
  assert.throws(() => verifyDraft(seed, null));
});

test("GET /daily devolve a seed do dia (estável no dia, muda com o segredo)", async () => {
  const get = (e) => handle(new Request("http://x/api/v1/daily"), e, memoryStore(), NOW).then((r) => r.json());
  const a = await get(env), b = await get(env), c = await get({ DAILY_SECRET: "outro-segredo-0123456789" });
  assert.equal(a.seed, b.seed); assert.notEqual(a.seed, c.seed); assert.equal(a.day, DAY);
});

test("POST válido: 201, re-simulado no servidor, sem vazar player_id/ip", async () => {
  const store = memoryStore();
  const r = await post(entry(), store);
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.ok(j.rank >= 1 && j.entry.tier >= 1 && j.entry.team_name === "Falcons BR");
  assert.equal(j.entry.ip_hash, undefined); assert.equal(j.entry.player_id, undefined);
  assert.equal(store.rows[0].ip_hash.length, 64); assert.ok(!JSON.stringify(store.rows).includes("1.2.3.4"));
});

test("resultado é determinístico: mesmo draft/estilo => mesmo resultado", async () => {
  const store = memoryStore();
  const a = await (await post(entry(), store, { "cf-connecting-ip": "9.9.9.1" })).json();
  const b = await (await post(entry(), store, { "cf-connecting-ip": "9.9.9.2" })).json();
  assert.equal(a.entry.wins, b.entry.wins); assert.equal(a.entry.tier, b.entry.tier);
});

test("cliente não forja resultado nem rating (campos extras ignorados)", async () => {
  const r = await post(entry({ wins: 3, losses: 0, tier: 4, perfeito: true, forca: 1 }), memoryStore());
  const j = await r.json();
  assert.equal(r.status, 201); assert.ok(j.entry.forca > 40);
});

test("422: draft forjado, nome inválido, estilo inválido, uuid inválido", async () => {
  const s = memoryStore(), d = entry().draft;
  for (const bad of [
    entry({ draft: d.map((x, i) => (i === 0 ? { ...x, lineupId: "fake" } : x)) }),
    entry({ team_name: "<>" }), entry({ style: "hack" }), entry({ player_id: "123" }), entry({ draft: "x" }),
  ]) {
    const r = await post(bad, s);
    assert.equal(r.status, 422); assert.match(r.headers.get("content-type"), /problem\+json/);
    assert.ok((await r.json()).type.startsWith("https://"));
  }
  assert.equal(s.rows.length, 0);
});

test("409 ao repetir o mesmo player_id no mesmo dia", async () => {
  const s = memoryStore(), e = entry();
  assert.equal((await post(e, s)).status, 201);
  assert.equal((await post(e, s)).status, 409);
});

test("429 após 5 participações da mesma rede no dia", async () => {
  const s = memoryStore();
  for (let i = 0; i < 5; i++) assert.equal((await post(entry(), s)).status, 201);
  const r = await post(entry(), s);
  assert.equal(r.status, 429); assert.equal(r.headers.get("retry-after"), "3600");
});

test("400/413/415: JSON inválido, corpo grande, content-type errado", async () => {
  const s = memoryStore();
  assert.equal((await post(null, s, {}, "{nope")).status, 400);
  assert.equal((await post(null, s, {}, JSON.stringify({ a: "x".repeat(5000) }))).status, 413);
  assert.equal((await post(null, s, { "content-type": "text/plain" }, "{}")).status, 415);
});

test("leaderboard ordenado (tier, vitórias, menor força); limit máx 50", async () => {
  const s = memoryStore();
  for (let i = 0; i < 4; i++) {
    await post(entry({ team_name: "T" + i, style: ["rush", "tatico", "aim", "rush"][i], draft: honestDraft(seedForDay(DAY, env), [i % 4, 0, 0, 0, 0]) }), s, { "cf-connecting-ip": "8.8.8." + i });
  }
  const r = await (await handle(new Request("http://x/api/v1/daily/leaderboard?limit=999"), env, s, NOW)).json();
  assert.equal(r.day, DAY); assert.ok(r.data.length <= 50);
  for (let i = 1; i < r.data.length; i++) {
    const p = r.data[i - 1], c = r.data[i];
    assert.ok(p.tier > c.tier || (p.tier === c.tier && (p.wins > c.wins || (p.wins === c.wins && p.forca <= c.forca))));
  }
  assert.equal(r.data[0].rank, 1);
});

test("sem DAILY_SECRET (ou curto) o desafio fica indisponível: falha fechada", async () => {
  for (const bad of [{}, { DAILY_SECRET: "curto" }]) {
    const r = await handle(new Request("http://x/api/v1/daily"), bad, memoryStore(), NOW);
    assert.equal(r.status, 500);
    assert.ok(!(await r.text()).includes("DAILY_SECRET"));
  }
});

test("404/405 em problem+json; erro interno não vaza detalhe", async () => {
  const s = memoryStore();
  assert.equal((await handle(new Request("http://x/api/v1/nada"), env, s, NOW)).status, 404);
  assert.equal((await handle(new Request("http://x/api/v1/daily/entries"), env, s, NOW)).status, 405);
  const boom = { ...s, hasEntry: async () => { throw new Error("segredo-interno"); } };
  const r = await post(entry(), boom);
  assert.equal(r.status, 500); assert.ok(!(await r.text()).includes("segredo-interno"));
});

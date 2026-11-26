import { test } from "node:test";
import assert from "node:assert/strict";
import { runPurge, cutoffDay, RETENTION_DAYS, METRICS_RETENTION_DAYS } from "../worker/retention.js";
import { memoryStore } from "../worker/handler.js";
import { d1Store } from "../worker/d1store.js";

const NOW = new Date("2026-11-26T15:00:00Z");           // dia 2026-11-26 em São Paulo
const row = (day, over = {}) => ({ day, player_id: "p-" + day + Math.random(), team_name: "T", ip_hash: "h".repeat(64), ...over });

test("cutoffDay: N dias antes, no fuso de São Paulo", () => {
  assert.equal(cutoffDay(NOW, 0), "2026-11-26");
  assert.equal(cutoffDay(NOW, 1), "2026-11-25");
  assert.equal(cutoffDay(NOW, 90), "2026-08-28");
});

test("ranking: apaga só o que passou de 90 dias; recente fica intacto", async () => {
  const s = memoryStore();
  s.rows.push(row("2026-08-27"), row("2026-08-28"), row("2026-11-01"), row("2026-11-26"));
  const r = await runPurge(s, NOW);
  assert.equal(r.entries_deleted, 1);                                // só 2026-08-27 (< cutoff 2026-08-28)
  assert.deepEqual(s.rows.map((x) => x.day).sort(), ["2026-08-28", "2026-11-01", "2026-11-26"]);
});

test("hash do IP: zerado em dias anteriores; o de HOJE continua (limite de abuso do dia)", async () => {
  const s = memoryStore();
  s.rows.push(row("2026-11-25"), row("2026-11-26"));
  const r = await runPurge(s, NOW);
  assert.equal(r.ip_hashes_cleared, 1);
  assert.equal(s.rows.find((x) => x.day === "2026-11-25").ip_hash, "");
  assert.equal(s.rows.find((x) => x.day === "2026-11-26").ip_hash.length, 64);
});

test("contadores: apaga os agregados antigos", async () => {
  const s = memoryStore();
  await s.count("2026-08-01", "room_created"); await s.count("2026-11-20", "room_created");
  const r = await runPurge(s, NOW);
  assert.equal(r.metrics_deleted, 1);
  assert.ok(s.counts.has("2026-11-20|room_created") && !s.counts.has("2026-08-01|room_created"));
});

test("idempotente: rodar de novo não apaga nem altera nada a mais", async () => {
  const s = memoryStore();
  s.rows.push(row("2026-08-01"), row("2026-11-25"));
  await runPurge(s, NOW);
  const again = await runPurge(s, NOW);
  assert.deepEqual(again, { entries_deleted: 0, ip_hashes_cleared: 0, metrics_deleted: 0, rate_limits_deleted: 0 });
  assert.equal(s.rows.length, 1);
});

test("D1: SQL parametrizado (sem concatenar valores), nos 4 passos, e devolve as contagens", async () => {
  const calls = [];
  const db = {
    prepare: (sql) => ({ bind: (...args) => { const c = { sql, args }; calls.push(c); return c; } }),
    batch: async (stmts) => stmts.map((s, i) => ({ meta: { changes: [3, 5, 2, 7][i] } })),
  };
  const r = await runPurge(d1Store(db), NOW);
  assert.deepEqual(r, { entries_deleted: 3, ip_hashes_cleared: 5, metrics_deleted: 2, rate_limits_deleted: 7 });
  assert.equal(calls.length, 4);
  for (const c of calls) { assert.ok(/\?1/.test(c.sql) && !/2026|\d{4}-\d{2}/.test(c.sql), "valor concatenado no SQL: " + c.sql); assert.equal(c.args.length, 1); }
  assert.match(calls[0].sql, /^DELETE FROM daily_entries WHERE day < \?1$/);
  assert.match(calls[1].sql, /^UPDATE daily_entries SET ip_hash = '' WHERE day < \?1/);
  assert.equal(calls[0].args[0], cutoffDay(NOW, RETENTION_DAYS));
  assert.equal(calls[1].args[0], "2026-11-26");
  assert.equal(calls[2].args[0], cutoffDay(NOW, METRICS_RETENTION_DAYS));
});

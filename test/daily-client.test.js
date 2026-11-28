import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchBoard, topFiveHTML } from "../site/js/daily.js";

/* fetch de mentira: guarda o que o cliente pediu. */
function stubFetch(data = []) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return { ok: true, json: async () => ({ data }) }; };
  return calls;
}

test("fetchBoard pede o dia e o limite pedidos", async () => {
  const calls = stubFetch();
  await fetchBoard("2026-11-27", 5);
  assert.match(calls[0].url, /day=2026-11-27/); assert.match(calls[0].url, /limit=5/);
});

test("fetchBoard({ fresh: true }) ignora o cache do navegador (o servidor deixa a resposta 30 s em cache)", async () => {
  const calls = stubFetch();
  await fetchBoard("2026-11-27", 5, { fresh: true });
  assert.equal(calls[0].init.cache, "no-store");
  await fetchBoard("2026-11-27", 5);
  assert.equal(calls[1].init.cache, undefined);                // sem pedir, o cache normal vale
});

test("fetchBoard devolve null quando a API falha (a home e a página do ranking tratam)", async () => {
  globalThis.fetch = async () => { throw new Error("offline"); };
  assert.equal(await fetchBoard("2026-11-27", 5), null);
  globalThis.fetch = async () => ({ ok: false });
  assert.equal(await fetchBoard("2026-11-27", 5), null);
});

test("topFiveHTML: no máximo 5 linhas, uma por jogador, com o nome escapado", () => {
  const esc = (v) => String(v).replace(/</g, "&lt;");
  const rows = Array.from({ length: 8 }, (_, i) => ({ rank: i + 1, team_name: i === 0 ? "<b>x" : `T${i}`, tier: 3, wins: 3, losses: 0 }));
  const html = topFiveHTML(rows, esc);
  assert.equal((html.match(/<li>/g) || []).length, 5);
  assert.ok(html.includes("&lt;b>x") && !html.includes("<b>x"));
  assert.match(html, /#1/); assert.ok(!html.includes("#6"));
});

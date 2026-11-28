import { test } from "node:test";
import assert from "node:assert/strict";
import { LINEUPS, ROLES } from "../site/js/data.js";
import { GameError } from "../site/js/engine.js";
import { Cup, MAX_HUMANS } from "../worker/cup.js";

const lu = (id) => LINEUPS.find((l) => l.id === id);
const ALL = [true, true, true, true, true, true, true, true];
const throwsCode = (fn, c) => assert.throws(fn, (e) => e instanceof GameError && e.code === c, `esperava ${c}`);

function cup(n = 4, seed = 2024) {
  const c = Cup.create("ABC234", seed);
  for (let i = 0; i < n; i++) c.join("Time " + "ABCDEFGH"[i]);
  return c;
}
function draftAll(c, slot) {
  while (!c.players[slot].draft.done) {
    const v = c.view(slot, ALL);
    let pick = null;
    for (const id of v.you.offers) for (const p of lu(id).jogadores)
      if (!pick && !(p.papel in v.you.squad) && !Object.values(v.you.squad).some((s) => s.nick === p.nick)) pick = { lineupId: id, nick: p.nick };
    c.apply(slot, { t: "pick", ...pick }, { connected: ALL });
  }
}
function readyAll(c, style = "tatico") {
  c.apply(0, { t: "start" }, { connected: ALL });
  c.players.forEach((_, i) => { draftAll(c, i); c.apply(i, { t: "style", style }, { connected: ALL }); });
}
function runAll(c) { let g = 0; while (c.phase === "running" && g++ < 30) c.apply(0, { t: "advance" }, { connected: ALL }); }

test("lobby: máx 8, nome duplicado/ inválido recusados, entrada após início recusada", () => {
  const c = cup(8);
  throwsCode(() => c.join("Outro"), "room-full");
  const d = Cup.create("X", 1); d.join("Alfa");
  throwsCode(() => d.join("alfa"), "name-taken");
  throwsCode(() => d.join("<>"), "invalid-name");
  d.join("Beta"); d.apply(0, { t: "start" });
  throwsCode(() => d.join("Gama"), "cup-started");
  assert.equal(MAX_HUMANS, 8);
});

test("start: só o dono, só com 2+ jogadores, só no lobby", () => {
  const c = Cup.create("X", 1); c.join("Alfa");
  throwsCode(() => c.apply(0, { t: "start" }), "not-enough");
  c.join("Beta");
  throwsCode(() => c.apply(1, { t: "start" }), "not-host");
  c.apply(0, { t: "start" });
  assert.equal(c.phase, "draft");
  throwsCode(() => c.apply(0, { t: "start" }), "bad-phase");
});

test("draft: não dá antes do start; mesmas ofertas iniciais p/ todos; trapaças recusadas", () => {
  const c = cup(3);
  throwsCode(() => c.apply(0, { t: "refresh" }), "bad-phase");
  c.apply(0, { t: "start" });
  assert.deepEqual(c.view(0).you.offers, c.view(2).you.offers);
  const notOffered = LINEUPS.find((l) => !c.view(0).you.offers.includes(l.id));
  throwsCode(() => c.apply(0, { t: "pick", lineupId: notOffered.id, nick: notOffered.jogadores[0].nick }), "not-offered");
  throwsCode(() => c.apply(0, { t: "style", style: "rush" }), "draft-incomplete");
  throwsCode(() => c.apply(0, { t: "advance" }, { connected: ALL }), "bad-phase");
  throwsCode(() => c.apply(0, { t: "xx" }), "bad-message");
  throwsCode(() => c.apply(9, { t: "refresh" }), "not-joined");
});

test("torneio roda por etapas até o fim: 16 times, 8 classificados, 1 campeão", () => {
  const c = cup(5); readyAll(c);
  assert.equal(c.phase, "running");
  const v0 = c.view(0, ALL);
  assert.equal(v0.teams.length, 16); assert.equal(v0.teams.filter((t) => t.human !== null).length, 5);
  assert.equal(v0.events.length, 0);
  runAll(c);
  assert.equal(c.phase, "done");
  const v = c.view(3, ALL);
  assert.equal(v.teams.filter((t) => t.status === "champion").length, 1);
  assert.equal(v.teams.filter((t) => t.status === "eliminated").length, 8);
  assert.equal(v.result.humans.length, 5);
  assert.ok(v.events.some((e) => e.type === "final"));
  assert.equal(v.events.at(-1).matches[0].maps.length >= 3, true); // Bo5
  throwsCode(() => c.apply(0, { t: "advance" }, { connected: ALL }), "bad-phase");
});

test("advance: só o dono — a menos que o dono esteja desconectado", () => {
  const c = cup(3); readyAll(c);
  const hostUp = [true, true, true], hostDown = [false, true, true];
  throwsCode(() => c.apply(1, { t: "advance" }, { connected: hostUp }), "not-host");
  c.apply(1, { t: "advance" }, { connected: hostDown });
  assert.equal(c.steps, 1);
  assert.equal(c.view(1, hostDown).you.canControl, true);
  assert.equal(c.view(1, hostUp).you.canControl, false);
});

test("force: completa quem falta (autopick + estilo tático) e inicia o torneio", () => {
  const c = cup(3);
  c.apply(0, { t: "start" });
  draftAll(c, 0); c.apply(0, { t: "style", style: "rush" });
  throwsCode(() => c.apply(1, { t: "force" }, { connected: [true, true, true] }), "not-host");
  c.apply(0, { t: "force" }, { connected: ALL });
  assert.equal(c.phase, "running");
  assert.ok(c.players.every((p) => p.draft.done && p.style));
  assert.equal(c.players[0].style, "rush"); assert.equal(c.players[2].style, "tatico");
});

test("determinismo: mesma sala + mesmas ações = mesmo campeão e eventos", () => {
  const run = () => { const c = cup(4, 77); readyAll(c, "aim"); runAll(c); return c.view(0, ALL); };
  assert.deepEqual(run(), run());
});

test("persistência: toJSON/fromJSON no draft e no meio do torneio restaura tudo", () => {
  const c = cup(4, 555);
  c.apply(0, { t: "start" }); draftAll(c, 0);
  const mid = Cup.fromJSON(JSON.parse(JSON.stringify(c.toJSON())));
  assert.deepEqual(mid.view(0, ALL), c.view(0, ALL)); assert.deepEqual(mid.view(1, ALL), c.view(1, ALL));
  for (let i = 0; i < 4; i++) { draftAll(c, i); c.apply(i, { t: "style", style: "rush" }, { connected: ALL }); }
  c.apply(0, { t: "advance" }, { connected: ALL }); c.apply(0, { t: "advance" }, { connected: ALL });
  const copy = Cup.fromJSON(JSON.parse(JSON.stringify(c.toJSON())));
  assert.deepEqual(copy.view(2, ALL), c.view(2, ALL));
  runAll(c); runAll(copy);
  assert.deepEqual(copy.view(1, ALL), c.view(1, ALL));
  assert.deepEqual(Cup.fromJSON(JSON.parse(JSON.stringify(c.toJSON()))).view(0, ALL).result, c.view(0, ALL).result);
});

test("o elenco dos rivais só aparece no resultado final", () => {
  const c = cup(3); readyAll(c);
  const mid = c.view(0, ALL);
  assert.equal(mid.result, null);
  assert.ok(!JSON.stringify(mid).includes('"squad":{"AWP":"'));
  runAll(c);
  const end = c.view(0, ALL);
  assert.deepEqual(Object.keys(end.result.humans[1].squad).sort(), [...ROLES].sort());
});

test("200 campeonatos simulados: sempre terminam coerentes", () => {
  for (let s = 1; s <= 200; s++) {
    const c = cup(2 + (s % 7), s); readyAll(c, ["rush", "tatico", "aim"][s % 3]); runAll(c);
    assert.equal(c.phase, "done", "seed " + s);
    const v = c.view(0, ALL);
    assert.equal(v.teams.filter((t) => t.status === "champion").length, 1);
    for (const h of v.result.humans) assert.ok(h.wins <= 3 && h.losses <= 3);
  }
});

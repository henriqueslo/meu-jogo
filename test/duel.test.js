import { test } from "node:test";
import assert from "node:assert/strict";
import { LINEUPS, ROLES } from "../site/js/data.js";
import { Duel, DuelError } from "../worker/duel.js";
import { newCode, isCode, originAllowed, makeBucket } from "../worker/rooms.js";

const lu = (id) => LINEUPS.find((l) => l.id === id);
const code = () => newCode();

function room(seed = 12345) {
  const d = Duel.create("ABC234", seed);
  const a = d.join("Alfa Team"), b = d.join("Beta Team");
  return { d, a, b };
}
/* Joga o draft inteiro de `slot` escolhendo sempre o primeiro jogador escalável. */
function draftAll(d, slot, refreshFirst = 0) {
  for (let i = 0; i < refreshFirst; i++) d.apply(slot, { t: "refresh" });
  while (!d.players[slot].draft.done) {
    const v = d.view(slot);
    let pick = null;
    for (const id of v.you.offers) for (const p of lu(id).jogadores)
      if (!pick && !(p.papel in v.you.squad) && !Object.values(v.you.squad).some((s) => s.nick === p.nick)) pick = { lineupId: id, nick: p.nick };
    d.apply(slot, { t: "pick", ...pick });
  }
}
const throwsCode = (fn, c) => assert.throws(fn, (e) => e instanceof DuelError && e.code === c, `esperava ${c}`);

test("códigos: 6 chars sem ambíguos, únicos na prática, validação estrita", () => {
  const set = new Set();
  for (let i = 0; i < 2000; i++) { const c = code(); assert.ok(isCode(c), c); assert.ok(!/[ILO01]/.test(c)); set.add(c); }
  assert.ok(set.size > 1990);
  for (const bad of ["abc234", "ABC23", "ABC2345", "ABCI23", "", null, "AB C23", "ABC23\n"]) assert.ok(!isCode(bad), String(bad));
});

test("sala: 2 jogadores, 3º recusado, nome inválido recusado, tokens únicos", () => {
  const d = Duel.create("ABC234", 1);
  assert.equal(d.phase, "waiting");
  throwsCode(() => d.join("<>"), "invalid-name");
  const a = d.join("Alfa"), b = d.join("Beta");
  assert.notEqual(a.token, b.token); assert.equal(a.token.length, 32);
  assert.equal(d.phase, "draft");
  throwsCode(() => d.join("Gama"), "room-full");
});

test("reconexão com token devolve o mesmo slot; token errado não entra em sala cheia", () => {
  const { d, a } = room();
  assert.deepEqual(d.join("outro nome", a.token), { slot: 0, token: a.token, reconnected: true });
  throwsCode(() => d.join("Intruso", "0".repeat(32)), "room-full");
});

test("ambos veem as MESMAS primeiras ofertas (mesma seed de draft)", () => {
  const { d } = room(777);
  assert.deepEqual(d.view(0).you.offers, d.view(1).you.offers);
});

test("trapaças no draft são recusadas e não alteram o estado", () => {
  const { d } = room();
  const before = JSON.stringify(d.toJSON());
  const offered = d.view(0).you.offers[0];
  const notOffered = LINEUPS.find((l) => !d.view(0).you.offers.includes(l.id)).id;
  throwsCode(() => d.apply(0, { t: "pick", lineupId: notOffered, nick: lu(notOffered).jogadores[0].nick }), "not-offered");
  throwsCode(() => d.apply(0, { t: "pick", lineupId: offered, nick: "Inexistente" }), "not-offered");
  throwsCode(() => d.apply(0, { t: "pick", lineupId: 5, nick: {} }), "bad-message");
  throwsCode(() => d.apply(0, { t: "style", style: "rush" }), "draft-incomplete");
  throwsCode(() => d.apply(0, { t: "hack" }), "bad-message");
  throwsCode(() => d.apply(0, null), "bad-message");
  throwsCode(() => d.apply(5, { t: "refresh" }), "not-joined");
  throwsCode(() => d.apply(0, { t: "rematch" }), "bad-phase");
  assert.equal(JSON.stringify(d.toJSON()), before);
});

test("no máximo 3 atualizações por vaga", () => {
  const { d } = room();
  for (let i = 0; i < 3; i++) d.apply(0, { t: "refresh" });
  throwsCode(() => d.apply(0, { t: "refresh" }), "no-refresh");
});

test("ações antes de a sala ter 2 jogadores são recusadas", () => {
  const d = Duel.create("ABC234", 1); d.join("Alfa");
  throwsCode(() => d.apply(0, { t: "refresh" }), "bad-phase");
});

test("partida completa: servidor simula Bo3; resultado coerente e visível aos dois", () => {
  const { d } = room(99);
  draftAll(d, 0, 1); draftAll(d, 1);
  throwsCode(() => d.apply(0, { t: "style", style: "x" }), "bad-message");
  d.apply(0, { t: "style", style: "rush" });
  throwsCode(() => d.apply(0, { t: "style", style: "aim" }), "style-locked");
  assert.equal(d.phase, "draft"); assert.equal(d.view(1).opp.styleChosen, true);
  d.apply(1, { t: "style", style: "tatico" });
  assert.equal(d.phase, "done");
  const r = d.view(0).result;
  assert.ok(r.winsA === 2 || r.winsB === 2);
  assert.equal(r.winner, r.winsA === 2 ? "A" : "B");
  assert.ok(r.maps.length >= 2 && r.maps.length <= 3);
  assert.deepEqual(Object.keys(r.a.squad).sort(), [...ROLES].sort());
  assert.deepEqual(d.view(0).result, d.view(1).result);
});

test("o elenco do rival NÃO vaza antes do resultado", () => {
  const { d } = room(5);
  draftAll(d, 1);
  const v = JSON.stringify(d.view(0));
  for (const s of Object.values(d.view(1).you.squad)) assert.ok(!v.includes(s.nick) || d.view(0).you.offers.some((id) => lu(id).jogadores.some((p) => p.nick === s.nick)));
  assert.equal(d.view(0).opp.picks, 5); assert.equal(d.view(0).result, null);
  assert.equal(Object.keys(d.view(0).opp).includes("squad"), false);
});

test("determinismo: mesma sala + mesmas ações = mesmo resultado", () => {
  const run = () => { const { d } = room(4242); draftAll(d, 0, 2); draftAll(d, 1); d.apply(0, { t: "style", style: "aim" }); d.apply(1, { t: "style", style: "rush" }); return d.view(0).result; };
  assert.deepEqual(run(), run());
});

test("persistência: toJSON/fromJSON no meio do draft restaura offers e continua igual", () => {
  const { d } = room(31337);
  d.apply(0, { t: "refresh" }); draftAll(d, 1);
  const copy = Duel.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
  assert.deepEqual(copy.view(0), d.view(0)); assert.deepEqual(copy.view(1), d.view(1));
  draftAll(d, 0); draftAll(copy, 0);
  assert.deepEqual(copy.toJSON(), d.toJSON());
  for (const x of [d, copy]) { x.apply(0, { t: "style", style: "rush" }); x.apply(1, { t: "style", style: "aim" }); }
  assert.deepEqual(copy.view(1).result, d.view(1).result);
  assert.deepEqual(Duel.fromJSON(JSON.parse(JSON.stringify(d.toJSON()))).view(0).result, d.view(0).result);
});

test("revanche: só com os dois pedindo; nova rodada tem novas ofertas e zera o estado", () => {
  const { d } = room(8);
  draftAll(d, 0); draftAll(d, 1);
  d.apply(0, { t: "style", style: "rush" }); d.apply(1, { t: "style", style: "rush" });
  const offersR0 = JSON.stringify(d.view(0).result.a);
  d.apply(0, { t: "rematch" });
  assert.equal(d.phase, "done"); assert.equal(d.view(1).opp.rematch, true);
  d.apply(1, { t: "rematch" });
  assert.equal(d.phase, "draft"); assert.equal(d.round, 1); assert.equal(d.result, null);
  assert.equal(d.view(0).you.draftDone, false); assert.equal(d.view(0).you.style, null);
  assert.ok(d.view(0).you.offers.length > 0);
  assert.ok(offersR0.length > 0);
  draftAll(d, 0); draftAll(d, 1); d.apply(0, { t: "style", style: "aim" }); d.apply(1, { t: "style", style: "aim" });
  assert.equal(d.phase, "done");
});

test("origem: só o mesmo host passa; sem Origin é recusado", () => {
  const req = (o) => new Request("https://minhalineup.com/api/v1/rooms/ABC234/ws", { headers: o ? { origin: o } : {} });
  assert.ok(originAllowed(req("https://minhalineup.com")));
  assert.ok(!originAllowed(req("https://evil.example")));
  assert.ok(!originAllowed(req("https://minhalineup.com.evil.example")));
  assert.ok(!originAllowed(req("null")));
  assert.ok(!originAllowed(req(null)));
});

test("rate limit por socket: rajada é cortada e repõe com o tempo", () => {
  const b = makeBucket(5, 2, 0);
  let ok = 0; for (let i = 0; i < 20; i++) if (b.take(0)) ok++;
  assert.equal(ok, 5);
  assert.ok(!b.take(100)); assert.ok(b.take(1000));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { LINEUPS, ROLES } from "../site/js/data.js";
import { Draft, GameError, actionsToLog, verifyDraft } from "../site/js/engine.js";
import { Cup } from "../worker/cup.js";

const eligible = (d) => { for (const id of d.offers) for (const p of d._byId(id).jogadores) if (!d.taken.roles.has(p.papel) && !d.taken.nicks.has(p.nick)) return [id, p.nick]; };
const pickOne = (d) => d.pick(...eligible(d));
const snap = (d) => JSON.stringify({ o: d.offers, p: d.picks, r: d.refreshesLeft, a: d.actions });

test("undo: volta às MESMAS ofertas e ao mesmo estado de antes da escolha", () => {
  const d = new Draft(2026);
  pickOne(d); pickOne(d);
  const antes = snap(d);
  pickOne(d);
  assert.notEqual(snap(d), antes);
  d.undo();
  assert.equal(snap(d), antes);
});

test("undo também descarta as atualizações feitas depois da escolha", () => {
  const d = new Draft(7);
  pickOne(d);
  const antes = snap(d);
  pickOne(d); d.refresh(); d.refresh();
  d.undo();
  assert.equal(snap(d), antes);
});

test("undo sem escolhas lança erro de regra; desfazer repetido volta ao início", () => {
  const d = new Draft(1);
  assert.equal(d.canUndo, false);
  assert.throws(() => d.undo(), (e) => e instanceof GameError && e.code === "nothing-to-undo");
  pickOne(d); pickOne(d); pickOne(d);
  d.undo(); d.undo(); d.undo();
  assert.equal(snap(d), snap(new Draft(1)));
});

test("undo depois do elenco completo reabre a última vaga", () => {
  const d = new Draft(99);
  for (let i = 0; i < 5; i++) pickOne(d);
  assert.equal(d.done, true);
  d.undo();
  assert.equal(d.done, false); assert.equal(Object.keys(d.picks).length, 4); assert.ok(d.offers.length > 0);
  pickOne(d); assert.equal(d.done, true);
});

test("o log do desafio continua VÁLIDO para o servidor depois de desfazer e escolher outro jogador", () => {
  for (const seed of [1, 42, 2026, 777777]) {
    const d = new Draft(seed);
    pickOne(d); d.refresh(); pickOne(d);
    d.undo();                                   // desfaz a 2ª escolha (e a atualização antes dela)
    d.refresh(); pickOne(d);                    // outra escolha, com outra atualização
    while (!d.done) pickOne(d);
    d.undo(); pickOne(d);
    const verified = verifyDraft(seed, actionsToLog(d.actions));   // o que o servidor do desafio faz
    assert.deepEqual(Object.keys(verified).sort(), [...ROLES].sort());
    for (const r of ROLES) assert.equal(verified[r].nick, d.picks[r].nick);
  }
});

test("actionsToLog: refreshes contados por vaga", () => {
  assert.deepEqual(actionsToLog([{ t: "refresh" }, { t: "refresh" }, { t: "pick", lineupId: "a", nick: "x" }, { t: "pick", lineupId: "b", nick: "y" }]),
    [{ refreshes: 2, lineupId: "a", nick: "x" }, { refreshes: 0, lineupId: "b", nick: "y" }]);
});

/* ----- multiplayer: mensagem 'undo' ----- */
const ALL = [true, true, true, true, true, true, true, true];
test("campeonato: undo só na fase de draft; persistência continua válida depois de desfazer", () => {
  const c = Cup.create("ABC234", 9); c.join("Alfa"); c.join("Beta");
  assert.throws(() => c.apply(0, { t: "undo" }), (e) => e.code === "bad-phase");   // ainda no lobby
  c.apply(0, { t: "start" });
  const [id, nick] = eligible(c.players[0].draft);
  c.apply(0, { t: "pick", lineupId: id, nick }); c.apply(0, { t: "undo" });
  const copy = Cup.fromJSON(JSON.parse(JSON.stringify(c.toJSON())));
  assert.deepEqual(copy.view(0, ALL), c.view(0, ALL));
});

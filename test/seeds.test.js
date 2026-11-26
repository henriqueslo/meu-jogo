import { test } from "node:test";
import assert from "node:assert/strict";
import { Draft, resolveSquad, createTournament, playToEnd, summarize } from "../site/js/engine.js";
import { SEEDS } from "../e2e/seeds.js";

function outcome(seed) {
  const d = new Draft(seed);
  while (!d.done) {
    let pick;
    for (const id of d.offers) for (const p of d._byId(id).jogadores) if (!pick && !d.taken.roles.has(p.papel) && !d.taken.nicks.has(p.nick)) pick = [id, p.nick];
    d.pick(...pick);
  }
  const t = createTournament({ teamName: "Teste", squad: resolveSquad(d.picks), style: "tatico", seed });
  playToEnd(t);
  return summarize(t);
}

test("sementes dos testes de interface ainda levam aos desfechos prometidos", () => {
  let s = outcome(SEEDS.eliminado_2_3);   assert.ok(!s.wasInPlayoffs && s.wins === 2 && s.losses === 3, "eliminado_2_3");
  s = outcome(SEEDS.eliminado_0_3);       assert.ok(!s.wasInPlayoffs && s.wins === 0 && s.losses === 3, "eliminado_0_3");
  s = outcome(SEEDS.playoffs_e_perdeu);   assert.ok(s.wasInPlayoffs && !s.isChampion, "playoffs_e_perdeu");
  s = outcome(SEEDS.campeao);             assert.ok(s.isChampion && !s.perfeito && s.wins === 3 && s.losses === 0, "campeao");
  s = outcome(SEEDS.perfeito);            assert.ok(s.perfeito, "perfeito");
});

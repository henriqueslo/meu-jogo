import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cupJourney, campaignStatusText, heroOutcome, duelShare, cupShare, squadStrength, styleChooserHTML, journeyHTML, SITE_URL,
} from "../site/js/parts.js";

const t = (nome, human = null) => ({ name: nome, human, forca: 80 });
const m = (a, b, wa, wb, bo = 3) => ({
  a, b, bo, winsA: wa, winsB: wb, winner: wa > wb ? "A" : "B",
  maps: [...Array(wa + wb)].map((_, i) => ["Mirage", i < wa ? 13 : 8, i < wa ? 8 : 13, 0]),
});

test("cupJourney: um item por jogo do jogador, na ordem, com adversário e placar do ponto de vista dele", () => {
  const eu = t("Eu", 0), r = t("Rival", 1);
  const events = [
    { type: "swiss", round: 1, matches: [m(r, eu, 1, 2), m(t("X"), t("Y"), 2, 0)] },       // eu sou o B e ganhei por 2×1
    { type: "swiss", round: 2, matches: [m(eu, t("Z"), 0, 2)] },                            // perdi por 0×2
    { type: "seed", seeds: [eu] },
    { type: "qf", round: null, matches: [m(t("Q"), t("W"), 2, 1)] },                        // eu não joguei
  ];
  const j = cupJourney(events, 0);
  assert.equal(j.length, 2);
  assert.deepEqual([j[0].stage, j[0].opponent, j[0].score, j[0].won], ["Rodada 1", "Rival", "2×1", true]);
  assert.deepEqual([j[1].stage, j[1].opponent, j[1].score, j[1].won], ["Rodada 2", "Z", "0×2", false]);
  assert.deepEqual(j[0].maps[0], ["Mirage", 8, 13, 0]);                                  // mapas também na perspectiva dele (era 13×8 para o lado A)
  assert.equal(cupJourney([], 0).length, 0);
  assert.equal(cupJourney(undefined, 0).length, 0);
});

test("cupJourney: mapas na perspectiva do jogador quando ele é o lado B", () => {
  const eu = t("Eu", 0), r = t("Rival", 1);
  const j = cupJourney([{ type: "final", round: null, matches: [{ a: r, b: eu, bo: 5, winsA: 1, winsB: 3, winner: "B", maps: [["Mirage", 5, 13, 0]] }] }], 0);
  assert.deepEqual(j[0].maps[0], ["Mirage", 13, 5, 0]);
  assert.equal(j[0].stage, "Grande final");
});

test("campaignStatusText: mesmas frases do jogo solo", () => {
  const base = { champion: false, eliminated: false, outAt: null, qualified: false, next: null, wins: 1, losses: 0 };
  assert.equal(campaignStatusText({ ...base, champion: true }), "🏆 Campeão do Major!");
  assert.equal(campaignStatusText({ ...base, eliminated: true }), "❌ Eliminado na Primeira Fase");
  assert.equal(campaignStatusText({ ...base, outAt: "Final" }), "🥈 Vice-campeão");
  assert.equal(campaignStatusText({ ...base, outAt: "Quartas" }), "❌ Eliminado nas quartas de final");
  assert.equal(campaignStatusText({ ...base, outAt: "Semifinal" }), "❌ Eliminado na semifinal");
  assert.equal(campaignStatusText({ ...base, qualified: true, next: "semifinal" }), "✅ Classificado · nos playoffs: semifinal");
  assert.equal(campaignStatusText({ ...base, qualified: true }), "✅ Classificado para os playoffs");
  assert.equal(campaignStatusText(base), "Classifica com mais 2 vitórias · elimina com mais 3 derrotas");
  assert.equal(campaignStatusText({ ...base, wins: 2, losses: 2 }), "Classifica com mais 1 vitória · elimina com mais 1 derrota");
});

test("heroOutcome: perfeito, campeão, vice, caiu nos playoffs e eliminado no suíço", () => {
  const lost = { opponent: "Fulano", score: "1×2" };
  const base = { perfeito: false, champion: false, cleanPlayoffs: false, outAt: null, wins: 3, losses: 1, lost };
  assert.match(heroOutcome({ ...base, perfeito: true, champion: true, losses: 0 }).title, /MAJOR PERFEITO/);
  assert.match(heroOutcome({ ...base, champion: true, cleanPlayoffs: true }).sub, /invicto nos playoffs/);
  const vice = heroOutcome({ ...base, outAt: "Final" });
  assert.match(vice.title, /Vice-campeão/); assert.match(vice.sub, /Fulano \(1×2\)/);
  assert.match(heroOutcome({ ...base, outAt: "Quartas" }).title, /Caiu nas quartas/);
  assert.match(heroOutcome({ ...base, outAt: "Semifinal" }).title, /Caiu na semifinal/);
  assert.match(heroOutcome({ ...base, wins: 2, losses: 3 }).sub, /a 1 vitória dos playoffs/);
  assert.match(heroOutcome({ ...base, wins: 1, losses: 3 }).sub, /Faltaram 2 vitórias/);
  assert.match(heroOutcome({ ...base, wins: 0, losses: 3 }).sub, /outro estilo ou outro time/);
});

test("duelShare: texto com resultado, rival, placar, lineup e endereço; card com a série", () => {
  const lineup = [{ papel: "AWP", nick: "a" }, { papel: "IGL", nick: "b" }];
  const w = duelShare({ won: true, team: "Meu Time", rival: "Rival FC", mine: 2, other: 1, bestOf: 3, lineup });
  assert.match(w.text, /Venci/); assert.match(w.text, /Rival FC/); assert.match(w.text, /2×1/); assert.match(w.text, /a, b/);
  assert.ok(w.text.includes(SITE_URL));
  assert.equal(w.data.isChampion, true); assert.equal(w.data.rotulo, "SÉRIE Bo3");
  assert.equal(w.data.wins + w.data.losses, 3);
  const l = duelShare({ won: false, team: "Meu Time", rival: "Rival FC", mine: 1, other: 2, bestOf: 3, lineup });
  assert.match(l.text, /Perdi/); assert.equal(l.data.isChampion, false); assert.equal(l.data.resultadoCurto, "DERROTA");
});

test("cupShare: abertura por desfecho, linha do suíço, lineup e endereço", () => {
  const lineup = [{ papel: "AWP", nick: "x" }];
  const base = { team: "Meu Time", wins: 3, losses: 1, perfeito: false, champion: false, playoffs: true, lineup, cleanPlayoffs: false, players: 4 };
  assert.match(cupShare({ ...base, perfeito: true, champion: true, losses: 0 }).text, /MAJOR PERFEITO no campeonato/);
  assert.match(cupShare({ ...base, champion: true }).text, /CAMPEÃO do campeonato/);
  assert.match(cupShare({ ...base }).text, /playoffs do campeonato/);
  const vice = cupShare({ ...base, vice: true });
  assert.match(vice.text, /VICE-CAMPEÃO do campeonato/); assert.equal(vice.data.resultadoCurto, "🥈 VICE-CAMPEÃO");
  const out = cupShare({ ...base, playoffs: false, wins: 1, losses: 3 });
  assert.match(out.text, /caiu na Primeira Fase do campeonato \(1-3\)/);
  assert.match(out.text, /🟩🟥🟥🟥 \(1-3\)/);
  assert.ok(out.text.includes(SITE_URL)); assert.match(out.text, /x/);
  assert.equal(out.data.resultadoCurto, "ELIMINADO NO SUÍÇO");
  assert.match(out.data.modo, /Campeonato/);
});

test("styleChooserHTML: força, três estilos com o do jogador marcado, uma só sugestão", () => {
  const squad = Object.fromEntries(["AWP", "IGL", "Entry", "Support", "Rifler"].map((r) => [r, { nick: r, forca: 95 }]));
  const html = styleChooserHTML(squad, "tatico");
  assert.equal(squadStrength(squad).forca, 95);
  assert.equal((html.match(/role="radio"/g) || []).length, 3);
  assert.equal((html.match(/Sugerido/g) || []).length, 1);
  assert.match(html, /data-style="tatico" role="radio" aria-checked="true"/);
  assert.match(html, /data-style="rush" role="radio" aria-checked="false"/);
});

test("journeyHTML: vazio não gera nada; escapa nomes de adversários (dado não confiável)", () => {
  assert.equal(journeyHTML([]), "");
  const h = journeyHTML([{ stage: "Rodada 1", opponent: "<img onerror=x>", score: "2×0", won: true }]);
  assert.ok(!h.includes("<img"));
  assert.match(h, /&lt;img/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { LINEUPS } from "../site/js/data.js";
import { teamStrength, styleAdvice, STYLE_INFO, STYLES } from "../site/js/engine.js";

const forcas = LINEUPS.map((l) => l.forca);

test("teamStrength: média dos adversários = média das lineups históricas", () => {
  const media = Math.round(forcas.reduce((a, b) => a + b, 0) / forcas.length);
  assert.equal(teamStrength(80).media, media);
  assert.equal(teamStrength(95).media, media);
});

test("teamStrength: percentil = % de lineups históricas MAIS FRACAS; monotônico", () => {
  const p = (f) => teamStrength(f).percentil;
  assert.equal(p(0), 0);
  assert.equal(p(100), 100);
  for (const f of [60, 70, 75, 80, 85, 90]) assert.equal(p(f), Math.round((100 * forcas.filter((x) => x < f).length) / forcas.length));
  for (let f = 60; f < 99; f++) assert.ok(p(f) <= p(f + 1), `não monotônico em ${f}`);
});

test("teamStrength: nível acima (≥65%), abaixo (≤35%) ou na média", () => {
  assert.equal(teamStrength(0).nivel, "abaixo");
  assert.equal(teamStrength(100).nivel, "acima");
  const niveis = new Set();
  for (let f = 50; f <= 100; f++) niveis.add(teamStrength(f).nivel);
  assert.deepEqual([...niveis].sort(), ["abaixo", "acima", "media"]);
  for (let f = 50; f <= 100; f++) {
    const { percentil, nivel } = teamStrength(f);
    assert.equal(nivel, percentil >= 65 ? "acima" : percentil <= 35 ? "abaixo" : "media");
  }
});

test("styleAdvice: forte → Tático (menos zebra), fraco → Rush (variância ajuda), meio → Aim", () => {
  assert.equal(styleAdvice("acima"), "tatico");
  assert.equal(styleAdvice("abaixo"), "rush");
  assert.equal(styleAdvice("media"), "aim");
  for (const s of ["acima", "abaixo", "media"]) assert.ok(STYLES.includes(styleAdvice(s)));
});

test("STYLE_INFO: um registro por estilo; Tático é o mais previsível e Rush o mais arriscado", () => {
  assert.deepEqual(Object.keys(STYLE_INFO).sort(), [...STYLES].sort());
  assert.ok(STYLE_INFO.tatico.variance < STYLE_INFO.aim.variance && STYLE_INFO.aim.variance < STYLE_INFO.rush.variance);
  assert.ok(STYLE_INFO.tatico.bias < STYLE_INFO.aim.bias && STYLE_INFO.aim.bias < STYLE_INFO.rush.bias);
});

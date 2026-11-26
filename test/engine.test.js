import { test } from "node:test";
import assert from "node:assert/strict";
import { LINEUPS, ROLES } from "../site/js/data.js";
import {
  createStreams, pickRandomLineups, resolveSquad, createTournament, playToEnd,
  summarize, sanitizeTeamName, shuffle, mulberry32,
} from "../site/js/engine.js";

function draft(seed) {
  const { draftRand } = createStreams(seed);
  const picks = {};
  const taken = { roles: new Set(), nicks: new Set() };
  for (let i = 0; i < 5; i++) {
    const offers = pickRandomLineups(draftRand, taken);
    let found = null;
    for (const lu of offers) for (const pl of lu.jogadores) {
      if (!found && !taken.roles.has(pl.papel) && !taken.nicks.has(pl.nick)) found = [lu, pl];
    }
    assert.ok(found, "softlock no draft, seed " + seed); // a oferta sempre tem 1 jogador escalável
    const [lu, pl] = found;
    picks[pl.papel] = { lineupId: lu.id, nick: pl.nick };
    taken.roles.add(pl.papel); taken.nicks.add(pl.nick);
  }
  return picks;
}
const run = (seed, style = "tatico") =>
  createTournament({ teamName: "Teste", squad: resolveSquad(draft(seed)), style, seed });

test("dados: ids únicos, 5 papéis por lineup, média coerente", () => {
  const ids = new Set();
  for (const l of LINEUPS) {
    assert.ok(!ids.has(l.id), "id duplicado " + l.id); ids.add(l.id);
    assert.equal(l.jogadores.length, 5, l.id);
    for (const p of l.jogadores) assert.ok(ROLES.includes(p.papel), l.id + " papel " + p.papel);
    const avg = l.jogadores.reduce((s, p) => s + p.forca, 0) / 5;
    assert.ok(Math.abs(avg - l.forca) <= 1.5, `${l.id}: forca ${l.forca} vs média ${avg}`);
  }
  assert.ok(LINEUPS.length >= 16);
});

test("determinismo: mesma seed + mesmas escolhas = mesmo resultado", () => {
  for (const seed of [1, 42, 123456789]) {
    const a = run(seed), b = run(seed);
    playToEnd(a); playToEnd(b);
    assert.deepEqual(summarize(a), summarize(b));
    assert.equal(JSON.stringify(a.playerStats), JSON.stringify(b.playerStats));
  }
});

test("invariantes do formato suíço e dos playoffs (500 torneios)", () => {
  for (let seed = 1; seed <= 500; seed++) {
    const t = run(seed, ["rush", "tatico", "aim"][seed % 3]);
    playToEnd(t);
    assert.equal(t.qualified.length, 8, "seed " + seed);
    assert.equal(t.eliminated.length, 8);
    assert.equal(t.phase, "done");
    assert.ok(t.champion && t.qualified.includes(t.champion));
    for (const x of t.teams) assert.ok(x.wins <= 3 && x.losses <= 3);
  }
});

test("placar de mapa válido (13-x, 16-x, 19-x...)", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const t = run(seed);
    for (const e of playToEnd(t)) for (const r of e.results) for (const m of r.res.maps) {
      const hi = Math.max(m.a, m.b), lo = Math.min(m.a, m.b);
      assert.ok(hi >= 13 && hi - lo >= 1 && (hi === 13 ? lo <= 11 : true), JSON.stringify(m));
    }
  }
});

test("resolveSquad ignora rating forjado e rejeita picks inválidos", () => {
  const picks = draft(7);
  picks.AWP.forca = 999; // campo extra do cliente é ignorado
  assert.ok(resolveSquad(picks).AWP.forca < 100);
  assert.throws(() => resolveSquad({ ...picks, AWP: { lineupId: "nao-existe", nick: "x" } }));
  assert.throws(() => resolveSquad({ ...picks, IGL: picks.Rifler }), /inválido/); // jogador no papel errado
  assert.throws(() => resolveSquad(null));
  assert.throws(() => resolveSquad({}));
});

test("sanitizeTeamName: allowlist, limite e unicode", () => {
  assert.equal(sanitizeTeamName('<img src=x onerror=alert(1)>'), "img srcx onerroralert1");
  assert.equal(sanitizeTeamName("  Fal\u0000cons   BR  "), "Falcons BR");
  assert.equal(sanitizeTeamName("São Paulo Ñ"), "São Paulo Ñ");
  assert.equal(sanitizeTeamName("x".repeat(100)).length, 24);
  assert.equal(sanitizeTeamName(null), "");
  assert.equal(sanitizeTeamName({}), "");
});

test("estilo inválido é rejeitado", () => {
  assert.throws(() => createTournament({ teamName: "T", squad: resolveSquad(draft(1)), style: "hack", seed: 1 }));
});

test("PRNG: shuffle é permutação e seeds distintos divergem", () => {
  const a = shuffle([1, 2, 3, 4, 5, 6], mulberry32(1));
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5, 6]);
  assert.notDeepEqual(shuffle([...Array(20).keys()], mulberry32(1)), shuffle([...Array(20).keys()], mulberry32(2)));
});

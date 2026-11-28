/* Fase D3 (movimento, mobile primeiro): regras puras e regras do CSS que garantem movimento leve e que respeita
 * "reduzir movimento". O comportamento na tela está em e2e/motion.spec.js. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { draftSlotsHTML, papelNovo } from "../site/js/render.js";

const p = (nick) => ({ nick, pais: "BR", team: "X", forca: 80 });
const css = readFileSync(fileURLToPath(new URL("../site/css/game.css", import.meta.url)), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");

test("papelNovo: acha o papel que acabou de ser preenchido (e nenhum no desfazer ou sem mudança)", () => {
  assert.equal(papelNovo({}, { AWP: p("a") }), "AWP");
  assert.equal(papelNovo({ AWP: p("a") }, { AWP: p("a"), IGL: p("b") }), "IGL");
  assert.equal(papelNovo({ AWP: p("a"), IGL: p("b") }, { AWP: p("a") }), null, "desfazer não destaca ninguém");
  assert.equal(papelNovo({ AWP: p("a") }, { AWP: p("a") }), null);
  assert.equal(papelNovo(undefined, { AWP: p("a") }), "AWP");
});

test("draftSlotsHTML: só o slot recém-preenchido ganha a classe 'fresh'", () => {
  const sq = { AWP: p("a"), IGL: p("b") };
  const html = draftSlotsHTML(sq, "IGL");
  assert.equal((html.match(/class="slot filled fresh"/g) || []).length, 1);
  assert.match(html, /class="slot filled fresh">\s*<div class="role">IGL</);
  assert.equal((draftSlotsHTML(sq).match(/fresh/g) || []).length, 0, "sem destaque por padrão");
});

/* ------------------------------- regras do CSS ------------------------------- */
const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => ({ nome: m[1], corpo: m[2] }));

test("os quadros de animação só mexem em transform e opacity (leve no celular, sem refazer o layout)", () => {
  assert.ok(keyframes.length >= 8, "esperava achar os @keyframes");
  for (const k of keyframes) {
    const props = [...k.corpo.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    for (const prop of props) assert.ok(["opacity", "transform"].includes(prop), `@keyframes ${k.nome}: usa '${prop}'`);
  }
});

test("a animação infinita existe só no aviso de tempo acabando (e some com 'reduzir movimento')", () => {
  const infinitas = [...css.matchAll(/([^{}]+)\{[^{}]*animation:[^;}]*infinite[^;}]*/g)].map((m) => m[1].trim());
  assert.deepEqual(infinitas, [".auction-timer.urgent"]);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*animation:\s*none\s*!important[^}]*transition:\s*none\s*!important/, "regra global de 'reduzir movimento'");
});

test("toda animação e transição tem duração curta (nada acima de 0,6 s, exceto o aviso do tempo)", () => {
  for (const m of css.matchAll(/(?:animation|transition):\s*([^;}]+)/g)) {
    if (/infinite/.test(m[1])) continue;
    for (const t of m[1].matchAll(/(?<![\w.-])(\d*\.?\d+)s\b/g)) assert.ok(Number(t[1]) <= 0.6, `duração longa em: ${m[0]}`);
  }
});

test("toque (celular): botões e fichas têm resposta ao apertar (:active), não só ao passar o mouse", () => {
  for (const sel of [".player-chip:active", ".primary:active", ".secondary:active"]) assert.ok(css.includes(sel), sel);
  const semMouse = css.replace(/@media \(hover: ?hover\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
  assert.ok(!semMouse.includes(".player-chip:hover"), "todo :hover da ficha tem de estar dentro do @media (hover:hover)");
  assert.match(css, /@media \(hover: ?hover\)\s*\{[^@]*\.player-chip:hover/, "o 'levantar' da ficha só vale com mouse (no toque ficava preso)");
});

test("o aviso do tempo não depende só do movimento: tem cor própria com contraste nos dois temas", () => {
  assert.match(css, /\.auction-timer\.urgent\s*\{[^}]*color:\s*var\(--urgent\)/);
  assert.match(css, /:root\s*\{\s*--urgent:\s*#[0-9A-Fa-f]{6}/);
  assert.match(css, /:root\[data-theme="light"\]\s*\{\s*--urgent:\s*#[0-9A-Fa-f]{6}/);
});

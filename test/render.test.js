import { test } from "node:test";
import assert from "node:assert/strict";
import { draftSlotsHTML, esc } from "../site/js/render.js";
import { ROLES } from "../site/js/data.js";

const player = (nick, role) => ({ nick, pais: "BR", team: "Time X", forca: 80, role });

test("draft: elenco vazio mostra só a linha 'Faltam' com os 5 papéis (nenhuma vaga vazia ocupa espaço)", () => {
  const html = draftSlotsHTML({});
  assert.ok(!/class="slot filled"/.test(html), "não deve haver linhas de slot");
  assert.match(html, /Faltam:/);
  for (const r of ROLES) assert.ok(html.includes(`>${r}</span>`), "papel " + r);
});

test("draft: quem já foi escalado vira linha e some da lista de faltantes", () => {
  const html = draftSlotsHTML({ AWP: player("NEO"), IGL: player("TaZ") });
  assert.equal((html.match(/class="slot filled"/g) || []).length, 2);
  assert.ok(html.includes("NEO") && html.includes("TaZ"));
  const missing = html.slice(html.indexOf("Faltam:"));
  assert.ok(!missing.includes(">AWP<") && !missing.includes(">IGL<"));
  for (const r of ["Entry", "Support", "Rifler"]) assert.ok(missing.includes(`>${r}<`));
});

test("draft: elenco completo não mostra a linha 'Faltam'", () => {
  const squad = Object.fromEntries(ROLES.map((r) => [r, player("P" + r)]));
  const html = draftSlotsHTML(squad);
  assert.equal((html.match(/class="slot filled"/g) || []).length, 5);
  assert.ok(!html.includes("Faltam"));
});

test("draft: nick de elenco é escapado (sem HTML injetado)", () => {
  const html = draftSlotsHTML({ AWP: player("<img src=x onerror=alert(1)>") });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes(esc("<img src=x onerror=alert(1)>")));
});

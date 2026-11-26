import { test } from "node:test";
import assert from "node:assert/strict";
import { saveActive, loadActive, clearActive, ACTIVE_KEY, ACTIVE_TTL_MS } from "../site/js/session.js";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const TOKEN = "a".repeat(32);
const good = { kind: "cups", code: "ABC234", name: "Meu Time", token: TOKEN };

test("salva e recupera a sala ativa", () => {
  const s = mem();
  assert.equal(saveActive(s, good, 1000), true);
  assert.deepEqual(loadActive(s, 2000), { ...good, ts: 1000 });
});

test("expira após 55 min e limpa o registro", () => {
  const s = mem(); saveActive(s, good, 0);
  assert.ok(loadActive(s, ACTIVE_TTL_MS - 1));
  assert.equal(loadActive(s, ACTIVE_TTL_MS), null);
  assert.equal(s.m.has(ACTIVE_KEY), false);
});

test("recusa gravar dados inválidos", () => {
  const s = mem();
  for (const bad of [{ ...good, kind: "x" }, { ...good, code: "abc234" }, { ...good, code: "ABCI23" }, { ...good, token: "zz" }, { ...good, token: TOKEN.toUpperCase() }, { ...good, name: 5 }])
    assert.equal(saveActive(s, bad), false);
  assert.equal(s.m.size, 0);
});

test("storage adulterado ou corrompido é descartado (nada vai para a UI)", () => {
  for (const raw of ["{nope", "null", "[]", "42", JSON.stringify({ ...good, ts: 1, kind: "<img>" }), JSON.stringify({ ...good, ts: 1, name: "<script>".repeat(5) }),
    JSON.stringify({ ...good, ts: 1, name: "a" }), JSON.stringify({ ...good, ts: "x" }), JSON.stringify({ ...good, ts: 5000 }), JSON.stringify({ ...good, code: "../../x", ts: 1 })]) {
    const s = mem(); s.setItem(ACTIVE_KEY, raw);
    assert.equal(loadActive(s, 1000), null, raw);
    assert.equal(s.m.has(ACTIVE_KEY), false, "deve limpar: " + raw);
  }
});

test("storage que lança (modo privado) não quebra nada", () => {
  const boom = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  assert.equal(saveActive(boom, good), false);
  assert.equal(loadActive(boom), null);
  assert.doesNotThrow(() => clearActive(boom));
});

test("clearActive remove o registro", () => {
  const s = mem(); saveActive(s, good, 1); clearActive(s);
  assert.equal(loadActive(s, 2), null);
});

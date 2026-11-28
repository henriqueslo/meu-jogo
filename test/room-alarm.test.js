import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAlarm, nextAlarm } from "../worker/rooms.js";

const TTL = 60 * 60 * 1000;

test("nextAlarm: o alarme acorda no que vier primeiro, o prazo do jogo ou o fim da sala", () => {
  assert.equal(nextAlarm({ ttlAt: 5000, deadline: null }), 5000);
  assert.equal(nextAlarm({ ttlAt: 5000, deadline: 2000 }), 2000);
  assert.equal(nextAlarm({ ttlAt: 5000, deadline: 9000 }), 5000);           // o prazo do jogo nunca passa do fim da sala
  assert.equal(nextAlarm({ ttlAt: 5000, deadline: undefined }), 5000);
});

test("decideAlarm: sala vencida expira (mesmo se houver prazo); prazo vencido pede o relógio; senão espera", () => {
  assert.equal(decideAlarm({ now: 6000, ttlAt: 5000, deadline: 5500 }), "expire");
  assert.equal(decideAlarm({ now: 3000, ttlAt: 5000, deadline: 2500 }), "tick");
  assert.equal(decideAlarm({ now: 3000, ttlAt: 5000, deadline: 3000 }), "tick");        // exatamente no prazo
  assert.equal(decideAlarm({ now: 2000, ttlAt: 5000, deadline: 2500 }), "wait");        // acordou cedo: reagenda
  assert.equal(decideAlarm({ now: 2000, ttlAt: 5000, deadline: null }), "wait");
  assert.equal(decideAlarm({ now: 5000, ttlAt: 5000, deadline: null }), "expire");
});

test("um jogo sem relógio (campeonato) continua expirando só pelo tempo, como antes", () => {
  const t0 = 1_000_000;
  assert.equal(nextAlarm({ ttlAt: t0 + TTL, deadline: null }), t0 + TTL);
  assert.equal(decideAlarm({ now: t0 + TTL - 1, ttlAt: t0 + TTL, deadline: null }), "wait");
  assert.equal(decideAlarm({ now: t0 + TTL, ttlAt: t0 + TTL, deadline: null }), "expire");
});

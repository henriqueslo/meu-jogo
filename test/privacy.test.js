/* A Política de Privacidade é uma promessa. Estes testes ligam o TEXTO ao CÓDIGO: se alguém mudar
 * o que o site guarda, carrega ou retém sem atualizar a política (ou o contrário), o CI falha. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RETENTION_DAYS, METRICS_RETENTION_DAYS, RATE_LIMIT_RETENTION_HOURS } from "../worker/retention.js";
import { ACTIVE_TTL_MS } from "../site/js/session.js";
import { ADS } from "../site/js/ads-config.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const policy = text(read("site/privacidade.html"));
const terms = text(read("site/termos.html"));
const jsFiles = readdirSync(join(ROOT, "site/js")).filter((f) => f.endsWith(".js"));

test("toda chave do navegador (ml_*) usada pelo código está descrita na política", () => {
  const keys = new Set();
  for (const f of jsFiles) for (const m of read("site/js/" + f).matchAll(/["'`](ml_[A-Za-z0-9_${}.]*)/g)) keys.add(m[1]);
  assert.ok(keys.size >= 5, "esperava achar as chaves ml_*; achou " + [...keys]);
  for (const k of keys) {
    if (k.includes("${")) { assert.ok(policy.includes("ml_cups_") && policy.includes("ml_auctions_"), "token de sala (ml_cups_/ml_auctions_) não descrito"); continue; }
    assert.ok(policy.includes(k), `a chave ${k} é usada no código mas não está na política`);
  }
});

test("o código não usa cookies (a política diz que não define cookies próprios)", () => {
  for (const f of jsFiles) assert.ok(!/document\.cookie/.test(read("site/js/" + f)), f);
  assert.match(policy, /não define cookies próprios/);
});

test("prazos da política = constantes do código", () => {
  assert.equal(RETENTION_DAYS, 90); assert.equal(METRICS_RETENTION_DAYS, 90); assert.equal(RATE_LIMIT_RETENTION_HOURS, 2);
  assert.match(policy, /90 dias/);
  assert.match(policy, /2 horas/);
  assert.equal(ACTIVE_TTL_MS, 55 * 60 * 1000); assert.match(policy, /55 minutos/);
  assert.match(read("worker/room-do.js"), /const TTL_MS = 60 \* 60 \* 1000;/);   // sala: 1 hora
  assert.match(policy, /1 hora/);
});

test("a retenção é de fato executada: Cron Trigger configurado e handler scheduled exportado", () => {
  assert.match(read("wrangler.toml"), /\[triggers\]\s*\ncrons = \["[^"]+"\]/);
  assert.match(read("worker/index.js"), /async scheduled\(/);
  assert.match(read("worker/index.js"), /runPurge/);
});

test("anúncios: o texto reflete a chave (desligada = diz que não exibe; ligada = cita consentimento)", () => {
  for (const [name, t] of [["privacidade", policy], ["termos", terms]]) {
    if (ADS.enabled) { assert.ok(!/não exibe anúncios/.test(t), name); assert.match(t, /anúncios/); }
    else { assert.match(t, /não exibe anúncios/, name); assert.ok(!/(Este site|O site) exibe anúncios/.test(t), name); }
  }
  if (ADS.enabled) assert.match(policy, /Preferências de anúncios/);
});

test("fontes: a política diz que são do próprio site e não cita mais o Google Fonts como usado", () => {
  assert.match(policy, /fontes tipográficas são servidas pelo próprio site/);
  assert.ok(!/Utilizamos o Google Fonts/.test(policy));
});

test("a política não promete o que não é verdade", () => {
  assert.ok(!/não coletamos nem armazenamos dados pessoais/i.test(policy));
  assert.ok(!/mantido por tempo limitado/i.test(policy), "prazo vago: use números");
  assert.match(policy, /pseudonimizad/);
  assert.match(policy, /ANPD/);
  assert.match(policy, /15 dias/);
});

test("contato consistente entre política, termos e sobre", () => {
  const email = /[\w.]+@[\w.]+\.\w+/.exec(policy)?.[0];
  assert.ok(email);
  assert.ok(terms.includes(email)); assert.ok(text(read("site/sobre.html")).includes(email));
});

test("política e termos apontam um para o outro", () => {
  assert.ok(read("site/termos.html").includes('href="/privacidade.html"'));
  assert.ok(read("site/privacidade.html").includes('href="/termos.html"'));
});

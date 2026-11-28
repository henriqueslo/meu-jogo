/* "Apoie o projeto": link em todas as páginas, página sem terceiros e textos legais coerentes com o código. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../site/", import.meta.url));
const read = (p) => readFileSync(join(SITE, p), "utf8");
const pages = readdirSync(SITE).filter((f) => f.endsWith(".html"));

test("toda página tem o link 'Apoie o projeto' no rodapé", () => {
  for (const p of pages) {
    const rodape = /<footer[\s\S]*?<\/footer>/.exec(read(p))?.[0] ?? "";
    assert.match(rodape, /<a href="\/apoie\.html">Apoie o projeto<\/a>/, `${p}: sem link de apoio no rodapé`);
  }
});

test("a página /apoie.html usa só recursos do próprio site e não pede nada a quem apoia", () => {
  const html = read("apoie.html");
  assert.ok(!/<script[^>]+src=["']https?:/i.test(html) && !/<iframe/i.test(html) && !/<form/i.test(html) && !/<input/i.test(html), "terceiros ou formulário");
  assert.match(html, /<script type="module" src="\/js\/apoio\.js"><\/script>/);
  assert.match(html, /<script src="\/js\/theme-init\.js"><\/script>/, "tema aplicado antes de pintar");
  assert.match(html, /sem contrapartida|sem nenhuma contrapartida/i, "aviso de doação sem contrapartida");
  assert.match(html, /sem reembolso/i);
  assert.match(html, /nome do titular|titular/i, "orienta a conferir o titular antes de confirmar");
});

test("o código do apoio não carrega nada de fora nem grava dados do visitante", () => {
  for (const f of ["apoio.js", "pix.js", "qr.js", "apoio-config.js"]) {
    const js = read("js/" + f);
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|import\(["']https?:/.test(js), `${f}: rede ou armazenamento`);
    assert.ok(!/from ["']https?:/.test(js), `${f}: import externo`);
  }
});

test("a configuração só aceita chave aleatória: nenhum CPF, e-mail ou telefone no repositório público", () => {
  const cfg = read("js/apoio-config.js");
  assert.ok(!/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(cfg.replace(/[0-9a-f]{8}-[0-9a-f-]+/g, "")), "parece CPF");
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(cfg.replace(/\/\*[\s\S]*?\*\//, "")), "parece e-mail");
});

test("a política de privacidade e os termos explicam o apoio (Pix com o banco, sem coleta nossa, sem contrapartida)", () => {
  const pol = read("privacidade.html").replace(/<[^>]+>/g, " ");
  assert.match(pol, /Apoio ao projeto/i);
  assert.match(pol, /Pix/);
  assert.match(pol, /banco/i);
  assert.match(pol, /não (coletamos|recebemos|tratamos)[^.]*(apoi|doa|pagamento)/i);
  const termos = read("termos.html").replace(/<[^>]+>/g, " ");
  assert.match(termos, /Apoio ao projeto/i);
  assert.match(termos, /volunt[aá]ri/i);
  assert.match(termos, /sem (qualquer )?contrapartida/i);
  assert.match(termos, /reembolso/i);
});

test("o mapa do site lista a página de apoio", () => {
  assert.match(read("sitemap.xml"), /https:\/\/minhalineup\.com\/apoie\.html/);
});

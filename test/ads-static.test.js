import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../site/", import.meta.url));
const read = (p) => readFileSync(join(SITE, p), "utf8");
const pages = readdirSync(SITE).filter((f) => f.endsWith(".html"));
const csp = read("_headers").split("\n").find((l) => l.includes("Content-Security-Policy")) ?? "";
const enabled = /enabled:\s*true/.test(read("js/ads-config.js"));

const ADS_DOMAINS = ["pagead2.googlesyndication.com", "fundingchoicesmessages.google.com", "googleads.g.doubleclick.net", "tpc.googlesyndication.com"];

test("a chave de anúncios e a CSP andam juntas (ligar uma sem a outra falha o teste)", () => {
  for (const d of ADS_DOMAINS) {
    if (enabled) assert.ok(csp.includes(d), `anúncios LIGADOS, mas a CSP não libera ${d} (veja docs/ADS.md)`);
    else assert.ok(!csp.includes(d), `anúncios DESLIGADOS, mas a CSP libera ${d}: superfície desnecessária`);
  }
  assert.ok(!/unsafe-eval/.test(csp) || enabled, "unsafe-eval só poderia entrar junto com anúncios");
});

test("ads.js só nas páginas de conteúdo — nunca no jogo, nas salas nem nas páginas legais", () => {
  const withAds = pages.filter((p) => read(p).includes("/js/ads.js")).sort();
  assert.deepEqual(withAds, ["formato-suico.html", "funcoes.html", "majors.html", "sobre.html"]);
  for (const p of ["index.html", "privacidade.html", "termos.html"]) assert.ok(!read(p).includes("ads.js"), p);
  for (const f of ["ui.js", "net.js", "duel.js", "cup.js"]) assert.ok(!read("js/" + f).includes("ads"), `${f} não deve tocar em anúncios`);
});

test("ads.txt e meta do AdSense continuam consistentes com o publisherId", () => {
  const id = /publisherId:\s*"(ca-pub-\d+)"/.exec(read("js/ads-config.js"))[1];
  assert.ok(read("ads.txt").includes(id.replace("ca-", "")), "ads.txt");
  for (const p of pages.filter((x) => read(x).includes("google-adsense-account"))) assert.ok(read(p).includes(`content="${id}"`), p);
});

test("nenhuma página carrega script do Google diretamente (só via ads.js, e só se ligado)", () => {
  for (const p of pages) assert.ok(!/googlesyndication|fundingchoices|doubleclick/.test(read(p)), p);
});

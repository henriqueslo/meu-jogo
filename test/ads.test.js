import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldLoadAds, adsUrls, loadAds, openAdPreferences } from "../site/js/ads.js";
import { ADS } from "../site/js/ads-config.js";

const CFG = { enabled: true, publisherId: "ca-pub-1234567890123456" };

/* DOM falso mínimo: registra o que foi criado/inserido. */
function fakeDom({ withFooter = true } = {}) {
  const log = { head: [], body: [], footer: [] };
  const el = (tag) => ({ tag, attrs: {}, style: {}, listeners: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, fn) { this.listeners[t] = fn; } });
  const footer = { appendChild: (n) => log.footer.push(n) };
  const doc = {
    createElement: el, createTextNode: (t) => ({ text: t }),
    head: { appendChild: (n) => log.head.push(n) }, body: { appendChild: (n) => log.body.push(n) },
    querySelector: (sel) => (sel === "footer" && withFooter ? footer : sel.startsWith("iframe") ? log.body.find((n) => n.name === "googlefcPresent") ?? null : null),
  };
  return { doc, log };
}

test("o site nasce SEM anúncios: a chave padrão está desligada", () => {
  assert.equal(ADS.enabled, false);
});

test("shouldLoadAds: só com enabled=true e sem sinal GPC", () => {
  assert.equal(shouldLoadAds({ enabled: false, gpc: false }), false);
  assert.equal(shouldLoadAds({ enabled: undefined }), false);
  assert.equal(shouldLoadAds({ enabled: "true" }), false);          // só booleano estrito
  assert.equal(shouldLoadAds({ enabled: true, gpc: true }), false); // respeita Global Privacy Control
  assert.equal(shouldLoadAds({ enabled: true, gpc: false }), true);
  assert.equal(shouldLoadAds({ enabled: true }), true);
});

test("adsUrls: formato correto e recusa IDs suspeitos (sem injeção na URL)", () => {
  const u = adsUrls("ca-pub-1234567890123456");
  assert.equal(u.adsense, "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456");
  assert.equal(u.funding, "https://fundingchoicesmessages.google.com/i/pub-1234567890123456?ers=1");
  for (const bad of ["pub-123", "ca-pub-12", "ca-pub-1234567890&x=1", "ca-pub-1234567890/../a", "", null, undefined, 5]) assert.throws(() => adsUrls(bad), /inválido/);
});

test("desligado: não cria script, iframe nem link (nenhuma chamada ao DOM)", () => {
  const { doc, log } = fakeDom();
  assert.equal(loadAds(doc, { navigator: {} }, { enabled: false, publisherId: CFG.publisherId }), false);
  assert.deepEqual([log.head.length, log.body.length, log.footer.length], [0, 0, 0]);
});

test("GPC ligado: nem o CMP nem os anúncios são carregados", () => {
  const { doc, log } = fakeDom();
  assert.equal(loadAds(doc, { navigator: { globalPrivacyControl: true } }, CFG), false);
  assert.deepEqual([log.head.length, log.body.length, log.footer.length], [0, 0, 0]);
});

test("ligado: CMP primeiro, depois AdSense (crossorigin), iframe de presença e link de preferências", () => {
  const { doc, log } = fakeDom();
  assert.equal(loadAds(doc, { navigator: {} }, CFG), true);
  assert.equal(log.head.length, 2);
  assert.match(log.head[0].src, /^https:\/\/fundingchoicesmessages\.google\.com\/i\/pub-1234567890123456/);
  assert.match(log.head[1].src, /^https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-/);
  assert.equal(log.head[1].attrs.crossorigin, "anonymous");
  assert.ok(log.head.every((s) => s.async === true));
  assert.equal(log.body.length, 1); assert.equal(log.body[0].name, "googlefcPresent");
  const link = log.footer.find((n) => n.id === "ads-prefs");
  assert.equal(link.textContent, "Preferências de anúncios");
});

test("ligado sem <footer>: carrega mesmo assim e não quebra", () => {
  const { doc, log } = fakeDom({ withFooter: false });
  assert.equal(loadAds(doc, { navigator: {} }, CFG), true);
  assert.equal(log.footer.length, 0);
});

test("openAdPreferences: abre direto se o CMP já carregou; senão enfileira", () => {
  let shown = 0;
  const ready = { googlefc: { showRevocationMessage: () => shown++ } };
  openAdPreferences(ready); assert.equal(shown, 1);
  const win = {};
  openAdPreferences(win);
  assert.equal(win.googlefc.callbackQueue.length, 1);
  win.googlefc.showRevocationMessage = () => shown++;
  win.googlefc.callbackQueue[0](); assert.equal(shown, 2);
});

test("clicar em 'Preferências de anúncios' chama o CMP (e cancela a navegação do link)", () => {
  const { doc, log } = fakeDom();
  let shown = 0, prevented = 0;
  const win = { navigator: {}, googlefc: { showRevocationMessage: () => shown++ } };
  loadAds(doc, win, CFG);
  log.footer.find((n) => n.id === "ads-prefs").listeners.click({ preventDefault: () => prevented++ });
  assert.deepEqual([shown, prevented], [1, 1]);
});

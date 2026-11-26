/* Carregador de anúncios com consentimento. Incluído SÓ nas páginas de conteúdo
 * (majors, funções, formato suíço, sobre) — nunca no jogo nem nas salas multiplayer.
 *
 * Ordem (quando ativado): 1) Funding Choices = CMP do próprio Google (certificado IAB TCF; é
 * ele que mostra o aviso de consentimento e guarda a escolha) → 2) script do AdSense, que
 * respeita essa escolha → 3) link "Preferências de anúncios" no rodapé para rever a decisão.
 *
 * Respeito ao navegador: se o visitante envia o sinal Global Privacy Control (GPC), NÃO
 * carregamos anúncio algum (nem o CMP). Desligado = função não faz nada. */
import { ADS } from "./ads-config.js";

const PUB_RE = /^ca-pub-\d{10,20}$/;

/* Decisão pura (testável). */
export function shouldLoadAds({ enabled, gpc }) {
  return enabled === true && gpc !== true;
}

export function adsUrls(publisherId) {
  if (typeof publisherId !== "string" || !PUB_RE.test(publisherId)) throw new Error("publisherId inválido");
  return {
    adsense: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`,
    funding: `https://fundingchoicesmessages.google.com/i/${publisherId.replace(/^ca-/, "")}?ers=1`,
  };
}

/* Abre de novo o painel de consentimento (direito de rever a escolha). */
export function openAdPreferences(win) {
  const fc = (win.googlefc = win.googlefc || {});
  fc.callbackQueue = fc.callbackQueue || [];
  if (typeof fc.showRevocationMessage === "function") fc.showRevocationMessage();
  else fc.callbackQueue.push(() => win.googlefc.showRevocationMessage());
}

/* Injeta CMP + AdSense + link de preferências. Retorna true se carregou. */
export function loadAds(doc, win, cfg = ADS, nav = win.navigator) {
  if (!shouldLoadAds({ enabled: cfg.enabled, gpc: nav?.globalPrivacyControl })) return false;
  const urls = adsUrls(cfg.publisherId);

  const add = (src, attrs = {}) => {
    const s = doc.createElement("script");
    s.async = true; s.src = src;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    doc.head.appendChild(s);
  };
  add(urls.funding);                                       // 1) CMP
  signalPresence(doc);
  add(urls.adsense, { crossorigin: "anonymous" });         // 2) anúncios

  const footer = doc.querySelector("footer");              // 3) rever consentimento
  if (footer) {
    footer.appendChild(doc.createTextNode(" · "));
    const a = doc.createElement("a");
    a.href = "#"; a.id = "ads-prefs"; a.textContent = "Preferências de anúncios";
    a.addEventListener("click", (e) => { e.preventDefault(); openAdPreferences(win); });
    footer.appendChild(a);
  }
  return true;
}

/* O CMP do Google procura um iframe "googlefcPresent" para saber que a página o suporta. */
function signalPresence(doc) {
  const put = () => {
    if (doc.querySelector('iframe[name="googlefcPresent"]')) return;
    if (!doc.body) return setTimeout(put, 0);
    const f = doc.createElement("iframe");
    f.name = "googlefcPresent"; f.setAttribute("aria-hidden", "true"); f.tabIndex = -1;
    f.style.cssText = "display:none;width:0;height:0;border:0;position:absolute;left:-1000px;top:-1000px;";
    doc.body.appendChild(f);
  };
  put();
}

if (typeof document !== "undefined" && typeof window !== "undefined") loadAds(document, window);

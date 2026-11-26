/* Interruptor dos anúncios. DESLIGADO por padrão: com enabled=false o site não carrega nada do
 * Google (nem script, nem iframe, nem banner). Para ativar, siga docs/ADS.md — a CSP em
 * site/_headers TAMBÉM precisa liberar os domínios do Google (test/static.test.js falha se um
 * dos dois estiver ligado sem o outro). */
export const ADS = {
  enabled: false,
  publisherId: "ca-pub-5654800185992965", // público por natureza (também está em ads.txt e nas <meta>)
};

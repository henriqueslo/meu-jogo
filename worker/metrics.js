/* Contadores diários de uso/saúde, gravados no D1 (tabela `metrics`).
 * Só nomes de eventos e contagens — nada de IP, nome de time, token ou conteúdo.
 * Consulta: `wrangler d1 execute minhalineup --remote --command "SELECT ... FROM metrics ..."`
 * (ver docs/OPERACAO.md). Eventos dentro das salas (game_done, ws_*) vão para o log estruturado. */
import { dayOf } from "./handler.js";
import { log } from "./log.js";

/* Rota "genérica" (sem códigos de sala) para rótulos de log. */
export const routeOf = (pathname) => pathname.replace(/\/+$/, "").replace(/^\/api\/v1\/(cups)\/[^/]+/, "/api/v1/$1/:code");

/* Que contador esta resposta incrementa? (null = nenhum) */
export function metricFor(method, pathname, status) {
  const route = routeOf(pathname);
  if (status >= 500) return "server_error";
  if (status === 429) return "rate_limited";
  if (method === "POST" && status === 201) {
    if (route === "/api/v1/cups") return "cup_created";
    if (route === "/api/v1/daily/entries") return "daily_entry";
  }
  if (route === "/api/v1/daily/entries" && method === "POST") {
    if (status === 422) return "daily_rejected";
    if (status === 409) return "daily_duplicate";
  }
  if (/\/:code\/ws$/.test(route)) {
    if (status === 101) return "ws_connected";
    if (status === 403) return "ws_forbidden_origin";
  }
  return null;
}

/* Conta a resposta e registra 5xx. Nunca lança: monitoramento não pode derrubar o jogo. */
export async function observe(request, response, store, now = new Date()) {
  try {
    const { pathname } = new URL(request.url);
    const name = metricFor(request.method, pathname, response.status);
    if (!name) return;
    if (response.status >= 500) log("http_5xx", { route: routeOf(pathname), status: response.status, method: request.method }, "error");
    await store.count(dayOf(now), name);
  } catch (e) {
    log("metrics_failed", { message: String(e?.message ?? e) }, "warn");
  }
}

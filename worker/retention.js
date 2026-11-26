/* Retenção de dados (job diário via Cron Trigger). A Política de Privacidade promete estes prazos;
 * test/privacy.test.js confere que o texto e estas constantes não divergem.
 *
 *   - ranking do dia (daily_entries): apagado após RETENTION_DAYS dias;
 *   - hash do IP (ip_hash): só serve para limitar abuso NO MESMO DIA; é zerado a partir do dia seguinte;
 *   - contadores (metrics): agregados e sem dados pessoais; apagados após METRICS_RETENTION_DAYS dias;
 *   - rate_limits: janelas de 1 h; apagadas após 2 h;
 *   - salas (duelo/campeonato): somem sozinhas após 1 h sem atividade (alarm do Durable Object). */
import { dayOf } from "./handler.js";
import { log } from "./log.js";

export const RETENTION_DAYS = 90;
export const METRICS_RETENTION_DAYS = 90;
export const RATE_LIMIT_RETENTION_HOURS = 2;

const DAY_MS = 86_400_000;
/* Dia (YYYY-MM-DD, fuso de São Paulo) de `days` dias antes de `now`. */
export const cutoffDay = (now, days) => dayOf(new Date(now.getTime() - days * DAY_MS));

export async function runPurge(store, now = new Date()) {
  const res = await store.purge({
    today: dayOf(now),
    entriesBefore: cutoffDay(now, RETENTION_DAYS),
    metricsBefore: cutoffDay(now, METRICS_RETENTION_DAYS),
    rateLimitsBefore: new Date(now.getTime() - RATE_LIMIT_RETENTION_HOURS * 3_600_000).toISOString(),
  });
  log("purge_done", res);
  return res;
}

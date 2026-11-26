/* Persistência em Cloudflare D1. Só consultas parametrizadas (bind) — nunca concatenar SQL. */
const COLS = "day, player_id, team_name, style, forca, wins, losses, tier, champion, perfeito, squad_json, ip_hash, created_at";
const ORDER_SQL = "ORDER BY tier DESC, wins DESC, forca ASC, created_at ASC";

export function d1Store(db) {
  return {
    async countByIp(day, ipHash) {
      const r = await db.prepare("SELECT COUNT(*) AS n FROM daily_entries WHERE day = ?1 AND ip_hash = ?2").bind(day, ipHash).first();
      return r?.n ?? 0;
    },
    async hasEntry(day, playerId) {
      return !!(await db.prepare("SELECT 1 AS x FROM daily_entries WHERE day = ?1 AND player_id = ?2").bind(day, playerId).first());
    },
    async insertEntry(e) {
      await db.prepare(`INSERT INTO daily_entries (${COLS}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`)
        .bind(e.day, e.player_id, e.team_name, e.style, e.forca, e.wins, e.losses, e.tier, e.champion, e.perfeito, e.squad_json, e.ip_hash, e.created_at).run();
    },
    async rankOf(day, e) {
      const r = await db.prepare(
        `SELECT COUNT(*) + 1 AS rank FROM daily_entries WHERE day = ?1 AND (tier > ?2 OR (tier = ?2 AND (wins > ?3 OR (wins = ?3 AND (forca < ?4 OR (forca = ?4 AND created_at < ?5))))))`)
        .bind(day, e.tier, e.wins, e.forca, e.created_at).first();
      return r?.rank ?? 1;
    },
    /* Contador diário de métricas (UPSERT atômico). */
    async count(day, name) {
      await db.prepare("INSERT INTO metrics (day, name, n) VALUES (?1, ?2, 1) ON CONFLICT(day, name) DO UPDATE SET n = n + 1").bind(day, name).run();
    },
    async ping() { return (await db.prepare("SELECT 1 AS ok").first())?.ok === 1; },
    /* Contador de rate limit: incrementa e devolve o total da janela (UPSERT atômico). */
    async hit(key, nowIso) {
      await db.prepare("DELETE FROM rate_limits WHERE created_at < ?1").bind(new Date(Date.parse(nowIso) - 2 * 3600e3).toISOString()).run();
      const r = await db.prepare("INSERT INTO rate_limits (key, n, created_at) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n").bind(key, nowIso).first();
      return r?.n ?? 1;
    },
    async leaderboard(day, limit) {
      const { results } = await db.prepare(`SELECT ${COLS} FROM daily_entries WHERE day = ?1 ${ORDER_SQL} LIMIT ?2`).bind(day, limit).all();
      return results ?? [];
    },
  };
}

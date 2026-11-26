-- Cloudflare D1. Aplicar com: wrangler d1 execute minhalineup --file=worker/schema.sql
-- Não guarda IP (só hash com sal diário) nem nenhum dado pessoal além do nome de time escolhido.
CREATE TABLE IF NOT EXISTS daily_entries (
  day         TEXT    NOT NULL,            -- YYYY-MM-DD (America/Sao_Paulo)
  player_id   TEXT    NOT NULL,            -- UUID anônimo gerado no navegador
  team_name   TEXT    NOT NULL,
  style       TEXT    NOT NULL,
  forca       INTEGER NOT NULL,
  wins        INTEGER NOT NULL,
  losses      INTEGER NOT NULL,
  tier        INTEGER NOT NULL,            -- 4 perfeito · 3 campeão · 2 playoffs · 1 suíço
  champion    INTEGER NOT NULL,
  perfeito    INTEGER NOT NULL,
  squad_json  TEXT    NOT NULL,
  ip_hash     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  PRIMARY KEY (day, player_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_rank ON daily_entries (day, tier DESC, wins DESC, forca ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_daily_ip   ON daily_entries (day, ip_hash);

-- Fase 2: contador de rate limit (salas criadas por hora e rede). Linhas > 2 h são apagadas a cada uso.
CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT    PRIMARY KEY,
  n          INTEGER NOT NULL,
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_created ON rate_limits (created_at);

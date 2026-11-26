/* Log estruturado (JSON, uma linha por evento) para o Workers Logs / `wrangler tail`.
 *
 * PRIVACIDADE: nunca registrar IP, token, player_id, nome de time, segredo ou corpo de requisição.
 * Campos com esses nomes são REMOVIDOS aqui, mesmo que alguém passe sem querer; valores
 * não primitivos são descartados (evita despejar objetos inteiros por engano). */
const DENY = new Set(["ip", "token", "player_id", "team_name", "name", "secret", "body", "authorization", "cookie", "origin"]);

export function sanitizeFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (DENY.has(k.toLowerCase())) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = typeof v === "string" ? v.slice(0, 200) : v;
  }
  return out;
}

/* level: "info" | "warn" | "error" */
export function log(event, fields = {}, level = "info") {
  const line = JSON.stringify({ level, event, ...sanitizeFields(fields) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

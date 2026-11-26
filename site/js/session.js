/* "Sala ativa" do jogador, para reentrar depois de F5, aba fechada ou queda do navegador.
 *
 * Guardamos em localStorage UM registro { kind, code, name, token, ts } — o token é o que dá
 * de volta o MESMO lugar na sala (o servidor só reconhece o token). Regras:
 *  - expira em 55 min (a sala some em 1 h sem atividade no servidor);
 *  - tudo que vem do storage é validado (formato estrito) antes de ser usado: o storage é
 *    um dado externo e pode estar corrompido ou adulterado;
 *  - o storage entra por parâmetro: roda igual no navegador e nos testes em Node. */
export const ACTIVE_KEY = "ml_active";
export const ACTIVE_TTL_MS = 55 * 60 * 1000;

const KINDS = new Set(["rooms", "cups"]);
const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;
const TOKEN_RE = /^[0-9a-f]{32}$/;

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };   // storage pode lançar (modo privado, bloqueado)

export function saveActive(storage, { kind, code, name, token }, now = Date.now()) {
  if (!KINDS.has(kind) || !CODE_RE.test(code) || !TOKEN_RE.test(token) || typeof name !== "string") return false;
  return safe(() => { storage.setItem(ACTIVE_KEY, JSON.stringify({ kind, code, name: name.slice(0, 24), token, ts: now })); return true; }, false);
}

export function loadActive(storage, now = Date.now()) {
  const raw = safe(() => storage.getItem(ACTIVE_KEY), null);
  if (!raw) return null;
  let a;
  try { a = JSON.parse(raw); } catch { clearActive(storage); return null; }
  const ok = a && typeof a === "object" && KINDS.has(a.kind) && CODE_RE.test(a.code) && TOKEN_RE.test(a.token)
    && typeof a.name === "string" && a.name.length >= 2 && a.name.length <= 24 && Number.isFinite(a.ts)
    && now - a.ts >= 0 && now - a.ts < ACTIVE_TTL_MS;
  if (!ok) { clearActive(storage); return null; }
  return { kind: a.kind, code: a.code, name: a.name, token: a.token, ts: a.ts };
}

export const clearActive = (storage) => safe(() => storage.removeItem(ACTIVE_KEY), undefined);

/* Rótulo para o banner (texto puro; quem renderiza deve escapar o nome). */
export const kindLabel = (kind) => (kind === "cups" ? "campeonato" : "duelo");

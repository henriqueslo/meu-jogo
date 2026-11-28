/* Utilidades puras de salas: código, origem e rate limit por socket. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem I, L, O, 0, 1 (evita confusão ao ditar)
export const CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/* Código aleatório por CSPRNG com amostragem por rejeição (sem viés de módulo). */
export function newCode() {
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const b of globalThis.crypto.getRandomValues(new Uint8Array(16))) {
      if (b < limit && out.length < CODE_LENGTH) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}
export const isCode = (s) => typeof s === "string" && CODE_RE.test(s);
export const normalizeCode = (s) => String(s ?? "").trim().toUpperCase();

/* Handshake WebSocket só de páginas do próprio site (Origin == host da requisição).
 * Navegadores sempre enviam Origin; clientes sem Origin são recusados de propósito. */
export function originAllowed(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

/* Balde de fichas: capacidade `cap`, reposição de `perSec` fichas/s. */
export function makeBucket(cap = 12, perSec = 3, now = Date.now()) {
  let tokens = cap, last = now;
  return {
    take(t = Date.now()) {
      tokens = Math.min(cap, tokens + ((t - last) / 1000) * perSec); last = t;
      if (tokens < 1) return false;
      tokens -= 1; return true;
    },
  };
}

export const MAX_MESSAGE_BYTES = 2048;

/* Utilitários das mensagens das salas. */
export const hex = (n) => [...globalThis.crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;

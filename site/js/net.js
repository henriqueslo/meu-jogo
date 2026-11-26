/* Conexão WebSocket compartilhada por duelo e campeonato: hello, token de reconexão,
 * recuo exponencial, mensagens tipadas e REENTRADA.
 *
 * Dois níveis de memória do jogador:
 *  - sessionStorage (por aba): token da sala + flag "estou numa sala" → F5 volta sozinho;
 *  - localStorage (session.js): última sala ativa → aba fechada/queda do navegador: botão "voltar".
 * Tokens nunca vão em URL. */
import { saveActive, clearActive } from "./session.js";

const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;
export const normalizeCode = (s) => String(s ?? "").trim().toUpperCase();
export const validCode = (s) => CODE_RE.test(normalizeCode(s));

const tokenKey = (kind, code) => `ml_${kind}_${code}`;
const IN_ROOM = "ml_in_room";
const ss = (fn, fb) => { try { return fn(sessionStorage); } catch { return fb; } };
const ls = () => { try { return localStorage; } catch { return null; } };

const getToken = (k, c) => ss((s) => s.getItem(tokenKey(k, c)) || undefined, undefined);
const setToken = (k, c, t) => ss((s) => s.setItem(tokenKey(k, c), t));
const clearToken = (k, c) => ss((s) => s.removeItem(tokenKey(k, c)));
export const inRoomFlag = () => ss((s) => s.getItem(IN_ROOM), null);

/* Reentrada: devolve ao token da aba o que estava guardado na "sala ativa". */
export const adoptActive = (a) => setToken(a.kind, a.code, a.token);

/* kind: "rooms" (duelo) | "cups" (campeonato) */
export async function createRoom(kind) {
  try {
    const r = await fetch(`/api/v1/${kind}`, { method: "POST", headers: { accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, code: j.code } : { ok: false, detail: j.detail ?? "Não foi possível criar a sala." };
  } catch { return { ok: false, detail: "Sem conexão com o servidor." }; }
}

/* true = existe · false = não existe mais · null = não deu para saber (rede/limite) */
export async function roomExists(kind, code) {
  try {
    const r = await fetch(`/api/v1/${kind}/${code}`, { headers: { accept: "application/json" } });
    if (r.status === 404) return false;
    return r.ok ? true : null;
  } catch { return null; }
}

/* Descobre se o código é de duelo ou de campeonato. "rooms" | "cups" | null (não existe) | "error" (não deu para saber). */
export async function resolveRoomKind(code) {
  const probe = async (kind) => {
    try {
      const r = await fetch(`/api/v1/${kind}/${code}`, { headers: { accept: "application/json" } });
      return r.status === 404 ? false : r.ok ? true : null;
    } catch { return null; }
  };
  const [rooms, cups] = await Promise.all([probe("rooms"), probe("cups")]);
  if (rooms === true) return "rooms";
  if (cups === true) return "cups";
  return rooms === false && cups === false ? null : "error";
}

export function connect({ kind, code, name, onState, onNotice, onStatus }) {
  let sock = null, tries = 0, timer = null, leaving = false, token = getToken(kind, code);

  const remember = () => { const st = ls(); if (st && token) saveActive(st, { kind, code, name, token }); };  // renova o prazo a cada atividade

  function open() {
    clearTimeout(timer);
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    sock = new WebSocket(`${proto}//${location.host}/api/v1/${kind}/${code}/ws`);
    sock.addEventListener("open", () => {
      tries = 0; ss((s) => s.setItem(IN_ROOM, `${kind}:${code}`));
      send({ t: "hello", name, token: getToken(kind, code) });
    });
    sock.addEventListener("message", (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "welcome") { token = m.token; setToken(kind, code, token); remember(); }
      else if (m.t === "state") { remember(); onState(m); }
      else if (m.t === "error") {
        onNotice(m.detail || "Erro.");
        if (m.code === "room-full" || m.code === "cup-started" || m.code === "invalid-name" || m.code === "name-taken" || m.code === "name-blocked") forget();   // não adianta tentar voltar
      }
    });
    sock.addEventListener("close", async (e) => {
      if (leaving) return;
      if (e.code === 1000) { forget(); return onNotice("A sala foi encerrada (1 hora sem atividade)."); }
      if (e.code === 4000) return onNotice("Esta sala foi aberta em outra aba.");
      if (e.code === 4013 || e.code === 4009 || e.code === 4008) return onNotice("Conexão encerrada pelo servidor.");
      if (tries >= 6) {
        if ((await roomExists(kind, code)) === false) { forget(); return onNotice("A sala não existe mais."); }
        return onNotice("Não foi possível reconectar. Use “voltar à sala” na tela inicial.");
      }
      timer = setTimeout(open, Math.min(15000, 500 * 2 ** tries++));   // recuo exponencial, até ~15 s
      onStatus("Reconectando…");
    });
  }

  function forget() {                                   // some com todo rastro local desta sala
    const st = ls(); if (st) clearActive(st);
    clearToken(kind, code); ss((s) => s.removeItem(IN_ROOM));
  }

  const send = (obj) => { if (sock && sock.readyState === 1) sock.send(JSON.stringify(obj)); };
  open();
  return {
    send,
    leave() { leaving = true; clearTimeout(timer); try { sock && sock.close(); } catch { /* ok */ } forget(); },
  };
}

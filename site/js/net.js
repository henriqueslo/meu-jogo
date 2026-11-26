/* Conexão WebSocket compartilhada por duelo e campeonato: hello, token de reconexão,
 * recuo exponencial e mensagens tipadas. Token fica em sessionStorage (some ao fechar a aba)
 * e nunca vai em URL. */
const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;
export const normalizeCode = (s) => String(s ?? "").trim().toUpperCase();
export const validCode = (s) => CODE_RE.test(normalizeCode(s));

const tokenKey = (kind, code) => `ml_${kind}_${code}`;
const getToken = (k, c) => { try { return sessionStorage.getItem(tokenKey(k, c)) || undefined; } catch { return undefined; } };
const setToken = (k, c, t) => { try { sessionStorage.setItem(tokenKey(k, c), t); } catch { /* sem storage: só perde a reconexão */ } };
const clearToken = (k, c) => { try { sessionStorage.removeItem(tokenKey(k, c)); } catch { /* ok */ } };

/* kind: "rooms" (duelo) | "cups" (campeonato) */
export async function createRoom(kind) {
  try {
    const r = await fetch(`/api/v1/${kind}`, { method: "POST", headers: { accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, code: j.code } : { ok: false, detail: j.detail ?? "Não foi possível criar a sala." };
  } catch { return { ok: false, detail: "Sem conexão com o servidor." }; }
}

export function connect({ kind, code, name, onState, onNotice, onStatus }) {
  let sock = null, tries = 0, timer = null, leaving = false;

  function open() {
    clearTimeout(timer);
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    sock = new WebSocket(`${proto}//${location.host}/api/v1/${kind}/${code}/ws`);
    sock.addEventListener("open", () => { tries = 0; send({ t: "hello", name, token: getToken(kind, code) }); });
    sock.addEventListener("message", (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "welcome") setToken(kind, code, m.token);
      else if (m.t === "state") onState(m);
      else if (m.t === "error") onNotice(m.detail || "Erro.");
    });
    sock.addEventListener("close", (e) => {
      if (leaving) return;
      if (e.code === 4000) return onNotice("Esta sala foi aberta em outra aba.");
      if (e.code === 4013 || e.code === 4009 || e.code === 4008) return onNotice("Conexão encerrada pelo servidor.");
      if (tries >= 6) return onNotice("Não foi possível reconectar. Volte e entre de novo com o código.");
      timer = setTimeout(open, Math.min(15000, 500 * 2 ** tries++));   // recuo exponencial, até ~15 s
      onStatus("Reconectando…");
    });
  }
  const send = (obj) => { if (sock && sock.readyState === 1) sock.send(JSON.stringify(obj)); };
  open();
  return {
    send,
    leave() { leaving = true; clearTimeout(timer); try { sock && sock.close(); } catch { /* ok */ } clearToken(kind, code); },
  };
}

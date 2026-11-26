/* Cliente do Duelo 1v1 (Fase 2). A tela é só um espelho do estado enviado pelo servidor:
 * o cliente manda INTENÇÕES (refresh/pick/style/rematch) e renderiza o que o servidor devolve. */
import { ROLES } from "./data.js";
import { esc, slotHTML, offersHTML, lineupById } from "./render.js";
import { connect, createRoom as createRoomOf, normalizeCode, validCode } from "./net.js";
export { normalizeCode, validCode };

const $ = (id) => document.getElementById(id);
const STYLE_LABEL = { rush: "Rush", tatico: "Tático", aim: "Aim puro" };

let conn = null, view = null, myCode = "", myName = "";
let onExit = () => {};

export const createRoom = () => createRoomOf("rooms");

export function openDuel({ code, name, exit }) {
  myCode = normalizeCode(code); myName = name; onExit = exit; view = null;
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $("screen-duel").classList.add("active");
  render();
  conn = connect({ kind: "rooms", code: myCode, name, onState: (s) => { view = s; render(); }, onNotice: flash, onStatus: setStatus });
}

const send = (obj) => conn && conn.send(obj);
function setStatus(t) { const el = $("duel-status"); if (el) el.textContent = t; }
function flash(t) { const el = $("duel-flash"); if (el) { el.textContent = t; } }

export function leaveDuel() {
  conn && conn.leave(); conn = null; view = null; onExit();
}

/* ------------------------------ Render ------------------------------ */
function render() {
  const c = $("duel-content");
  if (!view) { c.innerHTML = `<div class="stage-label">Duelo · sala ${esc(myCode)}</div><p id="duel-status" style="color:var(--dim);">Conectando…</p><p id="duel-flash" style="color:var(--danger);"></p>${leaveBtn()}`; bind(); return; }
  const v = view, head = `<div class="stage-label">Duelo Bo${v.best_of} · sala <span class="mono">${esc(v.code)}</span> · rodada ${v.round + 1}</div>
    <p id="duel-flash" style="color:var(--danger); min-height:18px; margin:0 0 6px;"></p>`;
  let body = "";
  if (v.phase === "waiting") body = waitingHTML(v);
  else if (v.phase === "draft") body = draftHTML(v);
  else body = resultHTML(v);
  c.innerHTML = head + body + leaveBtn();
  bind();
}

const leaveBtn = () => `<button class="secondary" id="duel-leave" type="button">Sair do duelo</button>`;

function waitingHTML(v) {
  const link = `${location.origin}/?duelo=${encodeURIComponent(v.code)}`;
  return `<div class="card" style="text-align:center;">
      <div style="color:var(--dim); font-size:12px; text-transform:uppercase; letter-spacing:1.2px;">Código da sala</div>
      <div class="mono" style="font-size:34px; letter-spacing:6px; margin:6px 0;">${esc(v.code)}</div>
      <p style="color:var(--dim); font-size:13px;">Mande o código ou o link para o seu rival. Quando ele entrar, o draft começa.</p>
      <button class="primary" id="duel-copy" type="button" data-link="${esc(link)}">📋 Copiar link</button>
    </div>
    <p id="duel-status" style="color:var(--dim); font-size:13px;">Aguardando rival… você é <b>${esc(v.you.name)}</b>.</p>`;
}

function oppLine(v) {
  const o = v.opp; if (!o) return "";
  const st = !o.connected ? "⚠️ desconectado (pode voltar)" : o.styleChosen ? "pronto ✅" : `montando elenco ${o.picks}/5`;
  return `<p id="duel-status" style="color:var(--dim); font-size:13px;">Rival: <b>${esc(o.name)}</b> · ${st}</p>`;
}

function draftHTML(v) {
  const y = v.you, filled = Object.keys(y.squad).length;
  const slots = ROLES.map((r) => `<div class="slot${y.squad[r] ? " filled" : ""}">${slotHTML(r, y.squad[r])}</div>`).join("");
  let action;
  if (!y.draftDone) {
    const n = y.refreshesLeft;
    action = `<div class="progress">Vaga ${filled + 1} de 5</div>
      <button class="rollbtn primary" id="duel-refresh" type="button" ${n <= 0 ? "disabled" : ""}>${n <= 0 ? "Sem atualizações — escolha um jogador" : `🎲 Atualizar Lineups (${n} restante${n > 1 ? "s" : ""})`}</button>
      <div id="duel-offers">${offersHTML(y.offers.map(lineupById).filter(Boolean), y.squad)}</div>`;
  } else if (!y.style) {
    action = `<p style="color:var(--dim); font-size:13px;">Elenco pronto. Escolha o estilo de jogo (não dá para trocar depois):</p>
      <div class="style-opts">${["rush", "tatico", "aim"].map((s) => `<div class="style-opt" data-duel-style="${s}" role="button" tabindex="0"><b>${STYLE_LABEL[s]}</b></div>`).join("")}</div>`;
  } else {
    action = `<p style="color:var(--dim);">Estilo <b>${esc(STYLE_LABEL[y.style])}</b> escolhido. Aguardando o rival terminar…</p>`;
  }
  return `<div class="slots">${slots}</div>${oppLine(v)}${action}`;
}

function resultHTML(v) {
  const r = v.result, mine = v.you.slot === 0 ? "A" : "B", won = r.winner === mine;
  const side = (k, s) => `<div class="card"><b>${esc(s.name)}</b> <span style="color:var(--dim); font-size:12px;">· ${esc(STYLE_LABEL[s.style])} · força ${r.forca[k]}</span>
      <div class="slots" style="margin:8px 0 0;">${ROLES.map((ro) => `<div class="slot filled">${slotHTML(ro, s.squad[ro], false)}</div>`).join("")}</div></div>`;
  const maps = r.maps.map((m) => `<div class="maprow"><span>${esc(m.map)}${m.ot ? ` <span style="color:var(--t);">· PRORROGAÇÃO</span>` : ""}</span><span>${m.a} - ${m.b}</span></div>`).join("");
  const o = v.opp;
  return `<div class="${won ? "achievement" : "card"}" style="text-align:center;"><h2 style="margin:0;">${won ? "🏆 VITÓRIA" : "Derrota"}</h2>
      <p style="margin:4px 0;">${esc(r.a.name)} <b class="mono">${r.winsA} × ${r.winsB}</b> ${esc(r.b.name)}</p></div>
    ${maps}${side("A", r.a)}${side("B", r.b)}
    <button class="primary" id="duel-rematch" type="button" ${v.you.rematch ? "disabled" : ""}>${v.you.rematch ? "Aguardando o rival…" : "🔁 Revanche"}</button>
    ${o && o.rematch ? '<p style="color:var(--dim); font-size:13px;">O rival quer revanche!</p>' : ""}`;
}

function bind() {
  $("duel-leave")?.addEventListener("click", leaveDuel);
  $("duel-refresh")?.addEventListener("click", () => send({ t: "refresh" }));
  $("duel-rematch")?.addEventListener("click", () => send({ t: "rematch" }));
  $("duel-offers")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".player-chip");
    if (chip && !chip.disabled) send({ t: "pick", lineupId: chip.dataset.lineup, nick: chip.dataset.nick });
  });
  document.querySelectorAll("[data-duel-style]").forEach((el) => {
    const go = () => send({ t: "style", style: el.dataset.duelStyle });
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  $("duel-copy")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(b.dataset.link); b.textContent = "✅ Link copiado!"; } catch { b.textContent = b.dataset.link; }
  });
}

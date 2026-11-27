/* Cliente do Duelo 1v1 (Fase 2). A tela é só um espelho do estado enviado pelo servidor:
 * o cliente manda INTENÇÕES (refresh/pick/style/rematch) e renderiza o que o servidor devolve.
 * A experiência segue a do jogo solo (força e estilo com contexto, herói no resultado, compartilhar,
 * barra de ações fixa): as peças compartilhadas estão em parts.js. Texto do rival é dado não confiável: sempre via esc(). */
import { ROLES } from "./data.js";
import { esc, slotHTML, offersHTML, lineupById, draftSlotsHTML } from "./render.js";
import { connect, createRoom as createRoomOf, normalizeCode, validCode } from "./net.js";
import { styleChooserHTML, squadLineHTML, wireStyleChooser, STYLE_NAME, duelShare } from "./parts.js";
import { shareResult } from "./share.js";
export { normalizeCode, validCode };

const $ = (id) => document.getElementById(id);
const DEFAULT_STYLE = "tatico";

let conn = null, view = null, myCode = "", myName = "";
let pendingStyle = DEFAULT_STYLE;          // o que está marcado na tela (só vai ao servidor ao confirmar)
let onExit = () => {};

export const createRoom = () => createRoomOf("rooms");

export function openDuel({ code, name, exit }) {
  myCode = normalizeCode(code); myName = name; onExit = exit; view = null; pendingStyle = DEFAULT_STYLE;
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
let lastRound = -1;
function render() {
  const c = $("duel-content");
  c.dataset.phase = view ? view.phase : "conectando";
  if (!view) { c.innerHTML = `<div class="stage-label">Duelo · sala ${esc(myCode)}</div><p id="duel-status" style="color:var(--dim);">Conectando…</p><p id="duel-flash" style="color:var(--danger);"></p>${leaveBtn()}`; bind(); return; }
  const v = view, head = `<div class="stage-label">Duelo Bo${v.best_of} · sala <span class="mono">${esc(v.code)}</span> · rodada ${v.round + 1}</div>
    <p id="duel-flash" style="color:var(--danger); min-height:18px; margin:0 0 6px;"></p>`;
  if (v.round !== lastRound) { lastRound = v.round; pendingStyle = DEFAULT_STYLE; }       // revanche: volta ao padrão
  let body = "";
  if (v.phase === "waiting") body = waitingHTML(v) + leaveBtn();
  else if (v.phase === "draft") body = draftHTML(v);
  else body = resultHTML(v);
  c.innerHTML = head + body;
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
  const slots = draftSlotsHTML(y.squad);
  const undo = y.canUndo ? `<button class="secondary" id="duel-undo" type="button" style="margin:8px 0 0;">↩ Desfazer última escolha</button>` : "";
  if (!y.draftDone) {
    const n = y.refreshesLeft;
    return `<div class="draft-layout"><aside class="draft-side"><div class="slots draft-slots">${slots}</div>${undo}${oppLine(v)}</aside>
      <div class="draft-main"><div class="progress">Escolha ${filled + 1} de 5</div>
      <button class="rollbtn primary" id="duel-refresh" type="button" ${n <= 0 ? "disabled" : ""}>${n <= 0 ? "Sem atualizações — escolha um jogador" : `🎲 Atualizar Lineups (${n} restante${n > 1 ? "s" : ""})`}</button>
      <div id="duel-offers">${offersHTML(y.offers.map(lineupById).filter(Boolean), y.squad)}</div>${leaveBtn()}</div></div>`;
  }
  if (!y.style) {
    return `<div class="draft-layout"><aside class="draft-side">${squadLineHTML(y.squad)}</aside>
      <div class="draft-main"><div id="duel-style">${styleChooserHTML(y.squad, pendingStyle)}</div>${undo}${oppLine(v)}</div></div>
      <div class="action-bar"><button class="primary" id="duel-confirm" type="button">Confirmar estilo →</button>${leaveBtn()}</div>`;
  }
  return `<div class="draft-layout"><aside class="draft-side">${squadLineHTML(y.squad)}${oppLine(v)}</aside>
    <div class="draft-main"><p style="color:var(--dim);">Estilo <b>${esc(STYLE_NAME[y.style])}</b> escolhido. Aguardando o rival terminar…</p>${leaveBtn()}</div></div>`;
}

/* Lineup do jogador e dados de compartilhamento a partir do resultado do servidor. */
function shareOf(v) {
  const r = v.result, mineIsA = v.you.slot === 0, mine = mineIsA ? r.a : r.b, other = mineIsA ? r.b : r.a;
  const won = r.winner === (mineIsA ? "A" : "B");
  return duelShare({
    won, team: mine.name, rival: other.name, mine: mineIsA ? r.winsA : r.winsB, other: mineIsA ? r.winsB : r.winsA, bestOf: v.best_of,
    lineup: ROLES.map((ro) => ({ papel: ro, nick: mine.squad[ro].nick })),
  });
}

function resultHTML(v) {
  const r = v.result, mineIsA = v.you.slot === 0, mine = mineIsA ? r.a : r.b, other = mineIsA ? r.b : r.a;
  const won = r.winner === (mineIsA ? "A" : "B"), mi = mineIsA ? r.winsA : r.winsB, ou = mineIsA ? r.winsB : r.winsA;
  const hero = won
    ? { cls: "gold", title: "🏆 VITÓRIA", sub: `Você venceu ${other.name} por ${mi}×${ou} (melhor de ${v.best_of}).` }
    : { cls: "", title: "Derrota", sub: `Perdeu para ${other.name} por ${mi}×${ou}. Que tal pedir a revanche e tentar outro estilo?` };
  const side = (k, s) => `<div class="dr-side"><div class="card"><b>${esc(s.name)}</b> <span style="color:var(--dim); font-size:12px;">· ${esc(STYLE_NAME[s.style])} · força ${r.forca[k]}</span>
      <div class="slots" style="margin:8px 0 0;">${ROLES.map((ro) => `<div class="slot filled">${slotHTML(ro, s.squad[ro], false)}</div>`).join("")}</div></div></div>`;
  const maps = r.maps.map((m) => `<div class="maprow"><span>${esc(m.map)}${m.ot ? ` <span style="color:var(--t);">· PRORROGAÇÃO</span>` : ""}</span><span>${m.a} - ${m.b}</span></div>`).join("");
  const o = v.opp;
  return `<div class="duel-result"><section class="result-hero ${hero.cls}"><h2>${esc(hero.title)}</h2><p>${esc(hero.sub)}</p></section>
    <div class="dr-maps"><div class="stage-label">Mapas</div>${maps}</div>${side("A", r.a)}${side("B", r.b)}</div>
    ${o && o.rematch ? '<p style="color:var(--dim); font-size:13px;">O rival quer revanche!</p>' : ""}
    <div class="action-bar">
      <button class="primary" id="duel-share" type="button">📤 Compartilhar</button>
      <button class="secondary" id="duel-rematch" type="button" ${v.you.rematch ? "disabled" : ""}>${v.you.rematch ? "Aguardando o rival…" : "🔁 Revanche"}</button>
      ${leaveBtn()}
    </div>`;
}

function bind() {
  $("duel-leave")?.addEventListener("click", leaveDuel);
  $("duel-undo")?.addEventListener("click", () => send({ t: "undo" }));
  $("duel-refresh")?.addEventListener("click", () => send({ t: "refresh" }));
  $("duel-rematch")?.addEventListener("click", () => send({ t: "rematch" }));
  $("duel-share")?.addEventListener("click", (e) => { const s = shareOf(view); shareResult(e.currentTarget, s.data, s.text); });
  $("duel-offers")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".player-chip");
    if (chip && !chip.disabled) send({ t: "pick", lineupId: chip.dataset.lineup, nick: chip.dataset.nick });
  });
  const estilos = $("duel-style");
  if (estilos) wireStyleChooser(estilos, (s) => { pendingStyle = s; });
  $("duel-confirm")?.addEventListener("click", (e) => { e.currentTarget.disabled = true; send({ t: "style", style: pendingStyle }); });
  $("duel-copy")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(b.dataset.link); b.textContent = "✅ Link copiado!"; } catch { b.textContent = b.dataset.link; }
  });
}

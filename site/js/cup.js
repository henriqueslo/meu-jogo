/* Cliente do Campeonato multiplayer (Fase 3). Espelho do estado do servidor: manda intenções
 * (start, refresh, pick, style, force, advance) e renderiza o que volta. Texto de outros jogadores
 * (nomes de time) é dado não confiável: sempre via esc(). */
import { ROLES } from "./data.js";
import { esc, slotHTML, offersHTML, lineupById } from "./render.js";
import { connect, createRoom as createRoomOf, normalizeCode, validCode } from "./net.js";

const $ = (id) => document.getElementById(id);
const STYLE_LABEL = { rush: "Rush", tatico: "Tático", aim: "Aim puro" };
const STATUS = {
  champion: "🏆 Campeão", eliminated: "Eliminado no suíço", qualified: "Playoffs", active: "Em disputa",
  "out:Quartas": "Caiu nas quartas", "out:Semifinal": "Caiu na semifinal", "out:Final": "Vice-campeão",
};
const EVENT_TITLE = { qf: "Quartas de final · Bo3", sf: "Semifinal · Bo3", final: "Grande final · Bo5", seed: "Playoffs · chaveamento" };

let conn = null, view = null, myCode = "", myName = "", notice = "";
let onExit = () => {};

export const createCup = () => createRoomOf("cups");

export function openCup({ code, name, exit }) {
  myCode = normalizeCode(code); myName = name; onExit = exit; view = null; notice = "";
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $("screen-cup").classList.add("active");
  render();
  conn = connect({ kind: "cups", code: myCode, name, onState: (s) => { view = s; render(); }, onNotice: (t) => { notice = t; render(); }, onStatus: (t) => { notice = t; render(); } });
}

const send = (obj) => { notice = ""; conn && conn.send(obj); };
const leave = () => { conn && conn.leave(); conn = null; view = null; onExit(); };

/* ------------------------------ Render ------------------------------ */
function render() {
  const c = $("cup-content");
  const head = `<div class="stage-label">Campeonato · sala <span class="mono">${esc(view?.code ?? myCode)}</span></div>
    <p style="color:var(--danger); min-height:18px; margin:0 0 6px;">${esc(notice)}</p>`;
  let body = `<p style="color:var(--dim);">Conectando…</p>`;
  if (view) body = { lobby: lobbyHTML, draft: draftHTML, running: runningHTML, done: doneHTML }[view.phase](view);
  c.innerHTML = head + body + `<button class="secondary" id="cup-leave" type="button">Sair do campeonato</button>`;
  bind();
}

const playersHTML = (v, withProgress) => `<div class="card" style="padding:8px 12px;">${v.players.map((p, i) => `
  <div class="row" style="font-size:13px; padding:2px 0;">
    <span>${i === v.you.slot ? "<b>" : ""}${esc(p.name)}${i === v.you.slot ? "</b> (você)" : ""}${p.host ? ' <span class="badge Underdog">dono</span>' : ""}</span>
    <span style="color:var(--dim);">${!p.connected ? "⚠️ offline" : withProgress ? (p.ready ? "pronto ✅" : `elenco ${p.picks}/5`) : "conectado"}</span>
  </div>`).join("")}</div>`;

function lobbyHTML(v) {
  const link = `${location.origin}/?campeonato=${encodeURIComponent(v.code)}`;
  const host = v.you.host, n = v.players.length;
  return `<div class="card" style="text-align:center;">
      <div style="color:var(--dim); font-size:12px; text-transform:uppercase; letter-spacing:1.2px;">Código da sala</div>
      <div class="mono" style="font-size:34px; letter-spacing:6px; margin:6px 0;">${esc(v.code)}</div>
      <p style="color:var(--dim); font-size:13px;">Convide de ${v.min_players} a ${v.max_players} jogadores. As vagas até 16 times são completadas com lineups históricas.</p>
      <button class="secondary" id="cup-copy" type="button" data-link="${esc(link)}">📋 Copiar link</button>
    </div>
    <div class="stage-label">Jogadores (${n}/${v.max_players})</div>${playersHTML(v, false)}
    ${host ? `<button class="primary" id="cup-start" type="button" ${n < v.min_players ? "disabled" : ""}>🏁 Iniciar campeonato</button>
      ${n < v.min_players ? `<p style="color:var(--dim); font-size:12px;">Precisa de pelo menos ${v.min_players} jogadores.</p>` : ""}`
      : `<p style="color:var(--dim); font-size:13px;">Aguardando o dono iniciar…</p>`}`;
}

function draftHTML(v) {
  const y = v.you, filled = Object.keys(y.squad).length;
  const slots = ROLES.map((r) => `<div class="slot${y.squad[r] ? " filled" : ""}">${slotHTML(r, y.squad[r])}</div>`).join("");
  let action;
  if (!y.draftDone) {
    const n = y.refreshesLeft;
    action = `<div class="progress">Vaga ${filled + 1} de 5</div>
      <button class="rollbtn primary" id="cup-refresh" type="button" ${n <= 0 ? "disabled" : ""}>${n <= 0 ? "Sem atualizações — escolha um jogador" : `🎲 Atualizar Lineups (${n} restante${n > 1 ? "s" : ""})`}</button>
      <div id="cup-offers">${offersHTML(y.offers.map(lineupById).filter(Boolean), y.squad)}</div>`;
  } else if (!y.style) {
    action = `<p style="color:var(--dim); font-size:13px;">Elenco pronto. Escolha o estilo (definitivo):</p>
      <div class="style-opts">${["rush", "tatico", "aim"].map((s) => `<div class="style-opt" data-cup-style="${s}" role="button" tabindex="0"><b>${STYLE_LABEL[s]}</b></div>`).join("")}</div>`;
  } else {
    action = `<p style="color:var(--dim);">Estilo <b>${esc(STYLE_LABEL[y.style])}</b> escolhido. Aguardando os outros jogadores…</p>`;
  }
  const waiting = v.players.some((p) => !p.ready);
  const force = y.canControl && waiting
    ? `<button class="secondary" id="cup-force" type="button">⏩ Completar automaticamente quem faltar</button>
       <p style="color:var(--dim); font-size:12px;">${y.host ? "Você é o dono." : "O dono está offline: você pode seguir sem ele."} Jogadores incompletos recebem elenco automático e estilo Tático.</p>` : "";
  return `<div class="slots">${slots}</div><div class="stage-label">Jogadores</div>${playersHTML(v, true)}${action}${force}`;
}

const rec = (t) => `${t.wins}-${t.losses}`;
function standingsHTML(v) {
  const order = (t) => ({ champion: 0, "out:Final": 1, "out:Semifinal": 2, "out:Quartas": 3, qualified: 4, active: 5, eliminated: 6 }[t.status] ?? 7);
  const rows = [...v.teams].sort((a, b) => order(a) - order(b) || (b.wins - b.losses) - (a.wins - a.losses) || b.forca - a.forca);
  return `<div class="card" style="padding:8px 12px;">${rows.map((t) => {
    const mine = t.human === v.you.slot, human = t.human !== null;
    return `<div class="row" style="font-size:13px; padding:2px 0; ${mine ? "color:var(--t);" : ""}">
      <span>${human ? "★ " : ""}${mine ? "<b>" : ""}${esc(t.name)}${mine ? "</b>" : ""}</span>
      <span style="color:var(--dim);">${rec(t)} · ${esc(STATUS[t.status] ?? "")}</span></div>`;
  }).join("")}</div>`;
}

function eventHTML(v) {
  const ev = v.events.at(-1);
  if (!ev) return `<p style="color:var(--dim);">Tudo pronto. Clique em avançar para jogar a 1ª rodada.</p>`;
  const title = ev.type === "swiss" ? `Primeira Fase · rodada ${ev.round}` : EVENT_TITLE[ev.type];
  if (ev.type === "seed") {
    return `<div class="stage-label">${title}</div>` + ev.seeds.map((t, i) => `<div class="bracket-match"><span>#${i + 1} seed</span><span class="${t.human === v.you.slot ? "you" : ""}">${t.human !== null ? "★ " : ""}${esc(t.name)} (força ${t.forca})</span></div>`).join("");
  }
  const ordered = [...ev.matches].sort((x, y) => (y.a.human !== null || y.b.human !== null) - (x.a.human !== null || x.b.human !== null));
  return `<div class="stage-label">${title}</div>` + ordered.map((m) => {
    const hum = m.a.human !== null || m.b.human !== null, mine = m.a.human === v.you.slot || m.b.human === v.you.slot;
    const nm = (t) => `${t.human !== null ? "★ " : ""}${esc(t.name)}`;
    return `<div class="card${mine ? " mine" : ""}">
      <div class="row"><div class="${m.winner === "A" ? "" : "loser"}" style="font-weight:700;">${nm(m.a)}</div><div class="vs">Bo${m.bo}</div><div style="font-weight:700; text-align:right;" class="${m.winner === "B" ? "" : "loser"}">${nm(m.b)}</div></div>
      <div class="row" style="margin-top:4px;"><div class="score ${m.winner === "A" ? "winner" : "loser"}">${m.winsA}</div><div class="vs">×</div><div class="score ${m.winner === "B" ? "winner" : "loser"}">${m.winsB}</div></div>
      ${hum ? m.maps.map(([map, a, b, ot]) => `<div class="maprow"><span>${esc(map)}${ot ? ' <span style="color:var(--t);">· PRORROGAÇÃO</span>' : ""}</span><span>${a} - ${b}</span></div>`).join("") : ""}
    </div>`;
  }).join("");
}

function runningHTML(v) {
  const ctrl = v.you.canControl;
  return `${eventHTML(v)}
    ${ctrl ? `<button class="primary" id="cup-advance" type="button">Próxima etapa ▶</button>${v.you.host ? "" : '<p style="color:var(--dim); font-size:12px;">O dono está offline: você pode avançar.</p>'}`
      : `<p style="color:var(--dim); font-size:13px;">O dono avança as etapas. Aguardando…</p>`}
    <div class="stage-label">Classificação</div>${standingsHTML(v)}`;
}

function doneHTML(v) {
  const r = v.result, me = r.humans.find((h) => h.slot === v.you.slot);
  const won = r.champion.human === v.you.slot;
  const mvp = r.mvp ? `<div class="stage-label">MVP do campeonato</div><div class="card row"><b>${esc(r.mvp.nick)}</b><span class="mono">${r.mvp.kills}/${r.mvp.deaths} · ${esc(r.mvp.team)}</span></div>` : "";
  return `<div class="${won ? "achievement" : "card"}" style="text-align:center;"><h2 style="margin:0;">${won ? (me.perfeito ? "💎 MAJOR PERFEITO" : "🏆 VOCÊ É O CAMPEÃO") : `Campeão: ${esc(r.champion.name)}`}</h2>
      <p style="margin:4px 0; color:var(--dim);">Seu time: ${esc(me.name)} · ${me.wins}-${me.losses} no suíço · ${esc(STATUS[me.status] ?? "")}</p></div>
    <div class="stage-label">Jogadores humanos</div>
    ${r.humans.map((h) => `<div class="card" style="padding:8px 12px;"><div class="row"><b>${esc(h.name)}${h.slot === v.you.slot ? " (você)" : ""}</b><span style="color:var(--dim); font-size:12px;">${h.wins}-${h.losses} · ${esc(STATUS[h.status] ?? "")}</span></div>
      <div style="color:var(--dim); font-size:12px;">${ROLES.map((ro) => `${ro}: ${esc(h.squad[ro])}`).join(" · ")}</div></div>`).join("")}
    ${mvp}<div class="stage-label">Classificação final</div>${standingsHTML(v)}`;
}

function bind() {
  $("cup-leave")?.addEventListener("click", leave);
  $("cup-start")?.addEventListener("click", () => send({ t: "start" }));
  $("cup-refresh")?.addEventListener("click", () => send({ t: "refresh" }));
  $("cup-force")?.addEventListener("click", () => send({ t: "force" }));
  $("cup-advance")?.addEventListener("click", (e) => { e.currentTarget.disabled = true; send({ t: "advance" }); });
  $("cup-offers")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".player-chip");
    if (chip && !chip.disabled) send({ t: "pick", lineupId: chip.dataset.lineup, nick: chip.dataset.nick });
  });
  document.querySelectorAll("[data-cup-style]").forEach((el) => {
    const go = () => send({ t: "style", style: el.dataset.cupStyle });
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  $("cup-copy")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(b.dataset.link); b.textContent = "✅ Link copiado!"; } catch { b.textContent = b.dataset.link; }
  });
}

export { validCode, normalizeCode };

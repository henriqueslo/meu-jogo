/* Cliente do Campeonato multiplayer (Fase 3). Espelho do estado do servidor: manda intenções
 * (start, refresh, pick, style, force, advance) e renderiza o que volta. Texto de outros jogadores
 * (nomes de time) é dado não confiável: sempre via esc().
 * A experiência segue a do jogo solo (estilo com contexto, campanha à vista, herói e jornada no resultado,
 * compartilhar, barra de ações fixa): as peças compartilhadas estão em parts.js. */
import { ROLES } from "./data.js";
import { esc, slotHTML, offersHTML, lineupById, draftSlotsHTML } from "./render.js";
import { connect, createRoom as createRoomOf, normalizeCode, validCode } from "./net.js";
import {
  styleChooserHTML, squadLineHTML, wireStyleChooser, STYLE_NAME, cupJourney, campaignPanelHTML, campaignStatusText, NEXT_AFTER,
  heroOutcome, journeyHTML, cupShare,
} from "./parts.js";
import { shareResult } from "./share.js";

const $ = (id) => document.getElementById(id);
const DEFAULT_STYLE = "tatico";
const STATUS = {
  champion: "🏆 Campeão", eliminated: "Eliminado no suíço", qualified: "Playoffs", active: "Em disputa",
  "out:Quartas": "Caiu nas quartas", "out:Semifinal": "Caiu na semifinal", "out:Final": "Vice-campeão",
};
const EVENT_TITLE = { qf: "Quartas de final · Bo3", sf: "Semifinal · Bo3", final: "Grande final · Bo5", seed: "Playoffs · chaveamento" };

let conn = null, view = null, myCode = "", myName = "", notice = "";
let pendingStyle = DEFAULT_STYLE;          // o que está marcado na tela (só vai ao servidor ao confirmar)
let onExit = () => {};

export const createCup = () => createRoomOf("cups");

export function openCup({ code, name, exit }) {
  myCode = normalizeCode(code); myName = name; onExit = exit; view = null; notice = ""; pendingStyle = DEFAULT_STYLE;
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $("screen-cup").classList.add("active");
  render();
  conn = connect({ kind: "cups", code: myCode, name, onState: (s) => { view = s; render(); }, onNotice: (t) => { notice = t; render(); }, onStatus: (t) => { notice = t; render(); } });
}

const send = (obj) => { notice = ""; conn && conn.send(obj); };
const leave = () => { conn && conn.leave(); conn = null; view = null; onExit(); };
const leaveBtn = () => `<button class="secondary" id="cup-leave" type="button">Sair do campeonato</button>`;

/* ------------------------------ Render ------------------------------ */
function render() {
  const c = $("cup-content");
  c.dataset.phase = view ? view.phase : "conectando";
  const head = `<div class="stage-label">Campeonato · sala <span class="mono">${esc(view?.code ?? myCode)}</span></div>
    <p style="color:var(--danger); min-height:18px; margin:0 0 6px;">${esc(notice)}</p>`;
  let body = `<p style="color:var(--dim);">Conectando…</p>${leaveBtn()}`;
  if (view) body = { lobby: lobbyHTML, draft: draftHTML, running: runningHTML, done: doneHTML }[view.phase](view);
  c.innerHTML = head + body;
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
      : `<p style="color:var(--dim); font-size:13px;">Aguardando o dono iniciar…</p>`}${leaveBtn()}`;
}

function draftHTML(v) {
  const y = v.you, filled = Object.keys(y.squad).length;
  const slots = draftSlotsHTML(y.squad);
  const waiting = v.players.some((p) => !p.ready);
  const force = y.canControl && waiting
    ? `<button class="secondary" id="cup-force" type="button">⏩ Completar automaticamente quem faltar</button>
       <p style="color:var(--dim); font-size:12px;">${y.host ? "Você é o dono." : "O dono está offline: você pode seguir sem ele."} Jogadores incompletos recebem elenco automático e estilo Tático.</p>` : "";
  const undo = y.canUndo ? `<button class="secondary" id="cup-undo" type="button" style="margin:8px 0 0;">↩ Desfazer última escolha</button>` : "";
  const jogadores = `<div class="stage-label">Jogadores</div>${playersHTML(v, true)}`;
  if (!y.draftDone) {
    const n = y.refreshesLeft;
    return `<div class="draft-layout"><aside class="draft-side"><div class="slots draft-slots">${slots}</div>${undo}${jogadores}</aside>
      <div class="draft-main"><div class="progress">Escolha ${filled + 1} de 5</div>
      <button class="rollbtn primary" id="cup-refresh" type="button" ${n <= 0 ? "disabled" : ""}>${n <= 0 ? "Sem atualizações — escolha um jogador" : `🎲 Atualizar Lineups (${n} restante${n > 1 ? "s" : ""})`}</button>
      <div id="cup-offers">${offersHTML(y.offers.map(lineupById).filter(Boolean), y.squad)}</div>${force}${leaveBtn()}</div></div>`;
  }
  if (!y.style) {
    return `<div class="draft-layout"><aside class="draft-side">${squadLineHTML(y.squad)}</aside>
      <div class="draft-main"><div id="cup-style">${styleChooserHTML(y.squad, pendingStyle)}</div>${undo}${jogadores}${force}</div></div>
      <div class="action-bar"><button class="primary" id="cup-confirm" type="button">Confirmar estilo →</button>${leaveBtn()}</div>`;
  }
  return `<div class="draft-layout"><aside class="draft-side">${squadLineHTML(y.squad)}${jogadores}</aside>
    <div class="draft-main"><p style="color:var(--dim);">Estilo <b>${esc(STYLE_NAME[y.style])}</b> escolhido. Aguardando os outros jogadores…</p>${force}${leaveBtn()}</div></div>`;
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

/* Estado do jogador nos playoffs: "Quartas"/"Semifinal"/"Final" quando já caiu. */
const outAtOf = (status) => (status?.startsWith("out:") ? status.slice(4) : null);
const myTeam = (v) => v.teams?.find((t) => t.human === v.you.slot);

function campaignHTML(v) {
  const me = myTeam(v); if (!me) return "";
  return campaignPanelHTML({
    record: rec(me), journey: cupJourney(v.events, v.you.slot),
    status: campaignStatusText({
      champion: me.status === "champion", eliminated: me.status === "eliminated", outAt: outAtOf(me.status), qualified: me.status === "qualified",
      next: NEXT_AFTER[v.events.at(-1)?.type], wins: me.wins, losses: me.losses,
    }),
  });
}

/* A etapa: o seu jogo inteiro; os outros recolhidos (ou abertos, se você nem jogou). */
function roundHTML(v, ev) {
  const isMine = (m) => m.a.human === v.you.slot || m.b.human === v.you.slot;
  const mine = ev.matches.filter(isMine), others = ev.matches.filter((m) => !isMine(m));
  const nm = (t) => `${t.human !== null ? "★ " : ""}${esc(t.name)}`;
  const card = (m) => `<div class="card mine"><span class="mine-tag">seu time</span>
      <div class="row"><div class="${m.winner === "A" ? "" : "loser"}" style="font-weight:700;">${nm(m.a)}</div><div class="vs">Bo${m.bo}</div><div style="font-weight:700; text-align:right;" class="${m.winner === "B" ? "" : "loser"}">${nm(m.b)}</div></div>
      <div class="row" style="margin-top:4px;"><div class="score ${m.winner === "A" ? "winner" : "loser"}">${m.winsA}</div><div class="vs">×</div><div class="score ${m.winner === "B" ? "winner" : "loser"}">${m.winsB}</div></div>
      ${m.maps.map(([map, a, b, ot]) => `<div class="maprow"><span>${esc(map)}${ot ? ' <span style="color:var(--t);">· PRORROGAÇÃO</span>' : ""}</span><span>${a} - ${b}</span></div>`).join("")}
    </div>`;
  const row = (m) => `<li><span class="${m.winner === "A" ? "w" : ""}">${nm(m.a)}</span><b class="mono">${m.winsA}×${m.winsB}</b><span class="${m.winner === "B" ? "w" : ""}">${nm(m.b)}</span></li>`;
  const label = mine.length ? `Ver os outros ${others.length} ${others.length === 1 ? "jogo" : "jogos"}` : `Jogos da etapa (${others.length})`;
  return mine.map(card).join("") +
    (others.length ? `<details class="others"${mine.length ? "" : " open"}><summary>${label}</summary><ul>${others.map(row).join("")}</ul></details>` : "");
}

/* A etapa em três partes (título, campanha, jogos): a grade do desktop põe a campanha na lateral. */
function eventParts(v) {
  const ev = v.events.at(-1);
  if (!ev) return { title: "", camp: "", round: `<p style="color:var(--dim);">Tudo pronto. Clique em avançar para jogar a 1ª rodada.</p>` };
  const title = `<div class="stage-label">${ev.type === "swiss" ? `Primeira Fase · rodada ${ev.round}` : EVENT_TITLE[ev.type]}</div>`;
  if (ev.type === "seed") {
    return { title, camp: campaignHTML(v), round: ev.seeds.map((t, i) => `<div class="bracket-match"><span>#${i + 1} seed</span><span class="${t.human === v.you.slot ? "you" : ""}">${t.human !== null ? "★ " : ""}${esc(t.name)} (força ${t.forca})</span></div>`).join("") };
  }
  return { title, camp: campaignHTML(v), round: roundHTML(v, ev) };
}

function runningHTML(v) {
  const ctrl = v.you.canControl, p = eventParts(v);
  return `<div class="cup-run"><div class="cr-title">${p.title}</div><div class="cr-camp">${p.camp}</div><div class="cr-round">${p.round}</div>
    <div class="cr-stand"><div class="stage-label">Classificação</div>${standingsHTML(v)}</div></div>
    ${ctrl ? (v.you.host ? "" : '<p style="color:var(--dim); font-size:12px;">O dono está offline: você pode avançar.</p>')
      : `<p style="color:var(--dim); font-size:13px;">O dono avança as etapas. Aguardando…</p>`}
    <div class="action-bar">${ctrl ? `<button class="primary" id="cup-advance" type="button">Próxima etapa ▶</button>` : ""}${leaveBtn()}</div>`;
}

/* Tudo o que o resultado e o compartilhamento precisam sobre o jogador. */
function summaryOf(v) {
  const r = v.result, me = r.humans.find((h) => h.slot === v.you.slot);
  const journey = cupJourney(v.events, v.you.slot);
  const lost = [...journey].reverse().find((j) => !j.won);
  const playoffsRun = journey.filter((j) => j.phase !== "swiss");
  const cleanPlayoffs = playoffsRun.length > 0 && playoffsRun.every((j) => j.won && j.maps.every((m) => m[1] > m[2]));
  const champion = r.champion.human === v.you.slot;
  const playoffs = me.status !== "eliminated";
  const vice = outAtOf(me.status) === "Final";
  return { r, me, journey, lost, cleanPlayoffs, champion, playoffs, vice };
}

function shareOf(v) {
  const { me, cleanPlayoffs, champion, playoffs, vice } = summaryOf(v);
  return cupShare({
    team: me.name, wins: me.wins, losses: me.losses, perfeito: !!me.perfeito, champion, vice, playoffs, cleanPlayoffs,
    lineup: ROLES.map((ro) => ({ papel: ro, nick: me.squad[ro] })), players: v.result.humans.length,
  });
}

function doneHTML(v) {
  const { r, me, journey, lost, cleanPlayoffs, champion } = summaryOf(v);
  const hero = heroOutcome({ perfeito: !!me.perfeito, champion, cleanPlayoffs, outAt: outAtOf(me.status), wins: me.wins, losses: me.losses, lost });
  const mvp = r.mvp ? `<div class="stage-label">MVP do campeonato</div><div class="card row"><b>${esc(r.mvp.nick)}</b><span class="mono">${r.mvp.kills}/${r.mvp.deaths} · ${esc(r.mvp.team)}</span></div>` : "";
  return `<div class="cup-done"><section class="result-hero ${hero.cls}"><h2>${esc(hero.title)}</h2><p>${esc(hero.sub)}</p></section>
    <div class="cd-journey">${journeyHTML(journey)}</div>
    <div class="cd-champion"><div class="stage-label">Campeão</div><div class="card row"><b>${esc(r.champion.name)}</b><span style="color:var(--dim);">força ${r.champion.forca}</span></div></div>
    <div class="cd-humans"><div class="stage-label">Jogadores humanos</div>
    ${r.humans.map((h) => `<div class="card" style="padding:8px 12px;"><div class="row"><b>${esc(h.name)}${h.slot === v.you.slot ? " (você)" : ""}</b><span style="color:var(--dim); font-size:12px;">${h.wins}-${h.losses} · ${esc(STATUS[h.status] ?? "")}</span></div>
      <div style="color:var(--dim); font-size:12px;">${ROLES.map((ro) => `${ro}: ${esc(h.squad[ro])}`).join(" · ")}</div></div>`).join("")}</div>
    <div class="cd-mvp">${mvp}</div><div class="cd-stand"><div class="stage-label">Classificação final</div>${standingsHTML(v)}</div></div>
    <div class="action-bar"><button class="primary" id="cup-share" type="button">📤 Compartilhar</button>${leaveBtn()}</div>`;
}

function bind() {
  $("cup-leave")?.addEventListener("click", leave);
  $("cup-start")?.addEventListener("click", () => send({ t: "start" }));
  $("cup-undo")?.addEventListener("click", () => send({ t: "undo" }));
  $("cup-refresh")?.addEventListener("click", () => send({ t: "refresh" }));
  $("cup-force")?.addEventListener("click", () => send({ t: "force" }));
  $("cup-advance")?.addEventListener("click", (e) => { e.currentTarget.disabled = true; send({ t: "advance" }); });
  $("cup-share")?.addEventListener("click", (e) => { const s = shareOf(view); shareResult(e.currentTarget, s.data, s.text); });
  $("cup-offers")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".player-chip");
    if (chip && !chip.disabled) send({ t: "pick", lineupId: chip.dataset.lineup, nick: chip.dataset.nick });
  });
  const estilos = $("cup-style");
  if (estilos) wireStyleChooser(estilos, (s) => { pendingStyle = s; });
  $("cup-confirm")?.addEventListener("click", (e) => { e.currentTarget.disabled = true; send({ t: "style", style: pendingStyle }); });
  $("cup-copy")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(b.dataset.link); b.textContent = "✅ Link copiado!"; } catch { b.textContent = b.dataset.link; }
  });
}

export { validCode, normalizeCode };

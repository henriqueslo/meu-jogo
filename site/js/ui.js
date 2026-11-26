/* Camada de interface. Toda a regra do jogo vive em engine.js; aqui só há DOM.
 * REGRA DE OURO: todo texto dinâmico em HTML passa por esc(). */
import { ROLES } from "./data.js";
import {
  MAX_REFRESHES, newSeed, createStreams, pickRandomLineups, resolveSquad,
  sanitizeTeamName, createTournament, advance, tournamentMvp, summarize,
} from "./engine.js";
import { shareResult } from "./share.js";
import { fetchDaily, fetchBoard, submitEntry, playedToday, markPlayed, boardHTML } from "./daily.js";
import { esc, flagEmoji, slotHTML } from "./render.js";
import { openDuel, createRoom, validCode, normalizeCode } from "./duel.js";
import { openCup, createCup } from "./cup.js";
import { adoptActive, inRoomFlag, roomExists } from "./net.js";
import { loadActive, clearActive, kindLabel } from "./session.js";

const SITE_URL = "https://minhalineup.com";
const $ = (id) => document.getElementById(id);

/* ------------------------------- Estado ------------------------------- */
const state = {
  teamName: "", style: null, streams: null, seed: 0,
  picks: {},          // role -> {lineupId, nick}  (o que seria enviado ao servidor)
  squad: {},          // role -> dados resolvidos pelo engine
  refreshesLeft: MAX_REFRESHES,
  mode: "free", daily: null, draftLog: [],
  tournament: null, shareData: null, shareText: "",
};

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}

/* ------------------------------- Draft ------------------------------- */
function renderSlots() {
  const cont = $("slots");
  cont.innerHTML = ROLES.map((r) => `<div class="slot${state.squad[r] ? " filled" : ""}">${slotHTML(r, state.squad[r])}</div>`).join("");
  const filled = ROLES.filter((r) => state.squad[r]).length;
  $("draft-progress").textContent = filled < 5 ? `Vaga ${filled + 1} de 5` : "LineUp completa!";
  $("btn-roll").style.display = filled < 5 ? "inline-block" : "none";
}

function showLineups(offers) {
  $("lineup-offers").innerHTML = offers.map((lu) => `
    <div class="lineup-card">
      <div class="lname">${esc(lu.time)} <span class="badge ${esc(lu.raridade)}">${esc(lu.raridade)}</span></div>
      <div class="lmeta">${esc(lu.evento)} · média <span class="rating">${lu.forca}</span></div>
      <div class="players">${lu.jogadores.map((p) => {
        const taken = !!state.squad[p.papel] || usedNicks().has(p.nick);
        return `<button type="button" class="player-chip${taken ? " disabled" : ""}" ${taken ? "disabled" : ""} data-lineup="${esc(lu.id)}" data-nick="${esc(p.nick)}" data-role="${esc(p.papel)}">
          <b><span class="flag">${flagEmoji(p.pais)}</span>${esc(p.nick)}</b><small>${esc(p.papel)} · <span class="rating">${p.forca}</span></small></button>`;
      }).join("")}</div>
    </div>`).join("");
}

const usedNicks = () => new Set(Object.values(state.squad).map((s) => s.nick));
const takenNow = () => ({ roles: new Set(Object.keys(state.squad)), nicks: usedNicks() });
function rollLineups() { showLineups(pickRandomLineups(state.streams.draftRand, takenNow())); updateRefreshUI(); }

function updateRefreshUI() {
  const btn = $("btn-roll"), hint = $("refresh-hint"), n = state.refreshesLeft;
  btn.disabled = n <= 0;
  btn.textContent = n <= 0 ? "Sem atualizações — escolha um jogador" : `🎲 Atualizar Lineups (${n} restante${n > 1 ? "s" : ""})`;
  hint.textContent = n <= 0 ? "Você usou as 3 atualizações desta vaga. Escolha um dos jogadores acima pra seguir." : "";
}

$("btn-roll").addEventListener("click", () => {
  if (state.refreshesLeft <= 0) return;
  state.refreshesLeft--;
  rollLineups();
});

/* Delegação: um único listener para todos os chips (sem handlers inline). */
$("lineup-offers").addEventListener("click", (e) => {
  const chip = e.target.closest(".player-chip");
  if (!chip || chip.disabled) return;
  const role = chip.dataset.role;
  if (state.picks[role]) return;
  // Guarda só IDs; o rating é resolvido pelo engine (nunca vem do DOM).
  state.picks[role] = { lineupId: chip.dataset.lineup, nick: chip.dataset.nick };
  try { state.squad = resolveSquad(state.picks, { partial: true }); }
  catch { delete state.picks[role]; return; }
  // log do draft: é o que o servidor re-executa para validar o desafio do dia
  state.draftLog.push({ refreshes: MAX_REFRESHES - state.refreshesLeft, lineupId: chip.dataset.lineup, nick: chip.dataset.nick });
  state.refreshesLeft = MAX_REFRESHES;
  renderSlots();
  if (ROLES.every((r) => state.squad[r])) {
    $("lineup-offers").innerHTML = "";
    goToTeamScreen();
  } else rollLineups();
});

/* ------------------------------ Início ------------------------------ */
const nameInput = $("team-name-input");
function validateName() {
  const ok = sanitizeTeamName(nameInput.value).length >= 2;
  $("btn-begin").disabled = !ok;
  $("btn-daily").disabled = !ok || !state.daily || playedToday(state.daily.day);
  $("btn-duel-create").disabled = !ok || !state.daily;
  $("btn-duel-join").disabled = !ok || !validCode($("duel-code-input").value);
  $("btn-cup-create").disabled = !ok || !state.daily;
  $("btn-cup-join").disabled = !ok || !validCode($("duel-code-input").value);
  return ok;
}

function beginGame(mode = "free") {
  const name = sanitizeTeamName(nameInput.value);
  if (name.length < 2) {
    $("name-error").textContent = "Dê um nome ao seu time para começar (mínimo 2 caracteres; letras, números, espaço . _ -).";
    nameInput.focus();
    return;
  }
  $("name-error").textContent = "";
  state.teamName = name;
  state.mode = mode === "daily" && state.daily ? "daily" : "free";
  state.seed = state.mode === "daily" ? state.daily.seed : newSeed();
  state.streams = createStreams(state.seed);
  state.draftLog = [];
  state.picks = {}; state.squad = {}; state.refreshesLeft = MAX_REFRESHES;
  showScreen("screen-draft");
  renderSlots();
  rollLineups();
}

$("btn-begin").addEventListener("click", () => beginGame("free"));
$("btn-daily").addEventListener("click", () => beginGame("daily"));
nameInput.addEventListener("input", () => { $("name-error").textContent = ""; validateName(); });
nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && validateName()) beginGame("free"); });
validateName();

/* ------------------------- Time / estilo ------------------------- */
function goToTeamScreen() {
  showScreen("screen-team");
  $("team-final").innerHTML = ROLES.map((r) => `<div class="slot filled">${slotHTML(r, state.squad[r])}</div>`).join("");
}

document.querySelectorAll(".style-opt").forEach((opt) => {
  opt.addEventListener("click", () => {
    document.querySelectorAll(".style-opt").forEach((o) => { o.classList.remove("sel"); o.setAttribute("aria-checked", "false"); });
    opt.classList.add("sel"); opt.setAttribute("aria-checked", "true");
    state.style = opt.dataset.style;
    $("btn-start").disabled = false;
  });
  opt.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opt.click(); } });
});

$("btn-start").addEventListener("click", () => {
  const squad = resolveSquad(state.picks); // mesma validação que o servidor fará
  state.tournament = createTournament({ teamName: state.teamName, squad, style: state.style, seed: state.seed });
  showScreen("screen-sim");
  step();
});

/* --------------------------- Simulação --------------------------- */
let matchId = 0;

function statusUsuario() {
  const t = state.tournament, you = t.teams.find((x) => x.isUser);
  if (t.qualified.includes(you)) return `✅ ${you.nome} está classificado (${you.wins}-${you.losses})`;
  if (t.eliminated.includes(you)) return `❌ ${you.nome} foi eliminado (${you.wins}-${you.losses})`;
  return `${you.nome} · ${you.wins}-${you.losses}`;
}

function renderRoundHTML(results) {
  const ordered = [...results].sort((x, y) => (x.a.isUser || x.b.isUser ? 0 : 1) - (y.a.isUser || y.b.isUser ? 0 : 1));
  return ordered.map(({ a, b, res, bo }, i) => {
    const mid = "match-" + ++matchId, mine = a.isUser || b.isUser;
    return `<div class="card${mine ? " mine" : ""}" style="cursor:pointer; animation-delay:${i * 70}ms;" data-toggle="${mid}">
      ${mine ? '<span class="mine-tag">seu time</span>' : ""}
      <div class="row">
        <div class="${a.isUser ? "you" : ""}" style="font-weight:700;">${esc(a.nome)}</div>
        <div class="vs">Bo${bo}</div>
        <div class="${b.isUser ? "you" : ""}" style="font-weight:700; text-align:right;">${esc(b.nome)}</div>
      </div>
      <div class="row" style="margin-top:4px;">
        <div class="score ${res.winner === a ? "winner" : "loser"}">${res.winsA}</div>
        <div class="vs">×</div>
        <div class="score ${res.winner === b ? "winner" : "loser"}">${res.winsB}</div>
      </div>
      ${res.maps.map((m) => `<div class="maprow"><span>${esc(m.map)}${m.ot ? ` <span style="color:var(--t);">· ${m.ot > 1 ? m.ot + "x " : ""}PRORROGAÇÃO</span>` : ""}</span><span>${m.a} - ${m.b}</span></div>`).join("")}
      <div style="text-align:center; font-size:11px; color:var(--dim); margin-top:6px;">▾ clique pra ver o K/D da partida</div>
      <div id="${mid}-details" data-details style="display:none; margin-top:8px; border-top:1px solid var(--line); padding-top:8px;">${matchDetailsHTML(a, b, res)}</div>
    </div>`;
  }).join("");
}

function matchDetailsHTML(a, b, res) {
  const all = [...res.matchStats.A.map((s) => ({ ...s, teamNome: a.nome })), ...res.matchStats.B.map((s) => ({ ...s, teamNome: b.nome }))]
    .sort((x, y) => y.impact - x.impact);
  return `<div style="font-size:11px; color:var(--dim); margin-bottom:6px;">Ranking de K/D da partida (estatísticas simuladas)</div>` +
    all.map((p, i) => `<div class="row" style="font-size:12px; padding:3px 0;">
      <span>${i + 1}. <span class="flag">${flagEmoji(p.pais)}</span><b>${esc(p.nick)}</b> <span style="color:var(--dim);">(${esc(p.teamNome)})</span></span>
      <span class="mono">${p.kills}/${p.deaths}</span></div>`).join("");
}

$("sim-content").addEventListener("click", (e) => {
  if (e.target.closest("[data-details]")) return; // cliques dentro do painel não fecham
  const card = e.target.closest("[data-toggle]");
  if (!card) return;
  const el = $(card.dataset.toggle + "-details");
  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
});

const STAGES = {
  qf: ["Quartas de final · Bo3", "Semifinal →", "Playoffs", "Quartas de final", "Bo3 · quem perder está eliminado"],
  sf: ["Semifinal · Bo3", "Grande final →", "Playoffs", "Semifinal", "Bo3 · a um passo da decisão"],
  final: ["Grande Final · Bo5", "Ver resultado final →", "É a decisão", "Grande Final", "Bo5 · vale o título do Major"],
};

function step() {
  const t = state.tournament, cont = $("sim-content"), btn = $("btn-next");
  const ev = advance(t);
  btn.style.display = "inline-block";
  btn.onclick = step;
  if (!ev) return renderResults();

  if (ev.type === "swiss") {
    cont.innerHTML = `<div class="stage-label">Primeira Fase (formato suíço) · Rodada ${ev.round}</div>${renderRoundHTML(ev.results)}
      <p style="color:var(--dim); font-size:12px;">Classificados até agora: ${t.qualified.length}/8 · Eliminados: ${t.eliminated.length}/8</p>`;
    btn.textContent = t.active.length > 0 ? "Próxima rodada →" : "Ver seed dos playoffs →";
    playPhase("Primeira Fase · formato suíço", "Rodada " + ev.round, statusUsuario());
  } else if (ev.type === "seed") {
    cont.innerHTML = `<div class="stage-label">Playoffs · Chaveamento (Bo3 até a final Bo5)</div>` +
      ev.seeds.map((x, i) => `<div class="bracket-match"><span>#${i + 1} seed</span><span class="${x.isUser ? "you" : ""}">${esc(x.nome)} (força ${x.forca})</span></div>`).join("");
    btn.textContent = "Começar quartas de final →";
    playPhase("Fim da Primeira Fase", "Playoffs definidos", "Os 8 classificados vão ao mata-mata");
  } else {
    const [label, next, k, title, sub] = STAGES[ev.type];
    cont.innerHTML = `<div class="stage-label">${label}</div>${renderRoundHTML(ev.results)}`;
    btn.textContent = next;
    if (ev.type === "final") btn.onclick = renderResults;
    playPhase(k, title, sub, ev.type === "final");
  }
}

/* --------------------- Transição de fase (overlay) --------------------- */
let phaseTimer = null;
function playPhase(kicker, title, sub, gold) {
  const ov = $("phase-overlay");
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  $("phase-kicker").textContent = kicker;
  const tEl = $("phase-title");
  tEl.textContent = title;
  tEl.classList.toggle("gold", !!gold);
  $("phase-sub").textContent = sub || "";
  clearTimeout(phaseTimer);
  ov.classList.remove("out");
  void ov.offsetWidth;
  ov.classList.add("show");
  const fechar = () => {
    clearTimeout(phaseTimer);
    ov.classList.add("out");
    setTimeout(() => ov.classList.remove("show", "out"), 300);
    ov.onclick = null;
  };
  ov.onclick = fechar;
  phaseTimer = setTimeout(fechar, 1300);
}

/* ------------------------------ Resultado ------------------------------ */
function buildShareText(s) {
  const swiss = "🟩".repeat(s.wins) + "🟥".repeat(s.losses);
  let abertura, desafio;
  if (s.perfeito) { abertura = `💎🏆 FIZ O MAJOR PERFEITO com o ${s.teamName}!`; desafio = "Campeão sem perder UM único mapa. Duvido você repetir essa. 😏"; }
  else if (s.isChampion) { abertura = `🏆 Fui CAMPEÃO DO MAJOR com o ${s.teamName}!`; desafio = "Olha onde eu cheguei — será que você consegue fazer melhor? 👀"; }
  else if (s.wasInPlayoffs) { abertura = `🎯 Cheguei aos playoffs do Major com o ${s.teamName}.`; desafio = "Parei antes do título. Aposto que você não passa daí também. 😅"; }
  else { abertura = `❌ Meu ${s.teamName} caiu na Primeira Fase (${s.wins}-${s.losses}).`; desafio = "Monta um time melhor que o meu, então. Duvido. 🤨"; }
  return `${abertura}\n${desafio}\n\nPrimeira Fase: ${swiss} (${s.wins}-${s.losses})\nLineUp: ${ROLES.map((r) => state.squad[r].nick).join(", ")}\n\n🎮 Monte o seu: ${SITE_URL}`;
}

function renderResults() {
  showScreen("screen-results");
  const t = state.tournament, s = summarize(t), you = t.teams.find((x) => x.isUser);
  let html = "";
  if (s.perfeito) html += `<div class="achievement"><h2>🏆 MAJOR PERFEITO</h2><p>3-0 na Primeira Fase + campeão invicto nos playoffs, sem perder um mapa sequer.</p></div>`;
  else if (s.isChampion) html += `<div class="achievement"><h2>🏆 CAMPEÃO</h2><p>Seu time ergueu o troféu do Major! Recorde na Primeira Fase: ${s.wins}-${s.losses}${s.cleanPlayoffs ? " · invicto nos playoffs" : ""}.</p></div>`;
  else if (s.wasInPlayoffs) html += `<div class="card" style="text-align:center;"><h3>Classificado para os playoffs</h3><p style="color:var(--dim);">Recorde na Primeira Fase: ${s.wins}-${s.losses}. Eliminado antes da final.</p></div>`;
  else html += `<div class="card" style="text-align:center;"><h3>Eliminado na Primeira Fase</h3><p style="color:var(--dim);">Recorde final: ${s.wins}-${s.losses}.</p></div>`;

  html += `<div class="stage-label">Sua LineUp</div><div class="slots">` +
    ROLES.map((r) => `<div class="slot filled">${slotHTML(r, state.squad[r], false)}</div>`).join("") + `</div>`;
  html += `<div class="stage-label">Campeão do Major</div><div class="card row"><b>${esc(t.champion.nome)}</b><span style="color:var(--dim);">força ${t.champion.forca}</span></div>`;

  const mvp = tournamentMvp(t);
  if (mvp) {
    const kd = mvp.deaths > 0 ? (mvp.kills / mvp.deaths).toFixed(2) : mvp.kills.toFixed(2);
    html += `<div class="stage-label">MVP do campeonato</div><div class="card row">
      <div><span class="flag">${flagEmoji(mvp.pais)}</span><b>${esc(mvp.nick)}</b> ${mvp.isUser ? '<span style="color:var(--t); font-size:11px;">(seu time)</span>' : ""}
        <div style="color:var(--dim); font-size:12px;">${esc(mvp.teamNome)} · ${esc(mvp.papel)}</div></div>
      <div class="mono" style="text-align:right;">${mvp.kills}/${mvp.deaths}<div style="color:var(--dim); font-size:11px;">K/D ${kd} · ${mvp.maps} mapas</div></div></div>`;
  }

  state.shareText = buildShareText(s);
  const d = new Date();
  state.shareData = {
    nome: you.nome,
    modo: [d.getDate(), d.getMonth() + 1, d.getFullYear()].map((n, i) => String(n).padStart(i < 2 ? 2 : 4, "0")).join("/"),
    wins: s.wins, losses: s.losses, perfeito: s.perfeito, isChampion: s.isChampion,
    resultadoCurto: s.perfeito ? "💎 MAJOR PERFEITO" : s.isChampion ? "🏆 CAMPEÃO DO MAJOR" : s.wasInPlayoffs ? "PLAYOFFS" : "ELIMINADO NO SUÍÇO",
    resultadoSub: s.perfeito ? "campeão sem perder um único mapa" : s.isChampion ? (s.cleanPlayoffs ? "invicto nos playoffs" : "") : s.wasInPlayoffs ? "eliminado antes da final" : "",
    lineup: ROLES.map((r) => ({ papel: r, nick: state.squad[r].nick })),
  };
  // textContent no lugar de "strip": exibe o texto fielmente, sem interpretar HTML.
  html += `<div class="stage-label">Compartilhar</div><div class="share-box" id="share-box"></div>
    <button class="primary" id="btn-share" type="button">📤 Compartilhar</button>`;
  $("results-content").innerHTML = html;
  $("share-box").textContent = state.shareText;
  $("btn-share").addEventListener("click", (e) => shareResult(e.currentTarget, state.shareData, state.shareText));
  if (state.mode === "daily") dailySection();
}

$("btn-restart").addEventListener("click", () => {
  state.style = null; state.tournament = null;
  document.querySelectorAll(".style-opt").forEach((o) => o.classList.remove("sel"));
  $("btn-start").disabled = true;
  showScreen("screen-start");
  validateName();
});

/* ------------------------ Desafio do dia (Fase 1) ------------------------ */
/* O botão só aparece se a API responder; sem backend o jogo livre segue normal. */
async function initDaily() {
  state.daily = await fetchDaily();
  if (!state.daily) return;
  $("btn-daily").hidden = false;
  $("duel-box").hidden = false;
  const q = new URLSearchParams(location.search).get("duelo");
  if (q && validCode(q)) $("duel-code-input").value = normalizeCode(q);
  const qc = new URLSearchParams(location.search).get("campeonato");
  if (qc && validCode(qc)) $("duel-code-input").value = normalizeCode(qc);
  validateName();
  const rows = await fetchBoard(state.daily.day, 5);
  if (rows && rows.length) {
    $("daily-board-start").innerHTML = `<div class="stage-label">Ranking de hoje</div>${boardHTML(rows, esc)}`;
    $("daily-board-start").hidden = false;
  }
}

function dailySection() {
  const box = document.createElement("div");
  box.innerHTML = `<div class="stage-label">Desafio do dia · ${esc(state.daily.day)}</div>
    <p id="daily-msg" style="color:var(--dim); font-size:13px;">Envie sua lineup ao ranking. O servidor refaz o draft e a simulação — o resultado vale para todos.</p>
    <button class="primary" id="btn-submit-daily" type="button">🏁 Enviar ao ranking</button>
    <div id="daily-board"></div>`;
  $("results-content").appendChild(box);
  $("btn-submit-daily").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const r = await submitEntry({ teamName: state.teamName, style: state.style, draft: state.draftLog });
    const msg = $("daily-msg");
    if (r.ok) {
      markPlayed(state.daily.day);
      msg.textContent = `✅ Enviado! Você está em #${r.rank} hoje.`;
      btn.remove();
    } else {
      msg.textContent = r.status === 409 ? "Você já participou do desafio de hoje." : `Não foi possível enviar: ${r.detail}`;
      if (r.status === 409) { markPlayed(state.daily.day); btn.remove(); } else btn.disabled = false;
    }
    $("daily-board").innerHTML = boardHTML(await fetchBoard(state.daily.day, 10), esc);
  });
}

initDaily();

/* ----------------------------- Duelo (Fase 2) ----------------------------- */
const backToStart = () => { showScreen("screen-start"); validateName(); };
$("duel-code-input").addEventListener("input", (e) => { e.target.value = normalizeCode(e.target.value).replace(/[^A-Z0-9]/g, ""); validateName(); });
$("btn-duel-create").addEventListener("click", async () => {
  const name = sanitizeTeamName(nameInput.value), btn = $("btn-duel-create");
  btn.disabled = true;
  const r = await createRoom();
  if (!r.ok) { $("name-error").textContent = r.detail; validateName(); return; }
  openDuel({ code: r.code, name, exit: backToStart });
});
$("btn-duel-join").addEventListener("click", () => {
  const name = sanitizeTeamName(nameInput.value), code = normalizeCode($("duel-code-input").value);
  if (name.length >= 2 && validCode(code)) openDuel({ code, name, exit: backToStart });
});

/* --------------------------- Campeonato (Fase 3) --------------------------- */
$("btn-cup-create").addEventListener("click", async () => {
  const name = sanitizeTeamName(nameInput.value);
  $("btn-cup-create").disabled = true;
  const r = await createCup();
  if (!r.ok) { $("name-error").textContent = r.detail; validateName(); return; }
  openCup({ code: r.code, name, exit: backToStart });
});
$("btn-cup-join").addEventListener("click", () => {
  const name = sanitizeTeamName(nameInput.value), code = normalizeCode($("duel-code-input").value);
  if (name.length >= 2 && validCode(code)) openCup({ code, name, exit: backToStart });
});

/* ------------------------------- Reentrada ------------------------------- */
/* Sala guardada de uma sessão anterior: F5 volta sozinho; aba fechada mostra o botão "voltar". */
function resumeRoom(a) {
  adoptActive(a);
  (a.kind === "cups" ? openCup : openDuel)({ code: a.code, name: a.name, exit: backToStart });
}

async function initResume() {
  let store; try { store = localStorage; } catch { return; }
  const a = loadActive(store);
  if (!a) return;
  const exists = await roomExists(a.kind, a.code);
  if (exists === false) { clearActive(store); return; }               // sala já foi apagada no servidor
  if (inRoomFlag() === `${a.kind}:${a.code}`) { resumeRoom(a); return; }   // recarregou a página dentro da sala
  $("resume-text").textContent = `Você tem um ${kindLabel(a.kind)} em andamento: sala ${a.code}, como “${a.name}”.`;
  $("resume-box").hidden = false;
  $("btn-resume").onclick = () => { $("resume-box").hidden = true; resumeRoom(a); };
  $("btn-resume-drop").onclick = () => { clearActive(store); $("resume-box").hidden = true; };
}
initResume();

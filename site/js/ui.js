/* Camada de interface. Toda a regra do jogo vive em engine.js; aqui só há DOM.
 * REGRA DE OURO: todo texto dinâmico em HTML passa por esc(). */
import { ROLES } from "./data.js";
import {
  newSeed, Draft, actionsToLog, resolveSquad,
  sanitizeTeamName, createTournament, advance, tournamentMvp, summarize,
} from "./engine.js";
import { shareResult } from "./share.js";
import { fetchDaily, fetchBoard, submitEntry, playedToday, markPlayed, boardHTML } from "./daily.js";
import { esc, flagEmoji, slotHTML, draftSlotsHTML, offersHTML, lineupById } from "./render.js";
import { moderateName, NAME_BLOCKED_MESSAGE } from "./moderation.js";
import { openDuel, createRoom, validCode, normalizeCode } from "./duel.js";
import { openCup, createCup } from "./cup.js";
import { adoptActive, inRoomFlag, roomExists, resolveRoomKind } from "./net.js";
import { loadActive, clearActive, kindLabel } from "./session.js";

const SITE_URL = "https://minhalineup.com";
const DEFAULT_STYLE = "tatico";           // já vem selecionado: o jogador só decide se quiser mudar
const $ = (id) => document.getElementById(id);

/* ------------------------------- Estado ------------------------------- */
const state = {
  teamName: "", style: DEFAULT_STYLE, seed: 0,
  draft: null,        // Draft (engine): fonte única de ofertas, escolhas, atualizações e desfazer
  squad: {},          // role -> dados resolvidos pelo engine (derivado de draft.picks)
  mode: "free", daily: null,
  tournament: null, shareData: null, shareText: "",
  journey: [],        // o que aconteceu com o jogador em cada etapa (painel de campanha e resultado)
};

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo({ top: 0 });
}

/* ------------------------------- Draft ------------------------------- */
function syncDraft() {
  state.squad = resolveSquad(state.draft.picks, { partial: true });
  $("slots").innerHTML = draftSlotsHTML(state.squad);
  const filled = Object.keys(state.squad).length;
  $("draft-progress").textContent = filled < 5 ? `Escolha ${filled + 1} de 5` : "LineUp completa!";
  $("btn-roll").style.display = filled < 5 ? "" : "none";
  $("btn-undo").hidden = !state.draft.canUndo;
}

function showOffers() {
  $("lineup-offers").innerHTML = offersHTML(state.draft.offers.map(lineupById), state.squad);
  const btn = $("btn-roll"), hint = $("refresh-hint"), n = state.draft.refreshesLeft;
  btn.disabled = n <= 0;
  btn.textContent = n <= 0 ? "Sem atualizações — escolha um jogador" : `🎲 Atualizar Lineups (${n} restante${n > 1 ? "s" : ""})`;
  hint.textContent = n <= 0 ? "Você usou as 3 atualizações desta vaga. Escolha um dos jogadores acima pra seguir." : "";
}

$("btn-roll").addEventListener("click", () => {
  if (state.draft.refreshesLeft <= 0) return;
  state.draft.refresh();
  showOffers();
});

/* Delegação: um único listener para todos os chips (sem handlers inline). */
$("lineup-offers").addEventListener("click", (e) => {
  const chip = e.target.closest(".player-chip");
  if (!chip || chip.disabled) return;
  // Só IDs vão para o Draft; o rating é resolvido pelo engine (nunca vem do DOM).
  try { state.draft.pick(chip.dataset.lineup, chip.dataset.nick); } catch { return; }
  syncDraft();
  if (state.draft.done) { $("lineup-offers").innerHTML = ""; goToTeamScreen(); } else showOffers();
});

/* Desfazer: o Draft reproduz tudo menos a última escolha — voltam as MESMAS ofertas de antes. */
function undoPick() {
  if (!state.draft.canUndo) return;
  state.draft.undo();
  showScreen("screen-draft");
  syncDraft(); showOffers();
}
$("btn-undo").addEventListener("click", undoPick);
$("btn-undo-team").addEventListener("click", undoPick);

/* ------------------------------ Início ------------------------------ */
const nameInput = $("team-name-input");

/* Os botões nunca ficam "mortos": clicar sem nome explica e leva o foco ao campo. */
function showNameError(msg) { $("name-error").textContent = msg; nameInput.focus(); }

function requireName({ online }) {
  const clean = sanitizeTeamName(nameInput.value);
  if (clean.length < 2) { showNameError("Dê um nome ao seu time para começar (2 a 24 caracteres: letras, números, espaço . _ -)."); return null; }
  if (online && !moderateName(clean).ok) { showNameError(NAME_BLOCKED_MESSAGE + " (O jogo livre aceita qualquer nome.)"); return null; }
  return clean;
}

/* Só o que depende do estado: o Desafio do dia concluído hoje. */
function refreshStartControls() {
  const played = !!state.daily && playedToday(state.daily.day);
  $("btn-daily").disabled = played;
  $("btn-daily").textContent = played ? "📅 Desafio de hoje concluído · volta amanhã" : "📅 Desafio do dia · todos jogam o mesmo baralho";
}

function beginGame(mode = "free") {
  const name = requireName({ online: mode === "daily" });
  if (!name) return;
  $("name-error").textContent = "";
  state.teamName = name;
  state.mode = mode === "daily" && state.daily ? "daily" : "free";
  state.seed = state.mode === "daily" ? state.daily.seed : newSeed();
  state.draft = new Draft(state.seed);
  state.style = DEFAULT_STYLE;
  showScreen("screen-draft");
  syncDraft(); showOffers();
}

$("btn-begin").addEventListener("click", () => beginGame("free"));
$("btn-daily").addEventListener("click", () => beginGame("daily"));
nameInput.addEventListener("input", () => { $("name-error").textContent = ""; });
nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") beginGame("free"); });

/* ------------------------- Time / estilo ------------------------- */
function selectStyle(style) {
  state.style = style;
  document.querySelectorAll(".style-opt").forEach((o) => {
    const on = o.dataset.style === style;
    o.classList.toggle("sel", on);
    o.setAttribute("aria-checked", on ? "true" : "false");
  });
}

function goToTeamScreen() {
  showScreen("screen-team");
  selectStyle(state.style);                       // padrão (Tático) já marcado; botão de disputar sempre ativo
  $("team-final").innerHTML = ROLES.map((r) => `<div class="slot filled">${slotHTML(r, state.squad[r])}</div>`).join("");
}

document.querySelectorAll(".style-opt").forEach((opt) => {
  opt.addEventListener("click", () => selectStyle(opt.dataset.style));
  opt.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opt.click(); } });
});

$("btn-start").addEventListener("click", () => {
  const squad = resolveSquad(state.draft.picks); // mesma validação que o servidor fará
  state.tournament = createTournament({ teamName: state.teamName, squad, style: state.style, seed: state.seed });
  state.journey = [];
  showScreen("screen-sim");
  step();
});

/* Para quem já conhece o jogo: simula tudo que falta e vai direto ao resultado (a campanha continua registrada). */
$("btn-skip").addEventListener("click", () => {
  while (advanceTournament()) { /* avança até o fim */ }
  renderResults();
});


/* --------------------------- Simulação --------------------------- */
let matchId = 0;

/* ---- Campanha do jogador: o que aconteceu com ELE em cada etapa (alimenta o painel e o resultado) ---- */
const STAGE_NAME = { qf: "Quartas de final", sf: "Semifinal", final: "Grande final" };

function recordJourney(ev) {
  if (!["swiss", "qf", "sf", "final"].includes(ev.type)) return;
  const mine = ev.results.find((r) => r.a.isUser || r.b.isUser);
  if (!mine) return;                                       // o jogador não jogou nesta etapa
  const youA = mine.a.isUser, res = mine.res;
  state.journey.push({
    phase: ev.type, stage: ev.type === "swiss" ? `Rodada ${ev.round}` : STAGE_NAME[ev.type],
    opponent: (youA ? mine.b : mine.a).nome, won: !!res.winner.isUser, bo: mine.bo,
    score: youA ? `${res.winsA}×${res.winsB}` : `${res.winsB}×${res.winsA}`,
    maps: res.maps.map((m) => (youA ? [m.map, m.a, m.b, m.ot] : [m.map, m.b, m.a, m.ot])),
  });
}

/* Avança uma etapa do torneio e registra a campanha do jogador. */
function advanceTournament() {
  const ev = advance(state.tournament);
  if (ev) recordJourney(ev);
  return ev;
}

/* Uma frase sobre onde o jogador está agora (o que falta para classificar/eliminar, ou onde caiu). */
function campaignStatus(t, you) {
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  if (t.champion === you) return "🏆 Campeão do Major!";
  if (t.eliminated.includes(you)) return "❌ Eliminado na Primeira Fase";
  if (you.outAt) return you.outAt === "Final" ? "🥈 Vice-campeão" : `❌ Eliminado ${you.outAt === "Quartas" ? "nas quartas de final" : "na semifinal"}`;
  if (t.qualified.includes(you)) {
    const next = { qf: "quartas de final", sf: "semifinal", final: "grande final" }[t.phase];
    return next ? `✅ Classificado · nos playoffs: ${next}` : "✅ Classificado para os playoffs";
  }
  return `Classifica com mais ${n(3 - you.wins, "vitória", "vitórias")} · elimina com mais ${n(3 - you.losses, "derrota", "derrotas")}`;
}

function campaignHTML() {
  const t = state.tournament, you = t.teams.find((x) => x.isUser);
  const swiss = state.journey.filter((j) => j.phase === "swiss");
  const track = swiss.map((j) => (j.won ? "🟩" : "🟥")).join("");
  const spoken = swiss.map((j) => (j.won ? "vitória" : "derrota")).join(", ");
  return `<section class="campaign" role="region" aria-label="Sua campanha">
    <div class="campaign-row"><span class="campaign-title">Sua campanha</span><span class="campaign-record mono">${you.wins}-${you.losses}</span></div>
    ${track ? `<div class="campaign-track" role="img" aria-label="Fase suíça: ${spoken}">${track}</div>` : ""}
    <p class="campaign-status">${esc(campaignStatus(t, you))}</p>
  </section>`;
}

/* A etapa: o jogo do jogador inteiro; os outros recolhidos (ou abertos, se ele nem jogou). */
function roundHTML(results) {
  const isMine = (r) => r.a.isUser || r.b.isUser;
  const mine = results.filter(isMine), others = results.filter((r) => !isMine(r));
  const row = ({ a, b, res }) => `<li><span class="${res.winner === a ? "w" : ""}">${esc(a.nome)}</span><b class="mono">${res.winsA}×${res.winsB}</b><span class="${res.winner === b ? "w" : ""}">${esc(b.nome)}</span></li>`;
  const label = mine.length ? `Ver os outros ${others.length} ${others.length === 1 ? "jogo" : "jogos"}` : `Jogos da etapa (${others.length})`;
  return renderRoundHTML(mine) +
    (others.length ? `<details class="others"${mine.length ? "" : " open"}><summary>${label}</summary><ul>${others.map(row).join("")}</ul></details>` : "");
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
      <div style="text-align:center; font-size:12px; color:var(--dim); margin-top:6px;">▾ clique pra ver o K/D da partida</div>
      <div id="${mid}-details" data-details style="display:none; margin-top:8px; border-top:1px solid var(--line); padding-top:8px;">${matchDetailsHTML(a, b, res)}</div>
    </div>`;
  }).join("");
}

function matchDetailsHTML(a, b, res) {
  const all = [...res.matchStats.A.map((s) => ({ ...s, teamNome: a.nome })), ...res.matchStats.B.map((s) => ({ ...s, teamNome: b.nome }))]
    .sort((x, y) => y.impact - x.impact);
  return `<div style="font-size:12px; color:var(--dim); margin-bottom:6px;">Ranking de K/D da partida (estatísticas simuladas)</div>` +
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
  const t = state.tournament, cont = $("sim-content"), btn = $("btn-next"), skip = $("btn-skip");
  const ev = advanceTournament();
  btn.hidden = false;
  btn.onclick = step;
  if (!ev) return renderResults();
  skip.hidden = ev.type === "final";                   // na final o botão principal já leva ao resultado

  if (ev.type === "swiss") {
    // Sem overlay no suíço (5 rodadas): o painel de campanha diz onde o jogador está.
    cont.innerHTML = `<div class="stage-label">Primeira Fase (formato suíço) · Rodada ${ev.round}</div>
      ${campaignHTML()}${roundHTML(ev.results)}
      <p style="color:var(--dim); font-size:13px;">Classificados até agora: ${t.qualified.length}/8 · Eliminados: ${t.eliminated.length}/8</p>`;
    btn.textContent = t.active.length > 0 ? "Próxima rodada →" : "Ver seed dos playoffs →";
  } else if (ev.type === "seed") {
    cont.innerHTML = `<div class="stage-label">Playoffs · Chaveamento (Bo3 até a final Bo5)</div>${campaignHTML()}` +
      ev.seeds.map((x, i) => `<div class="bracket-match"><span>#${i + 1} seed</span><span class="${x.isUser ? "you" : ""}">${esc(x.nome)} (força ${x.forca})</span></div>`).join("");
    btn.textContent = "Começar quartas de final →";
    playPhase("Fim da Primeira Fase", "Playoffs definidos", "Os 8 classificados vão ao mata-mata");
  } else {
    const [label, next, k, title, sub] = STAGES[ev.type];
    cont.innerHTML = `<div class="stage-label">${label}</div>${campaignHTML()}${roundHTML(ev.results)}`;
    btn.textContent = next;
    if (ev.type === "final") btn.onclick = renderResults;
    playPhase(k, title, sub, ev.type === "final");     // só o mata-mata tem transição
  }
  window.scrollTo({ top: 0 });                         // nova etapa começa no topo; a barra de ação continua à vista
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
  phaseTimer = setTimeout(fechar, 900);
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
      <div><span class="flag">${flagEmoji(mvp.pais)}</span><b>${esc(mvp.nick)}</b> ${mvp.isUser ? '<span style="color:var(--t); font-size:12px;">(seu time)</span>' : ""}
        <div style="color:var(--dim); font-size:12px;">${esc(mvp.teamNome)} · ${esc(mvp.papel)}</div></div>
      <div class="mono" style="text-align:right;">${mvp.kills}/${mvp.deaths}<div style="color:var(--dim); font-size:12px;">K/D ${kd} · ${mvp.maps} mapas</div></div></div>`;
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
  html += `<div class="stage-label">Texto para compartilhar</div><div class="share-box" id="share-box"></div>`;
  $("results-content").innerHTML = html;
  $("share-box").textContent = state.shareText;
  // As ações do fim do jogo ficam na barra fixa (sempre à vista), não no fim de uma tela comprida.
  $("btn-share").onclick = (e) => shareResult(e.currentTarget, state.shareData, state.shareText);
  $("btn-submit-daily")?.remove();
  if (state.mode === "daily") dailySection();
}

$("btn-restart").addEventListener("click", () => {
  state.tournament = null; state.draft = null; state.style = DEFAULT_STYLE;
  showScreen("screen-start");
  refreshStartControls();
});

/* ------------------------ Desafio do dia (Fase 1) ------------------------ */
/* O botão só aparece se a API responder; sem backend o jogo livre segue normal. */
async function initDaily() {
  state.daily = await fetchDaily();
  if (!state.daily) return;
  $("btn-daily").hidden = false;
  $("duel-box").hidden = false;
  refreshStartControls();
  const q = new URLSearchParams(location.search).get("duelo");
  if (q && validCode(q)) $("duel-code-input").value = normalizeCode(q);
  const qc = new URLSearchParams(location.search).get("campeonato");
  if (qc && validCode(qc)) $("duel-code-input").value = normalizeCode(qc);
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
    <div id="daily-board"></div>`;
  $("results-content").appendChild(box);
  const btn = document.createElement("button");
  btn.className = "primary"; btn.id = "btn-submit-daily"; btn.type = "button"; btn.textContent = "🏁 Enviar ao ranking";
  $("result-actions").prepend(btn);                        // ação principal do desafio: na barra fixa
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const r = await submitEntry({ teamName: state.teamName, style: state.style, draft: actionsToLog(state.draft.actions) });
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

/* ------------------------- Salas: duelo e campeonato ------------------------- */
const backToStart = () => { showScreen("screen-start"); refreshStartControls(); };
$("duel-code-input").addEventListener("input", (e) => {
  e.target.value = normalizeCode(e.target.value).replace(/[^A-Z0-9]/g, "");
  $("join-error").textContent = "";
});

$("btn-duel-create").addEventListener("click", async () => {
  const name = requireName({ online: true });
  if (!name) return;
  const btn = $("btn-duel-create"); btn.disabled = true;
  const r = await createRoom();
  btn.disabled = false;
  if (!r.ok) { $("name-error").textContent = r.detail; return; }
  openDuel({ code: r.code, name, exit: backToStart });
});

$("btn-cup-create").addEventListener("click", async () => {
  const name = requireName({ online: true });
  if (!name) return;
  const btn = $("btn-cup-create"); btn.disabled = true;
  const r = await createCup();
  btn.disabled = false;
  if (!r.ok) { $("name-error").textContent = r.detail; return; }
  openCup({ code: r.code, name, exit: backToStart });
});

/* Entrar com um código só: o servidor diz se a sala é de duelo ou de campeonato. */
$("btn-join").addEventListener("click", async () => {
  const name = requireName({ online: true });
  if (!name) return;
  const err = $("join-error"), input = $("duel-code-input"), code = normalizeCode(input.value);
  err.textContent = "";
  if (!validCode(code)) {
    err.textContent = "O código tem 6 letras e números (sem I, L, O, 0 e 1). Confira com quem convidou você.";
    input.focus();
    return;
  }
  const btn = $("btn-join"), label = btn.textContent;
  btn.disabled = true; btn.textContent = "Procurando…";
  const kind = await resolveRoomKind(code);
  btn.disabled = false; btn.textContent = label;
  if (kind === "rooms") openDuel({ code, name, exit: backToStart });
  else if (kind === "cups") openCup({ code, name, exit: backToStart });
  else if (kind === null) err.textContent = "Não encontramos essa sala. Confira o código ou peça um novo (as salas somem após 1 hora sem atividade).";
  else err.textContent = "Não deu para consultar agora. Verifique sua conexão e tente de novo.";
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

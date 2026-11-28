/* Camada de interface. Toda a regra do jogo vive em engine.js; aqui só há DOM.
 * REGRA DE OURO: todo texto dinâmico em HTML passa por esc(). */
import { ROLES } from "./data.js";
import {
  newSeed, Draft, actionsToLog, resolveSquad, styleAdvice,
  sanitizeTeamName, createTournament, advance, tournamentMvp, summarize,
} from "./engine.js";
import {
  SITE_URL, squadStrength, strengthHTML, styleCardHTML, ADVICE,
  campaignStatusText, campaignPanelHTML, heroOutcome, journeyHTML,
} from "./parts.js";
import { shareResult } from "./share.js";
import { fetchDaily, fetchBoard, submitEntry, playedToday, markPlayed, boardHTML, topFiveHTML } from "./daily.js";
import { esc, flagEmoji, slotHTML, draftSlotsHTML, offersHTML, lineupById } from "./render.js";
import { moderateName, NAME_BLOCKED_MESSAGE } from "./moderation.js";
import { openCup, createCup, closeCup } from "./cup.js";
import { adoptActive, inRoomFlag, roomExists, resolveRoomKind, validCode, normalizeCode } from "./net.js";
import { loadActive, clearActive, kindLabel } from "./session.js";

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

/* Quem escolhe o nome é a pessoa: não há nome padrão. Só voltamos o último nome que ela mesma usou. */
const NAME_KEY = "ml_name";
function loadName() {
  try { const v = sanitizeTeamName(localStorage.getItem(NAME_KEY) || ""); return v.length >= 2 ? v : ""; } catch { return ""; }
}
function saveName(name) { try { localStorage.setItem(NAME_KEY, name); } catch { /* sem storage: só não lembra */ } }
nameInput.value = loadName();
nameInput.addEventListener("focus", () => nameInput.select());      // tocar no campo e digitar já troca a sugestão

/* Os botões nunca ficam "mortos": clicar sem nome explica e leva o foco ao campo. */
function showNameError(msg, field = nameInput, errId = "name-error") { $(errId).textContent = msg; field.focus(); }

function requireName({ online, field = nameInput, errId = "name-error" }) {
  const clean = sanitizeTeamName(field.value);
  if (clean.length < 2) { showNameError("Dê um nome ao seu time para começar (2 a 24 caracteres: letras, números, espaço . _ -).", field, errId); return null; }
  if (online && !moderateName(clean).ok) { showNameError(NAME_BLOCKED_MESSAGE + (field === nameInput ? " (O jogo livre aceita qualquer nome.)" : ""), field, errId); return null; }
  saveName(clean);
  return clean;
}

/* Só o que depende do estado: o Desafio diário concluído hoje. */
function refreshStartControls() {
  const played = !!state.daily && playedToday(state.daily.day);
  $("btn-daily").disabled = played;
  $("btn-daily").textContent = played ? "Concluído · volta amanhã" : "Jogar o desafio";
}

/* Mostra a home e atualiza o que muda com o tempo: o Desafio (já feito hoje?) e o Top 5 (alguém acabou de entrar?). */
function showHome() {
  showScreen("screen-start");
  refreshStartControls();
  refreshTop5();
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

/* Força do time, cartas de estilo e sugestão: site/js/parts.js (as mesmas telas do campeonato). */

function goToTeamScreen() {
  showScreen("screen-team");
  const st = squadStrength(state.squad), sugerido = styleAdvice(st.nivel);
  $("team-final").innerHTML = ROLES.map((r) => `<div class="slot filled">${slotHTML(r, state.squad[r])}</div>`).join("");
  $("team-strength").innerHTML = strengthHTML(st);
  document.querySelectorAll(".style-opt").forEach((o) => { o.innerHTML = styleCardHTML(o.dataset.style, o.dataset.style === sugerido); });
  $("style-advice").textContent = ADVICE[st.nivel];
  selectStyle(state.style);                       // o padrão (Tático) continua marcado; a sugestão é só uma etiqueta
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

/* O painel e as frases da campanha são os mesmos do campeonato (site/js/parts.js). */
function campaignHTML() {
  const t = state.tournament, you = t.teams.find((x) => x.isUser);
  const next = { qf: "quartas de final", sf: "semifinal", final: "grande final" }[t.phase];
  return campaignPanelHTML({
    record: `${you.wins}-${you.losses}`, journey: state.journey,
    status: campaignStatusText({ champion: t.champion === you, eliminated: t.eliminated.includes(you), outAt: you.outAt, qualified: t.qualified.includes(you), next, wins: you.wins, losses: you.losses }),
  });
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

/* ------------------------- Resultado: a história do torneio ------------------------- */
/* O herói e a jornada vêm de site/js/parts.js (os mesmos do campeonato). */
function heroFor(s, you) {
  const lost = [...state.journey].reverse().find((j) => !j.won);            // último jogo perdido
  return heroOutcome({ perfeito: s.perfeito, champion: s.isChampion, cleanPlayoffs: s.cleanPlayoffs, outAt: you.outAt, wins: s.wins, losses: s.losses, lost });
}

/* Convites no pico de engajamento — só quando os modos online existem e o nome é aceito nele. */
function nextStepsHTML() {
  if (!state.daily || !moderateName(state.teamName).ok) return "";
  const daily = state.mode !== "daily" && !playedToday(state.daily.day);
  return `<section class="next-steps" role="region" aria-label="E agora?">
    <h3>E agora?</h3>
    <p>Chame amigos para um campeonato${daily ? " ou entre no desafio de hoje, em que todos jogam o mesmo baralho" : ""}.</p>
    <div class="next-actions">
      <button class="secondary" id="btn-next-cup" type="button">🏆 Criar campeonato</button>
      ${daily ? '<button class="secondary" id="btn-next-daily" type="button">📅 Desafio diário</button>' : ""}
    </div></section>`;
}

function renderResults() {
  showScreen("screen-results");
  const t = state.tournament, s = summarize(t), you = t.teams.find((x) => x.isUser);
  const hero = heroFor(s, you);
  let html = `<section class="result-hero ${hero.cls}"><h2>${esc(hero.title)}</h2><p>${esc(hero.sub)}</p></section>`;
  html += '<div class="result-cols"><div class="result-col">' + journeyHTML(state.journey);
  html += `<div class="stage-label">Sua lineup · força ${you.forca}</div><div class="slots">` +
    ROLES.map((r) => `<div class="slot filled">${slotHTML(r, state.squad[r], false)}</div>`).join("") + `</div>`;
  html += '</div><div class="result-col">';
  html += nextStepsHTML();
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
  html += '</div></div>';
  $("results-content").innerHTML = html;
  $("share-box").textContent = state.shareText;

  // Ações na barra fixa: Compartilhar é a principal (no desafio, a principal é enviar ao ranking).
  const daily = state.mode === "daily";
  $("btn-share").className = daily ? "secondary" : "primary";
  $("btn-share").onclick = (e) => shareResult(e.currentTarget, state.shareData, state.shareText);
  $("btn-retry").hidden = daily;                           // no desafio cada um joga uma vez
  $("btn-submit-daily")?.remove();
  if (daily) dailySection();

  $("btn-next-cup")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    const r = await createAndOpenCup(state.teamName);
    if (!r.ok) { e.currentTarget.disabled = false; document.querySelector(".next-steps p").textContent = r.detail; }
  });
  $("btn-next-daily")?.addEventListener("click", () => { nameInput.value = state.teamName; beginGame("daily"); });
}

/* Tentar de novo com ESTE time: mesmo elenco, nova simulação (nova seed). Volta à tela do time, onde dá para trocar o estilo. */
$("btn-retry").addEventListener("click", () => {
  if (state.mode === "daily") return;
  state.seed = newSeed();
  state.journey = []; state.tournament = null;
  goToTeamScreen();
});

$("btn-restart").addEventListener("click", () => {
  state.tournament = null; state.draft = null; state.style = DEFAULT_STYLE;
  showHome();
});

/* ------------------------ Desafio diário (Fase 1) ------------------------ */
/* O Desafio, o Top 5 e o Multiplayer só aparecem se a API responder; sem backend o Modo rápido segue normal. */
async function initDaily() {
  state.daily = await fetchDaily();
  if (!state.daily) return;
  $("daily-card").hidden = false;
  $("multi-block").hidden = false;
  refreshStartControls();
  refreshTop5();
}

/* O Top 5 só aparece se houver gente (e ocupa pouco espaço). Recarrega a cada volta à home. */
async function refreshTop5() {
  if (!state.daily) return;
  const rows = await fetchBoard(state.daily.day, 5, { fresh: true });
  if (rows && rows.length) {
    $("top5-list").innerHTML = topFiveHTML(rows, esc);
    $("daily-board-start").hidden = false;
  }
}

function dailySection() {
  const box = document.createElement("div");
  box.innerHTML = `<div class="stage-label">Desafio diário · ${esc(state.daily.day)}</div>
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

/* ------------------------- Salas (campeonato) ------------------------- */
/* Cada tipo de sala tem o seu abridor, o seu parâmetro de convite (INVITES) e o seu tipo em net.js. */
const OPEN = { cups: openCup };
const backToStart = showHome;
$("room-code-input").addEventListener("input", (e) => {
  e.target.value = normalizeCode(e.target.value).replace(/[^A-Z0-9]/g, "");
  $("join-error").textContent = "";
});

/* Cria a sala e entra nela. Usado pelo botão da tela inicial e pelo convite do fim do jogo. */
async function createAndOpenCup(name) {
  const r = await createCup();
  if (r.ok) openCup({ code: r.code, name, exit: backToStart });
  return r;
}

$("btn-cup-create").addEventListener("click", async () => {
  const name = requireName({ online: true });
  if (!name) return;
  const btn = $("btn-cup-create"); btn.disabled = true;
  const r = await createAndOpenCup(name);
  btn.disabled = false;
  if (!r.ok) $("name-error").textContent = r.detail;
});

/* Entrar com um código só: o servidor diz que tipo de sala é. */
$("btn-join").addEventListener("click", async () => {
  const name = requireName({ online: true });
  if (!name) return;
  const err = $("join-error"), input = $("room-code-input"), code = normalizeCode(input.value);
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
  if (OPEN[kind]) OPEN[kind]({ code, name, exit: backToStart });
  else if (kind === null) err.textContent = "Não encontramos essa sala. Confira o código ou peça um novo (as salas somem após 1 hora sem atividade).";
  else err.textContent = "Não deu para consultar agora. Verifique sua conexão e tente de novo.";
});

/* ------------------------------- Reentrada ------------------------------- */
/* Sala guardada de uma sessão anterior: F5 volta sozinho; aba fechada ou logo clicado mostra o botão "voltar". */
function resumeRoom(a) {
  adoptActive(a);
  OPEN[a.kind]({ code: a.code, name: a.name, exit: backToStart });
}

async function offerResume({ auto = false } = {}) {
  let store; try { store = localStorage; } catch { return; }
  const a = loadActive(store);
  if (!a) return;
  const exists = await roomExists(a.kind, a.code);
  if (exists === false) { clearActive(store); return; }               // sala já foi apagada no servidor
  if (auto && inRoomFlag() === `${a.kind}:${a.code}`) { resumeRoom(a); return; }   // recarregou a página dentro da sala
  $("resume-text").textContent = `Você tem um ${kindLabel(a.kind)} em andamento: sala ${a.code}, como “${a.name}”.`;
  $("resume-box").hidden = false;
  $("btn-resume").onclick = () => { $("resume-box").hidden = true; resumeRoom(a); };
  $("btn-resume-drop").onclick = () => { clearActive(store); $("resume-box").hidden = true; };
}

/* ------------------------- Convite por link ------------------------- */
/* ?campeonato=CÓDIGO leva direto à página do convite: só falta o nome.
 * (Antes caía na home, e o botão principal de lá começa uma partida solo.) Não depende da API do Desafio. */
const INVITES = { campeonato: { kind: "cups", nome: "campeonato", titulo: "Você foi convidado para um campeonato" } };

function initInvite() {
  const qs = new URLSearchParams(location.search);
  const param = Object.keys(INVITES).find((p) => validCode(qs.get(p) ?? ""));
  if (!param) return false;
  const { kind, nome, titulo } = INVITES[param];
  const code = normalizeCode(qs.get(param));
  const open = OPEN[kind];

  let store; try { store = localStorage; } catch { store = null; }
  const a = store && loadActive(store);
  if (a && a.kind === kind && a.code === code) { resumeRoom(a); return true; }   // já estava nessa sala: volta sem pedir nome

  $("invite-title").textContent = titulo;
  $("invite-code").textContent = code;
  $("btn-invite-join").textContent = `Entrar no ${nome} →`;
  const field = $("invite-name-input");
  field.value = loadName();
  field.addEventListener("input", () => { $("invite-error").textContent = ""; });
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-invite-join").click(); });
  showScreen("screen-invite");

  const leave = () => history.replaceState(null, "", location.pathname);   // o link não volta a abrir o convite
  $("btn-invite-home").addEventListener("click", () => { leave(); backToStart(); });
  $("btn-invite-join").addEventListener("click", () => {
    const name = requireName({ online: true, field, errId: "invite-error" });
    if (!name) return;
    leave();
    open({ code, name, exit: backToStart });
  });

  roomExists(kind, code).then((exists) => {
    if (exists !== false) return;                                   // true ou "não deu para saber": deixa tentar
    $("invite-form").hidden = true;
    $("invite-gone").hidden = false;
  });
  return true;
}

/* ------------------------------- Logo = home ------------------------------- */
/* Num jogo solo em andamento pergunta antes (perderia o jogo). Numa sala só sai da tela: a sala continua
 * guardada e a home oferece "Voltar à sala". */
const SOLO_SCREENS = ["screen-draft", "screen-team", "screen-sim"];
function goHome() {
  const ativa = document.querySelector(".screen.active")?.id;
  if (SOLO_SCREENS.includes(ativa) && !window.confirm("Voltar ao início? Você perde este jogo.")) return;
  closeCup();
  state.tournament = null; state.draft = null; state.style = DEFAULT_STYLE; state.journey = [];
  if (location.search) history.replaceState(null, "", location.pathname);
  backToStart();
  offerResume();
}
$("logo-home").addEventListener("click", (e) => { e.preventDefault(); goHome(); });

if (!initInvite()) offerResume({ auto: true });

/* Peças de tela compartilhadas entre o jogo solo e o campeonato.
 * Funções puras: recebem dados e devolvem HTML/objetos — nada de DOM nem de estado global. Assim os três
 * modos contam a mesma história (força, estilo, campanha, herói, jornada, compartilhar) e não divergem. */
import { ROLES } from "./data.js";
import { teamStrength, styleAdvice, STYLE_INFO } from "./engine.js";
import { esc } from "./render.js";

export const SITE_URL = "https://minhalineup.com";

/* ------------------------- Estilo com contexto (C2) ------------------------- */
export const STYLE_ORDER = ["rush", "tatico", "aim"];
export const STYLE_NAME = { rush: "Rush", tatico: "Tático", aim: "Aim puro" };
export const STYLE_TEXT = {
  rush: "Agressivo: ganha vantagem nos rounds, mas o jogo fica muito imprevisível — mais zebras, para os dois lados.",
  tatico: "Consistente: o time mais forte costuma vencer. Quase nenhuma zebra.",
  aim: "Equilibrado: um pequeno bônus nos duelos e imprevisibilidade moderada.",
};
export const NIVEL = { acima: "Acima da média", media: "Na média", abaixo: "Abaixo da média" };
export const ADVICE = {
  acima: "Seu time está acima da média: o Tático reduz o risco de zebra e deixa a força decidir.",
  media: "Seu time está na média: o Aim puro dá um bônus pequeno sem muito risco.",
  abaixo: "Seu time está abaixo da média: o Rush aumenta a imprevisibilidade e as chances de uma zebra.",
};

/* Força do time = média dos 5 jogadores (a mesma conta do motor). */
export function squadStrength(squad) {
  const sum = Object.values(squad).reduce((s, p) => s + p.forca, 0);
  return teamStrength(Math.round(sum / ROLES.length));
}

export function strengthHTML(st) {
  const pos = (v) => Math.max(0, Math.min(100, ((v - 60) / 40) * 100));     // escala 60–100
  return `<section class="strength" role="region" aria-label="Força do time">
    <div class="strength-row"><span class="strength-title">Força do time</span><span class="strength-num mono">${st.forca}</span></div>
    <div class="strength-bar" aria-hidden="true"><span class="fill" style="width:${pos(st.forca)}%"></span><span class="avg" style="left:${pos(st.media)}%"></span></div>
    <p class="strength-text"><b>${NIVEL[st.nivel]}</b> · média dos adversários ${st.media} · mais forte que ${st.percentil}% das lineups históricas</p>
  </section>`;
}

/* Números vêm do motor (STYLE_INFO): o que a tela promete é o que a simulação faz. */
export function styleCardHTML(style, suggested) {
  const { bias, variance } = STYLE_INFO[style];
  const risco = variance === 0 ? 1 : variance <= 0.04 ? 2 : 3;
  const rotulo = ["baixa", "média", "alta"][risco - 1];
  const bonus = bias === 0 ? "sem bônus nos rounds" : `+${bias * 2}% por round`;
  return `<b>${STYLE_NAME[style]}</b>${suggested ? '<span class="tag-sug">Sugerido</span>' : ""}<small>${STYLE_TEXT[style]}</small>
    <span class="style-meta"><span class="risk" role="img" aria-label="Imprevisibilidade ${rotulo}">${"●".repeat(risco)}${"○".repeat(3 - risco)}</span><span>${bonus}</span></span>`;
}

/* O elenco em poucas linhas: na hora de escolher o estilo as opções é que precisam aparecer, não a lista inteira. */
export function squadLineHTML(squad) {
  return `<div class="squad-line" aria-label="Seu elenco">${ROLES.filter((r) => squad[r]).map((r) => `<span><b>${esc(r)}</b> ${esc(squad[r].nick)}</span>`).join("")}</div>`;
}

/* Escolha do estilo no campeonato: o mesmo conteúdo da tela do time do jogo solo. */
export function styleChooserHTML(squad, selected) {
  const st = squadStrength(squad), sug = styleAdvice(st.nivel);
  return `${strengthHTML(st)}
    <p style="color:var(--dim); font-size:13px;">Escolha o estilo de jogo do seu time. Ele vale para toda a disputa e não dá para trocar depois:</p>
    <div class="style-opts" role="radiogroup" aria-label="Estilo de jogo">${STYLE_ORDER.map((s) =>
      `<div class="style-opt${s === selected ? " sel" : ""}" data-style="${s}" role="radio" aria-checked="${s === selected}" tabindex="0">${styleCardHTML(s, s === sug)}</div>`).join("")}</div>
    <p class="style-advice" role="status">${ADVICE[st.nivel]}</p>`;
}

/* Liga cliques/teclado das cartas de estilo dentro de `root`; `onSelect(style)` guarda a escolha. */
export function wireStyleChooser(root, onSelect) {
  const opts = [...root.querySelectorAll(".style-opt")];
  opts.forEach((o) => {
    const go = () => {
      opts.forEach((x) => { const on = x === o; x.classList.toggle("sel", on); x.setAttribute("aria-checked", on ? "true" : "false"); });
      onSelect(o.dataset.style);
    };
    o.addEventListener("click", go);
    o.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
}

/* ------------------------- Campanha do jogador (C3) ------------------------- */
const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;

/* Uma frase sobre onde o jogador está agora. `next` = próxima fase dos playoffs, se já classificado. */
export function campaignStatusText({ champion, eliminated, outAt, qualified, next, wins, losses }) {
  if (champion) return "🏆 Campeão do Major!";
  if (eliminated) return "❌ Eliminado na Primeira Fase";
  if (outAt) return outAt === "Final" ? "🥈 Vice-campeão" : `❌ Eliminado ${outAt === "Quartas" ? "nas quartas de final" : "na semifinal"}`;
  if (qualified) return next ? `✅ Classificado · nos playoffs: ${next}` : "✅ Classificado para os playoffs";
  return `Classifica com mais ${n(3 - wins, "vitória", "vitórias")} · elimina com mais ${n(3 - losses, "derrota", "derrotas")}`;
}

export function campaignPanelHTML({ record, journey, status }) {
  const swiss = journey.filter((j) => j.phase === "swiss");
  const track = swiss.map((j) => (j.won ? "🟩" : "🟥")).join("");
  const spoken = swiss.map((j) => (j.won ? "vitória" : "derrota")).join(", ");
  return `<section class="campaign" role="region" aria-label="Sua campanha">
    <div class="campaign-row"><span class="campaign-title">Sua campanha</span><span class="campaign-record mono">${esc(record)}</span></div>
    ${track ? `<div class="campaign-track" role="img" aria-label="Fase suíça: ${spoken}">${track}</div>` : ""}
    <p class="campaign-status">${esc(status)}</p>
  </section>`;
}

const STAGE_NAME = { qf: "Quartas de final", sf: "Semifinal", final: "Grande final" };

/* Campanha do jogador no campeonato, a partir dos eventos que o servidor manda (um item por jogo dele). */
export function cupJourney(events, slot) {
  const out = [];
  for (const ev of events ?? []) {
    if (!["swiss", "qf", "sf", "final"].includes(ev.type)) continue;
    const m = ev.matches.find((x) => x.a.human === slot || x.b.human === slot);
    if (!m) continue;                                         // não jogou nesta etapa
    const youA = m.a.human === slot;
    out.push({
      phase: ev.type, stage: ev.type === "swiss" ? `Rodada ${ev.round}` : STAGE_NAME[ev.type],
      opponent: (youA ? m.b : m.a).name, won: (m.winner === "A") === youA, bo: m.bo,
      score: youA ? `${m.winsA}×${m.winsB}` : `${m.winsB}×${m.winsA}`,
      maps: m.maps.map(([mp, a, b, ot]) => (youA ? [mp, a, b, ot] : [mp, b, a, ot])),
    });
  }
  return out;
}

export const NEXT_AFTER = { seed: "quartas de final", qf: "semifinal", sf: "grande final" };

/* ----------------------------- Resultado (C4) ----------------------------- */
/* O herói diz o que aconteceu COM QUEM e o que faltou. `lost` = último jogo perdido ({opponent, score}). */
export function heroOutcome({ perfeito, champion, cleanPlayoffs, outAt, wins, losses, lost }) {
  const who = lost ? `${lost.opponent} (${lost.score})` : "";
  if (perfeito) return { cls: "gold", title: "💎 MAJOR PERFEITO", sub: `Campeão sem perder um único mapa. Fase suíça ${wins}-${losses}.` };
  if (champion) return { cls: "gold", title: "🏆 CAMPEÃO DO MAJOR", sub: `Fase suíça ${wins}-${losses}${cleanPlayoffs ? " e invicto nos playoffs" : ""}. O troféu é seu.` };
  if (outAt === "Final") return { cls: "silver", title: "🥈 Vice-campeão", sub: `Perdeu a grande final para ${who}. Faltou um jogo para o título.` };
  if (outAt) return { cls: "", title: `Caiu ${outAt === "Quartas" ? "nas quartas de final" : "na semifinal"}`, sub: `Perdeu para ${who}. Chegar aos playoffs já é um bom time: tente outro estilo para ir além.` };
  const falta = wins === 2 ? "Ficou a 1 vitória dos playoffs." : wins === 1 ? "Faltaram 2 vitórias para os playoffs." : "Nenhuma vitória na fase suíça desta vez. Tente outro estilo ou outro time.";
  return { cls: "", title: "Eliminado na Primeira Fase", sub: `${wins}-${losses} no suíço. ${falta}${wins > 0 ? " Que tal tentar outro estilo?" : ""}` };
}

/* A jornada: um jogo por linha, em ordem. */
export function journeyHTML(journey) {
  if (!journey.length) return "";
  return `<div class="stage-label">Sua jornada</div><ol class="journey" aria-label="Sua jornada">${journey.map((j) =>
    `<li class="${j.won ? "win" : "loss"}"><span class="j-stage">${esc(j.stage)}</span><span class="j-opp">${esc(j.opponent)}</span><b class="j-score mono">${esc(j.score)}</b><span class="j-res" aria-label="${j.won ? "Vitória" : "Derrota"}">${j.won ? "V" : "D"}</span></li>`).join("")}</ol>`;
}

/* ------------------------------ Compartilhar ------------------------------ */
const hoje = () => { const d = new Date(); return [d.getDate(), d.getMonth() + 1, d.getFullYear()].map((x, i) => String(x).padStart(i < 2 ? 2 : 4, "0")).join("/"); };
const nicks = (lineup) => lineup.map((p) => p.nick).join(", ");
const linhaSuico = (w, l) => `Primeira Fase: ${"🟩".repeat(w)}${"🟥".repeat(l)} (${w}-${l})`;

/* Campeonato: `me` = {name, wins, losses, status, perfeito}; `lineup` = [{papel, nick}]. */
export function cupShare({ team, wins, losses, perfeito, champion, vice = false, playoffs, lineup, cleanPlayoffs, players }) {
  let abertura, desafio;
  if (perfeito) { abertura = `💎🏆 FIZ O MAJOR PERFEITO no campeonato com o ${team}!`; desafio = "Campeão sem perder UM único mapa. Duvido você repetir essa. 😏"; }
  else if (champion) { abertura = `🏆 Fui CAMPEÃO do campeonato com o ${team}!`; desafio = "Olha onde eu cheguei — será que você consegue fazer melhor? 👀"; }
  else if (vice) { abertura = `🥈 Fui VICE-CAMPEÃO do campeonato com o ${team}!`; desafio = "Perdi a final por pouco. Bora ver se você chega tão longe? 😤"; }
  else if (playoffs) { abertura = `🎯 Cheguei aos playoffs do campeonato com o ${team}.`; desafio = "Parei antes do título. Aposto que você não passa daí também. 😅"; }
  else { abertura = `❌ Meu ${team} caiu na Primeira Fase do campeonato (${wins}-${losses}).`; desafio = "Monta um time melhor que o meu, então. Duvido. 🤨"; }
  const text = `${abertura}\n${desafio}\n\n${linhaSuico(wins, losses)}\nLineUp: ${nicks(lineup)}\n\n🎮 Monte o seu: ${SITE_URL}`;
  const data = {
    nome: team, modo: `Campeonato · ${players} jogadores · ${hoje()}`, wins, losses, perfeito, isChampion: champion,
    resultadoCurto: perfeito ? "💎 MAJOR PERFEITO" : champion ? "🏆 CAMPEÃO" : vice ? "🥈 VICE-CAMPEÃO" : playoffs ? "PLAYOFFS" : "ELIMINADO NO SUÍÇO",
    resultadoSub: perfeito ? "campeão sem perder um único mapa" : champion ? (cleanPlayoffs ? "invicto nos playoffs" : "") : vice ? "perdeu a grande final" : playoffs ? "eliminado antes da final" : "",
    lineup,
  };
  return { text, data };
}

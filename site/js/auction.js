/* Telas do Leilão (cliente). Funções PURAS: recebem a visão que o servidor manda e devolvem HTML — o estado, a
 * conexão e os eventos ficam em cup.js. Todo texto dinâmico (nomes de jogadores e de times) passa por esc(). */
import { ROLES } from "./data.js";
import { esc, flagEmoji } from "./render.js";
import { styleChooserHTML, squadLineHTML, STYLE_NAME } from "./parts.js";

/* Valida o lance digitado (texto) contra o máximo que o servidor informou. O servidor valida de novo: isto só dá
 * o motivo na hora e liga/desliga o botão. */
export function checkBid(raw, max) {
  const t = String(raw ?? "").trim();
  if (t === "") return { ok: false, msg: "" };
  if (!/^\d+$/.test(t)) return { ok: false, msg: "Digite um número inteiro de moedas (1 ou mais)." };
  const n = Number(t);
  if (n < 1) return { ok: false, msg: "O lance mínimo é 1 moeda (ou passe)." };
  if (n > max) return { ok: false, msg: `Lance máximo agora: ${max} (você precisa reservar 1 moeda para cada vaga que falta).` };
  return { ok: true, amount: n, msg: "" };
}

/* Muda só quando a tela precisa ser refeita (outro leilão, outra etapa, o meu lance...). Enquanto a chave é a
 * mesma, uma atualização do servidor só troca o quadro dos jogadores: quem está digitando não perde nada. */
export const auctionKey = (v) =>
  [v.idx, v.step, v.you.canBid, v.you.submitted, v.you.bid, v.last?.winner, v.last?.price, Object.keys(v.you.squad).length, v.you.coins].join("|");

const slotText = (p) => `${flagEmoji(p.pais)} ${esc(p.nick)}`;

/* O quadro de jogadores: moedas, vagas e o que cada um está fazendo (nunca o valor do lance). */
export function boardHTML(v) {
  const estado = (p) => {
    if (!p.connected) return "⚠️ offline";
    if (v.phase === "style") return p.ready ? "pronto ✅" : "escolhendo o estilo…";
    if (v.step === "bidding") return !p.eligible ? `já tem ${esc(v.lot.role)}` : p.submitted ? "enviou ✓" : "pensando…";
    return "";
  };
  return `<ul class="auction-board" aria-label="Jogadores">${v.players.map((p, i) => `
    <li><span class="pn">${esc(p.name)}${i === v.you.slot ? " (você)" : ""}${p.host ? ' <span class="badge Underdog">dono</span>' : ""}</span>
      <span class="pc">🪙 ${p.coins} · ${p.filled}/${ROLES.length}</span><span class="ps">${estado(p)}</span></li>`).join("")}</ul>`;
}

function squadHTML(v) {
  const sq = v.you.squad;
  return `<ol class="auction-squad" aria-label="Seu elenco">${ROLES.map((r) => {
    const p = sq[r];
    return p ? `<li class="filled"><b>${esc(r)}</b><span class="nm">${slotText(p)}</span><small>${p.price > 0 ? `🪙 ${p.price}` : "de graça"}</small></li>`
             : `<li><b>${esc(r)}</b><span class="nm dim">—</span></li>`;
  }).join("")}</ol>`;
}

function headHTML(v) {
  const urgente = v.step === "bidding" && v.msLeft <= 5000;
  return `<div class="auction-head"><span class="auction-count">Leilão ${v.idx} de ${v.total}</span>
    <span class="auction-timer${urgente ? " urgent" : ""}" id="auction-timer" role="timer">${Math.ceil(v.msLeft / 1000)}s</span></div>
    <div class="timer-bar${urgente ? " urgent" : ""}" aria-hidden="true"><span id="timer-fill"></span></div>`;
}

function lotHTML(v) {
  const l = v.lot, entra = v.step === "bidding" && !v.you.submitted;       // só o lote novo desliza; enviar o lance não repete
  return `<section class="lot-card${entra ? " enter" : ""}" aria-label="Jogador em leilão">
    <div><h3>${slotText(l)}</h3>
      <div class="lot-meta"><span class="role-pill">${esc(l.role)}</span> ${esc(l.team)} · ${l.ano}</div></div>
    <span class="lot-rating" aria-label="Rating ${l.forca}">${l.forca}</span></section>`;
}

function controlsHTML(v, bidText) {
  const y = v.you;
  if (y.submitted) return `<p class="bid-state">${y.bid > 0 ? `Lance enviado: ${y.bid} moedas. Aguardando os outros…` : "Você passou neste leilão. Aguardando os outros…"}</p>`;
  if (!y.canBid) return `<p class="bid-state">Você já tem ${esc(v.lot.role)} no elenco: acompanhe este leilão.</p>`;
  return `<div class="bid-box" id="bid-box" data-max="${y.maxBid}">
    <label for="bid-input" class="bid-label">Seu lance (moedas)</label>
    <div class="bid-row"><input id="bid-input" type="text" inputmode="numeric" autocomplete="off" placeholder="1 a ${y.maxBid}" value="${esc(bidText)}">
      <button class="primary" id="bid-send" type="button" disabled>Dar lance</button></div>
    <div class="bid-chips"><button class="secondary" type="button" data-add="5">+5</button><button class="secondary" type="button" data-add="10">+10</button>
      <button class="secondary" type="button" data-add="25">+25</button><button class="secondary" type="button" data-bid-max>Máx (${y.maxBid})</button></div>
    <p class="bid-msg" id="bid-msg" role="alert"></p>
    <button class="secondary" id="bid-pass" type="button">Passar</button></div>`;
}

function revealHTML(v) {
  const l = v.last;
  const frase = l.winner !== null ? `${esc(v.players[l.winner].name)} levou ${esc(l.lot.nick)} por ${l.price} moedas`
                                  : `Ninguém levou ${esc(l.lot.nick)}: sem lances, ele vai para os descartados`;
  const empate = l.tie === "speed" ? `Empate em ${l.price}: ${esc(v.players[l.winner].name)} levou por ter dado o lance primeiro.`
               : l.tie === "draw" ? `Empate em ${l.price} no mesmo instante: decidido por sorteio.` : "";
  return `<section class="reveal" role="region" aria-label="Revelação"><p class="reveal-win">${frase}</p>${empate ? `<p class="reveal-tie">${empate}</p>` : ""}
    <ul class="reveal-bids" aria-label="Lances revelados">${l.bids.map((b) => `<li class="${b.slot === l.winner ? "win" : ""}"><span>${esc(b.name)}</span><b>${b.amount > 0 ? `🪙 ${b.amount}` : "passou"}</b></li>`).join("")}</ul></section>`;
}

/* O leilão aberto (e a revelação). `leave` = HTML do botão de sair. */
export function auctionHTML(v, bidText, leave) {
  const resta = ROLES.map((r) => `${r} ${v.remaining[r]}`).join(" · ");
  const last = v.step === "bidding" && v.last
    ? `<p class="last-line">Último: ${v.last.winner !== null ? `${esc(v.players[v.last.winner].name)} levou ${esc(v.last.lot.nick)} por ${v.last.price}` : `ninguém levou ${esc(v.last.lot.nick)}`}</p>` : "";
  const vagas = Object.keys(v.you.squad).length;
  return `<div class="auction" id="auction-root">${headHTML(v)}
    <div class="auction-layout">
      <div class="auction-main">${lotHTML(v)}<p class="remaining">Ainda vão aparecer: ${resta}</p>
        <div id="auction-controls">${v.step === "reveal" && v.last ? revealHTML(v) : controlsHTML(v, bidText)}</div>${last}</div>
      <div class="auction-side">
        <div class="stage-label">Seu time</div><p class="me-line">🪙 ${v.you.coins} moedas · ${vagas}/${ROLES.length} vagas</p>${squadHTML(v)}
        <div class="stage-label">Jogadores</div><div id="auction-board">${boardHTML(v)}</div></div></div>
    ${leave}</div>`;
}

/* Depois do leilão: o elenco fechado, as vagas completadas de graça e a escolha do estilo (como no solo). */
export function auctionStyleHTML(v, pendingStyle, leave) {
  const y = v.you, ninguemFalta = v.players.every((p) => p.ready);
  const fills = v.fills.length
    ? `<section class="card"><b>Vagas completadas de graça</b> (entre os jogadores descartados):<ul class="fills">${v.fills.map((f) => `<li>${esc(v.players[f.slot].name)}: ${esc(f.role)} — ${esc(f.nick)}</li>`).join("")}</ul></section>` : "";
  const force = y.canControl && !ninguemFalta ? `<button class="secondary" id="cup-force" type="button">⏩ Completar automaticamente quem faltar</button>` : "";
  const escolha = y.style
    ? `<p style="color:var(--dim);">Estilo <b>${esc(STYLE_NAME[y.style])}</b> escolhido. Aguardando os outros jogadores…</p>${force}${leave}`
    : `<div id="cup-style">${styleChooserHTML(y.squad, pendingStyle)}</div>${fills}<div class="stage-label">Jogadores</div>${boardHTML(v)}${force}
       <div class="action-bar"><button class="primary" id="cup-confirm" type="button">Confirmar estilo →</button>${leave}</div>`;
  return `<div class="stage-label">Leilão encerrado</div>${squadLineHTML(y.squad)}${y.style ? fills + boardHTML(v) : ""}${escolha}`;
}

/* Helpers de HTML compartilhados (jogo livre, desafio e campeonato).
 * REGRA: todo texto dinâmico passa por esc(); nomes de outros jogadores são dado não confiável. */
import { LINEUPS, ROLES } from "./data.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"'`]/g, (c) => ESC[c]);

export function flagEmoji(code) {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1F1E6 + c.charCodeAt(0) - 65));
}

export function slotHTML(role, s, withRating = true) {
  return s
    ? `<div class="role">${esc(role)}</div><div class="nick"><span class="flag">${flagEmoji(s.pais)}</span>${esc(s.nick)}</div><div class="team">${esc(s.team)}${withRating ? ` · <span class="rating">${Number(s.forca)}</span>` : ""}</div>`
    : `<div class="role">${esc(role)}</div><div class="nick" style="color:var(--dim)">vazio</div>`;
}

/* Elenco do draft: só quem já foi escalado vira linha; o que falta vira UMA linha compacta de papéis. */
export function draftSlotsHTML(squad) {
  const missing = ROLES.filter((r) => !squad[r]);
  return ROLES.filter((r) => squad[r]).map((r) => `<div class="slot filled">${slotHTML(r, squad[r])}</div>`).join("") +
    (missing.length ? `<div class="slots-missing" role="status">Faltam: ${missing.map((r) => `<span class="role-pill">${esc(r)}</span>`).join("")}</div>` : "");
}

export const lineupById = (id) => LINEUPS.find((l) => l.id === id);

/* Cards de lineup oferecidos. `squad` = role -> {nick,...}; jogadores sem vaga ou já usados ficam desabilitados. */
export function offersHTML(lineups, squad) {
  const nicks = new Set(Object.values(squad).map((s) => s.nick));
  let anyBlocked = false;
  const cards = lineups.map((lu) => `
    <div class="lineup-card">
      <div class="lname">${esc(lu.time)} <span class="badge ${esc(lu.raridade)}">${esc(lu.raridade)}</span></div>
      <div class="lmeta">${esc(lu.evento)} · média <span class="rating">${lu.forca}</span></div>
      <div class="players">${lu.jogadores.map((p) => {
        const roleTaken = !!squad[p.papel], taken = roleTaken || nicks.has(p.nick);
        // jogador apagado precisa dizer POR QUÊ (tooltip + legenda abaixo; o toque não tem hover)
        const why = roleTaken ? `Papel ${p.papel} já preenchido` : nicks.has(p.nick) ? "Jogador já escalado" : "";
        if (taken) anyBlocked = true;
        return `<button type="button" class="player-chip${taken ? " disabled" : ""}" ${taken ? `disabled title="${esc(why)}"` : ""} data-lineup="${esc(lu.id)}" data-nick="${esc(p.nick)}" data-role="${esc(p.papel)}">
          <b><span class="flag">${flagEmoji(p.pais)}</span>${esc(p.nick)}</b><small>${esc(p.papel)} · <span class="rating">${p.forca}</span></small></button>`;
      }).join("")}</div>
    </div>`).join("");
  return cards + (anyBlocked ? `<p class="offers-legend">Jogadores apagados: papel já preenchido ou jogador já escalado.</p>` : "");
}

/* Cliente da API do Desafio do Dia. Tudo opcional: se a API não existir
 * (deploy só estático) ou falhar, o jogo livre continua igual. */
const API = "/api/v1/daily";
let memoryId = null;

export async function fetchDaily() {
  try {
    const r = await fetch(API, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    if (!Number.isInteger(j.seed) || !/^\d{4}-\d{2}-\d{2}$/.test(j.day)) return null;
    return j;
  } catch { return null; }
}

/* Identidade anônima: UUID aleatório do navegador. Não é conta e não carrega dado pessoal. */
export function playerId() {
  try {
    let id = localStorage.getItem("ml_player_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("ml_player_id", id); }
    return id;
  } catch { return (memoryId ??= crypto.randomUUID()); }
}

export function playedToday(day) { try { return localStorage.getItem("ml_played") === day; } catch { return false; } }
export function markPlayed(day) { try { localStorage.setItem("ml_played", day); } catch { /* sem storage: servidor ainda bloqueia (409) */ } }

/* Envia só as ESCOLHAS; o servidor re-simula e decide o resultado. */
export async function submitEntry({ teamName, style, draft }) {
  try {
    const r = await fetch(`${API}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ player_id: playerId(), team_name: teamName, style, draft }),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, rank: j.rank, entry: j.entry } : { ok: false, status: r.status, detail: j.detail ?? "Erro ao enviar." };
  } catch { return { ok: false, status: 0, detail: "Sem conexão com o servidor." }; }
}

/* `fresh`: ignora o cache do navegador (a API deixa a resposta 30 s em cache; quem acabou de enviar quer se ver já). */
export async function fetchBoard(day, limit = 10, { fresh = false } = {}) {
  try {
    const r = await fetch(`${API}/leaderboard?day=${encodeURIComponent(day)}&limit=${limit}`, { headers: { accept: "application/json" }, ...(fresh ? { cache: "no-store" } : {}) });
    return r.ok ? (await r.json()).data : null;
  } catch { return null; }
}

const TIER = { 4: "💎 Perfeito", 3: "🏆 Campeão", 2: "Playoffs", 1: "Suíço" };

/* Itens compactos do Top 5 da home (uma linha cada). `esc`: nomes de outros jogadores são dado não confiável. */
export function topFiveHTML(rows, esc) {
  return rows.slice(0, 5).map((r) => `<li><b class="mono">#${r.rank}</b><span class="t5-name">${esc(r.team_name)}</span><small>${esc(TIER[r.tier] ?? "")} · ${r.wins}-${r.losses}</small></li>`).join("");
}

/* `esc` vem do ui.js: nomes de outros jogadores são dado não confiável. */
export function boardHTML(rows, esc) {
  if (!rows || !rows.length) return `<p style="color:var(--dim); font-size:13px;">Ainda ninguém no ranking de hoje.</p>`;
  return rows.map((r) => `<div class="card row" style="padding:8px 12px;">
    <span><b class="mono">#${r.rank}</b> ${esc(r.team_name)}
      <small style="color:var(--dim);"> · ${esc(TIER[r.tier] ?? "")} · ${r.wins}-${r.losses} · força ${r.forca}</small></span></div>`).join("");
}

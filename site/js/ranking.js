/* Página do ranking completo do Desafio diário (o "Ver mais" da home). Só leitura: pede o dia e as 50 primeiras posições. */
import { fetchDaily, fetchBoard } from "./daily.js";
import { esc } from "./render.js";

const TIER = { 4: "💎 Perfeito", 3: "🏆 Campeão", 2: "Playoffs", 1: "Suíço" };
const $ = (id) => document.getElementById(id);

const linha = (r) => `<li><b class="mono">#${r.rank}</b><span class="rk-name">${esc(r.team_name)}</span>
  <small>${esc(TIER[r.tier] ?? "")} · ${r.wins}-${r.losses} · força ${r.forca}</small></li>`;

async function init() {
  const daily = await fetchDaily();
  if (!daily) { $("rk-day").textContent = ""; $("rk-msg").textContent = "Não foi possível carregar o ranking agora. Tente de novo em instantes."; return; }
  const [ano, mes, dia] = daily.day.split("-");
  $("rk-day").textContent = `Dia ${dia}/${mes}/${ano} · todos jogam o mesmo baralho`;
  const rows = await fetchBoard(daily.day, 50, { fresh: true });
  if (rows === null) { $("rk-msg").textContent = "Não foi possível carregar o ranking agora. Tente de novo em instantes."; return; }
  if (!rows.length) { $("rk-msg").textContent = "Ainda ninguém no ranking de hoje. Seja o primeiro!"; return; }
  $("rk-list").innerHTML = rows.map(linha).join("");
}
init();

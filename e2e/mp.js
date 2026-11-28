/* Servidor de mentira para o campeonato: o Playwright entra na sala pelo link de convite
 * e o WebSocket responde com o estado que o teste quer ver (o cliente é só um espelho do servidor). */
import { LINEUPS } from "../site/js/data.js";
export const ROLES = ["AWP", "IGL", "Entry", "Support", "Rifler"];
export const OFFERS = LINEUPS.slice(0, 3).map((l) => l.id);          // 3 lineups reais para o draft aparecer

export const elenco = (forca, prefixo = "Jog") =>
  Object.fromEntries(ROLES.map((r, i) => [r, { nick: `${prefixo}${i + 1}`, pais: "br", forca, team: "Time X", lineupId: `L${i}` }]));

/* Elenco com só os primeiros `n` papéis preenchidos (draft em andamento). */
export const parcial = (forca, n, prefixo = "Jog") => Object.fromEntries(Object.entries(elenco(forca, prefixo)).slice(0, n));

/* ---------------------------- campeonato ---------------------------- */
const bot = (i) => ({ name: `Bot ${i}`, human: null, forca: 80 });
const eu = { name: "Meu Time", human: 0, forca: 90 };
const rival = { name: "Rival FC", human: 1, forca: 88 };
const PLACAR = { V: [2, 1], D: [1, 2], VF: [3, 1], DF: [1, 3] };

function partida(a, b, [wa, wb], bo) {
  const maps = [];
  for (let i = 0; i < wa + wb; i++) maps.push([["Mirage", "Inferno", "Nuke", "Ancient", "Anubis"][i], i < wa ? 13 : 8, i < wa ? 8 : 13, 0]);
  return { a, b, bo, winsA: wa, winsB: wb, winner: wa > wb ? "A" : "B", maps };
}

/* script: "V"/"D" = jogos do suíço; "qf:V", "sf:D", "final:VF"… = playoffs. O adversário do jogador é "Bot N". */
export function eventos(script) {
  const ev = []; let rodada = 0, semeado = false, n = 0;
  const outros = (k) => Array.from({ length: 7 }, (_, i) => partida(bot(100 + k * 10 + i), bot(200 + k * 10 + i), PLACAR.V, 3));
  for (const s of script) {
    if (s === "V" || s === "D") {
      rodada++; n++;
      ev.push({ type: "swiss", round: rodada, matches: [partida(eu, bot(n), PLACAR[s], 3), ...outros(n)] });
    } else {
      if (!semeado) { semeado = true; ev.push({ type: "seed", seeds: [eu, rival, ...Array.from({ length: 6 }, (_, i) => bot(300 + i))] }); }
      const [fase, r] = s.split(":"); n++;
      ev.push({ type: fase, round: null, matches: [partida(eu, bot(n), PLACAR[r], fase === "final" ? 5 : 3), ...outros(n).slice(0, fase === "qf" ? 3 : 0)] });
    }
  }
  return ev;
}

export function campeonato({ phase = "running", script = ["V"], status = "active", wins = 1, losses = 0, perfeito = false,
  champion = null, host = true, forca = 90, style = null, draftDone = true, picks = 5 } = {}) {
  const teams = [{ ...eu, wins, losses, status }, { ...rival, wins: 0, losses: 1, status: "active" }, ...Array.from({ length: 14 }, (_, i) => ({ ...bot(i + 1), wins: 0, losses: 0, status: "active" }))];
  const v = {
    v: 1, kind: "cup", phase, code: "ABC234", max_players: 8, min_players: 2,
    you: { slot: 0, name: "Meu Time", host, canControl: host, offers: phase === "draft" && !draftDone ? OFFERS : [], refreshesLeft: 3, squad: parcial(forca, picks), draftDone, canUndo: false, style },
    players: [{ name: "Meu Time", host: true, connected: true, picks: 5, ready: true }, { name: "Rival FC", host: false, connected: true, picks: 5, ready: true }],
    teams: null, events: [], result: null,
  };
  if (phase === "running" || phase === "done") { v.teams = teams; v.events = eventos(script); }
  if (phase === "done") {
    const camp = champion ?? (status === "champion" ? eu : { name: "Bot 9", human: null, forca: 85 });
    v.result = {
      champion: camp,
      humans: [
        { slot: 0, name: "Meu Time", wins, losses, status, perfeito, squad: Object.fromEntries(ROLES.map((r, i) => [r, `Jog${i + 1}`])) },
        { slot: 1, name: "Rival FC", wins: 1, losses: 2, status: "eliminated", perfeito: false, squad: Object.fromEntries(ROLES.map((r, i) => [r, `Riv${i + 1}`])) },
      ],
      mvp: { nick: "Jog1", team: "Meu Time", kills: 120, deaths: 80 },
    };
  }
  return v;
}

/* Entra na sala pelo link de convite; o servidor de mentira devolve `view`. `enviadas` recebe o que o cliente mandar. */
export async function abrirSala(page, { view, enviadas = [] }) {
  await page.addInitScript(() => {                           // captura o compartilhamento (sem abrir a folha do sistema)
    window.__shared = null;
    const definir = (nome, valor) => Object.defineProperty(navigator, nome, { value: valor, configurable: true, writable: true });   // vale mesmo se o navegador já tiver (ou não) a API
    definir("canShare", () => false);
    definir("share", async (d) => { window.__shared = d; });
  });
  await page.route("**/api/v1/cups/ABC234", (r) => r.fulfill({ json: { exists: true } }));
  await page.routeWebSocket("**/api/v1/cups/ABC234/ws", (ws) => {
    ws.onMessage((m) => {
      const msg = JSON.parse(String(m));
      if (msg.t === "hello") {
        ws.send(JSON.stringify({ t: "welcome", v: 1, slot: 0, token: "a".repeat(32), code: "ABC234" }));
        ws.send(JSON.stringify({ t: "state", ...view }));
      } else enviadas.push(msg);
    });
  });
  await page.goto("/?campeonato=ABC234");
  await page.getByLabel(/Seu nome de time/).fill("Meu Time");
  await page.getByRole("button", { name: /^Entrar no/ }).click();
}

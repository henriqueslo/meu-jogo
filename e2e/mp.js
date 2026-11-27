/* Servidor de mentira para o duelo e o campeonato: o Playwright entra na sala pelo link de convite
 * e o WebSocket responde com o estado que o teste quer ver (o cliente é só um espelho do servidor). */
export const ROLES = ["AWP", "IGL", "Entry", "Support", "Rifler"];

export const elenco = (forca, prefixo = "Jog") =>
  Object.fromEntries(ROLES.map((r, i) => [r, { nick: `${prefixo}${i + 1}`, pais: "br", forca, team: "Time X", lineupId: `L${i}` }]));

/* ------------------------------ duelo ------------------------------ */
export function duelo({ phase = "done", won = true, style = "tatico", forca = 90, draftDone = true, rematch = false } = {}) {
  const lado = (nome, f, est, pref) => ({
    name: nome, style: est,
    squad: Object.fromEntries(ROLES.map((r, i) => [r, { nick: `${pref}${i + 1}`, pais: "br", team: "Time X", forca: f }])),
  });
  const base = {
    v: 1, phase, code: "ABC234", round: 0, best_of: 3,
    you: { slot: 0, name: "Meu Time", offers: [], refreshesLeft: 0, squad: elenco(forca), draftDone, canUndo: false, style: phase === "done" ? style : null, rematch },
    opp: { name: "Rival FC", connected: true, picks: 5, styleChosen: phase === "done", rematch: false },
    result: null,
  };
  if (phase === "done") {
    base.result = {
      winner: won ? "A" : "B", winsA: won ? 2 : 1, winsB: won ? 1 : 2,
      maps: won ? [{ map: "Mirage", a: 13, b: 9, ot: 0 }, { map: "Inferno", a: 10, b: 13, ot: 0 }, { map: "Nuke", a: 13, b: 11, ot: 0 }]
                : [{ map: "Mirage", a: 9, b: 13, ot: 0 }, { map: "Inferno", a: 13, b: 10, ot: 0 }, { map: "Nuke", a: 8, b: 13, ot: 0 }],
      forca: { A: forca, B: 88 }, a: lado("Meu Time", forca, style, "Jog"), b: lado("Rival FC", 88, "rush", "Riv"), stats: [],
    };
  }
  return base;
}

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
  champion = null, host = true, forca = 90, style = null, draftDone = true } = {}) {
  const teams = [{ ...eu, wins, losses, status }, { ...rival, wins: 0, losses: 1, status: "active" }, ...Array.from({ length: 14 }, (_, i) => ({ ...bot(i + 1), wins: 0, losses: 0, status: "active" }))];
  const v = {
    v: 1, kind: "cup", phase, code: "ABC234", max_players: 8, min_players: 2,
    you: { slot: 0, name: "Meu Time", host, canControl: host, offers: [], refreshesLeft: 0, squad: elenco(forca), draftDone, canUndo: false, style },
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
export async function abrirSala(page, { kind = "rooms", view, enviadas = [] }) {
  await page.addInitScript(() => {                           // captura o compartilhamento (sem abrir a folha do sistema)
    window.__shared = null;
    navigator.canShare = () => false;
    navigator.share = async (d) => { window.__shared = d; };
  });
  await page.route(`**/api/v1/${kind}/ABC234`, (r) => r.fulfill({ json: { exists: true } }));
  await page.routeWebSocket(new RegExp(`/api/v1/${kind}/ABC234/ws`), (ws) => {
    ws.onMessage((m) => {
      const msg = JSON.parse(String(m));
      if (msg.t === "hello") {
        ws.send(JSON.stringify({ t: "welcome", v: 1, slot: 0, token: "a".repeat(32), code: "ABC234" }));
        ws.send(JSON.stringify({ t: "state", ...view }));
      } else enviadas.push(msg);
    });
  });
  await page.goto(kind === "rooms" ? "/?duelo=ABC234" : "/?campeonato=ABC234");
  await page.getByLabel(/Seu nome de time/).fill("Meu Time");
  await page.getByRole("button", { name: /^Entrar no/ }).click();
}

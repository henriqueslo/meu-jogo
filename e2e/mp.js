/* Servidor de mentira para o campeonato e o leilão: o Playwright entra na sala pelo link de convite
 * e o WebSocket responde com o estado que o teste quer ver (o cliente é só um espelho do servidor). */
import { expect } from "@playwright/test";
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

/* ------------------------------ leilão ------------------------------ */
const LOTE = { id: "navi-2021|s1mple", lineupId: "navi-2021", nick: "s1mple", role: "AWP", pais: "UA", team: "Natus Vincere", ano: 2021, forca: 99 };
const RESTAM = { AWP: 3, IGL: 2, Entry: 4, Support: 2, Rifler: 1 };
export const comprado = (nick, price, forca = 85) => ({ nick, pais: "BR", forca, team: "Time X", ano: 2020, lineupId: "x", price });
const nomes = ["Meu Time", "Rival FC", "Terceiro FC"];

/* Visão do leilão como o servidor a manda. `squad`: o que EU já tenho ({ papel: comprado() }). */
export function leilao({
  phase = "auction", step = "bidding", msLeft = 15000, idx = 12, total = 50, coins = 100, squad = {}, canBid = true, why = null,
  submitted = false, bid = null, last = null, lot = LOTE, host = true, jogadores = 3, fills = [], style = null, maxBid,
} = {}) {
  const vagas = ROLES.length - Object.keys(squad).length;
  const emAndamento = phase === "auction";
  const players = nomes.slice(0, jogadores).map((name, i) => ({
    name, host: i === 0, connected: true, coins: i === 0 ? coins : 72 - i * 10, filled: i === 0 ? Object.keys(squad).length : 2,
    squad: i === 0 ? squad : { AWP: comprado("Zywoo", 30, 97) }, submitted: emAndamento && step === "bidding" ? (i === 0 ? submitted : i === 1) : false,
    eligible: emAndamento && step === "bidding", ready: phase === "style" && i === 1,
  }));
  return {
    v: 1, kind: "auction", phase, code: "ABC234", min_players: 2, max_players: 5,
    step: emAndamento ? step : null, msLeft: emAndamento ? msLeft : 0,
    lot: emAndamento ? lot : null, idx: emAndamento ? idx : phase === "lobby" ? 0 : total, total: phase === "lobby" ? 0 : total,
    remaining: RESTAM, last, fills,
    you: {
      slot: 0, name: "Meu Time", host, canControl: host, style, coins, squad,
      maxBid: emAndamento && step === "bidding" ? (maxBid ?? coins - (vagas - 1)) : 0,
      canBid: emAndamento && step === "bidding" && canBid, why: emAndamento && step === "bidding" ? why : null,
      submitted: emAndamento && step === "bidding" ? submitted : false, bid: emAndamento && step === "bidding" ? bid : null,
    },
    players, teams: null, events: [], result: null,
  };
}

export const REVELACAO = {
  lot: LOTE, winner: 1, price: 41,
  bids: [{ slot: 0, name: "Meu Time", amount: 30 }, { slot: 1, name: "Rival FC", amount: 41 }, { slot: 2, name: "Terceiro FC", amount: 0 }],
};

/* Elenco completo (fase de estilo): 5 papéis, cada um com o preço pago (0 = completado de graça). */
export const elencoLeilao = (forca = 90) => Object.fromEntries(ROLES.map((r, i) => [r, comprado(`Jog${i + 1}`, i < 3 ? 20 + i : 0, forca)]));

/* Entra na sala pelo link de convite; o servidor de mentira devolve `view`. `enviadas` recebe o que o cliente mandar.
 * Devolve { enviar(view) } para o "servidor" empurrar um estado novo depois. */
export async function abrirSala(page, { view, enviadas = [], kind = "cups" }) {
  let sala = null;
  await page.addInitScript(() => {                           // captura o compartilhamento (sem abrir a folha do sistema)
    window.__shared = null;
    const definir = (nome, valor) => Object.defineProperty(navigator, nome, { value: valor, configurable: true, writable: true });   // vale mesmo se o navegador já tiver (ou não) a API
    definir("canShare", () => false);
    definir("share", async (d) => { window.__shared = d; });
  });
  await page.route(`**/api/v1/${kind}/ABC234`, (r) => r.fulfill({ json: { exists: true } }));
  await page.routeWebSocket(`**/api/v1/${kind}/ABC234/ws`, (ws) => {
    sala = ws;
    ws.onMessage((m) => {
      const msg = JSON.parse(String(m));
      if (msg.t === "hello") {
        ws.send(JSON.stringify({ t: "welcome", v: 1, slot: 0, token: "a".repeat(32), code: "ABC234" }));
        ws.send(JSON.stringify({ t: "state", ...view }));
      } else enviadas.push(msg);
    });
  });
  await page.goto(kind === "auctions" ? "/?leilao=ABC234" : "/?campeonato=ABC234");
  await page.getByLabel(/Seu nome de time/).fill("Meu Time");
  await page.getByRole("button", { name: /^Entrar no/ }).click();
  return { enviar: (v) => sala.send(JSON.stringify({ t: "state", ...v })) };
}

/* Clica em Compartilhar e espera o texto que o navegador teria compartilhado. Se não vier, a falha diz o que o botão
 * mostra e quais erros a página teve (o compartilhar já falhou uma vez só no CI). */
export async function textoCompartilhado(page) {
  const botao = page.getByRole("button", { name: /Compartilhar/ });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  await botao.click();
  try {
    await expect.poll(() => page.evaluate(() => window.__shared), { timeout: 10000 }).not.toBeNull();
  } catch (e) {
    throw new Error(`${e.message}\nrótulo do botão: ${JSON.stringify(await botao.innerText().catch(() => "?"))}\nerros da página: ${JSON.stringify(erros)}`);
  }
  return page.evaluate(() => window.__shared);
}

/* Leilão cancelado porque alguém saiu: o que o servidor manda a todos. */
export const cancelado = ({ slot = 2, name = "Time C", why = "offline", voce = 0 } = {}) => ({
  v: 1, kind: "auction", phase: "cancelled", code: "ABC234", cancelled: { slot, name, why }, you: { slot: voce },
});

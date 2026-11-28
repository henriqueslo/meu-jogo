/* Motor do jogo — PURO e DETERMINÍSTICO.
 *
 * Sem DOM, sem estado global, sem Math.random: todo o aleatório vem de um PRNG
 * seedado que pertence à instância do torneio. Isso permite:
 *  - rodar no navegador (hoje) e num Cloudflare Worker / Durable Object (multiplayer);
 *  - repetir qualquer partida a partir de (seed + escolhas) — base de ranking
 *    e de replay/anti-cheat: o servidor re-simula e compara o resultado;
 *  - várias salas simultâneas no mesmo processo (nada é compartilhado).
 */
import { LINEUPS, ROLES, MAPS } from "./data.js";

export const MAX_REFRESHES = 3;
export const STYLES = ["rush", "tatico", "aim"];
export const TEAM_NAME_MAX = 24;

/* ---------------------------- PRNG seedável ---------------------------- */
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Seed de 32 bits vinda de CSPRNG (navegador e Workers têm crypto global). */
export function newSeed() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}

/* Dois streams independentes: o nº de atualizações do draft não altera a simulação. */
export function createStreams(seed) {
  return {
    seed: seed >>> 0,
    draftRand: mulberry32(seed >>> 0),
    simRand: mulberry32((seed ^ 0x9E3779B9) >>> 0),
  };
}

/* ------------------------------ Validação ------------------------------ */
/* Allowlist (letras LATINAS com acento, dígitos ASCII, espaço, . _ -). Vale como validação de
 * entrada; a SAÍDA em HTML continua precisando de escape (ui.js). Só alfabeto latino de propósito:
 * a moderação (moderation.js) não consegue cobrir cirílico/CJK/homóglifos, então eles nem entram. */
export function sanitizeTeamName(raw) {
  if (typeof raw !== "string") return ""; // JSON vindo da rede pode ser objeto/número/null
  return raw
    .normalize("NFKC")
    .replace(/[^\p{Script=Latin}0-9 ._-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TEAM_NAME_MAX);
}

const LINEUP_BY_ID = new Map(LINEUPS.map((l) => [l.id, l]));

/* Reconstrói o elenco a partir de IDs, usando SÓ os dados do servidor/engine.
 * O cliente nunca informa rating: informa (lineupId, nick) e nós buscamos o valor.
 * picks = { AWP:{lineupId,nick}, IGL:{...}, Entry, Support, Rifler } */
export function resolveSquad(picks, { partial = false } = {}) {
  if (!picks || typeof picks !== "object") throw new Error("squad inválido");
  const squad = {};
  const nicks = new Set();
  for (const role of ROLES) {
    const p = picks[role];
    if (!p && partial) continue; // draft em andamento
    if (!p || typeof p.lineupId !== "string" || typeof p.nick !== "string") {
      throw new Error("vaga ausente: " + role);
    }
    const lu = LINEUP_BY_ID.get(p.lineupId);
    const pl = lu && lu.jogadores.find((j) => j.nick === p.nick && j.papel === role);
    if (!pl) throw new Error("jogador inválido para " + role);
    if (nicks.has(pl.nick)) throw new Error("jogador repetido: " + pl.nick);
    nicks.add(pl.nick);
    squad[role] = { nick: pl.nick, pais: pl.pais, forca: pl.forca, team: lu.time, ano: lu.ano, lineupId: lu.id };
  }
  return squad;
}

/* -------------------------------- Draft -------------------------------- */
/* 3 lineups de times distintos por leva.
 * Lineups reais não têm os 5 papéis (ex.: 2 Riflers, sem AWP). Por isso a leva
 * GARANTE ao menos 1 jogador escalável (papel aberto e nick ainda não usado);
 * sem isso, o jogador podia travar na última vaga depois de gastar as atualizações.
 * `taken` = { roles:Set, nicks:Set } do que já foi escalado. */
export function pickRandomLineups(draftRand, taken = { roles: new Set(), nicks: new Set() }) {
  const eligible = (lu) => lu.jogadores.some((p) => !taken.roles.has(p.papel) && !taken.nicks.has(p.nick));
  const shuffled = shuffle(LINEUPS, draftRand);
  const picks = [];
  const used = new Set();
  for (const lu of shuffled) {
    if (picks.length >= 3) break;
    if (used.has(lu.time)) continue;
    picks.push(lu);
    used.add(lu.time);
  }
  if (!picks.some(eligible)) {
    const fix = shuffled.find((lu) => eligible(lu) && !used.has(lu.time)) ?? shuffled.find(eligible);
    if (fix) picks[picks.length - 1] = fix;
  }
  return picks;
}

/* Erro de regra do jogo (código estável + mensagem). */
export class GameError extends Error {
  constructor(code, detail) { super(detail); this.code = code; }
}

/* Draft de UM jogador, como máquina de estados pura e REPRODUZÍVEL: o estado inteiro é função de
 * (seed, actions). Por isso desfazer é trivial e seguro: descarta a última escolha e refaz o
 * resto — o gerador volta exatamente ao ponto certo, e o log continua válido para o servidor.
 * Usada pelo navegador (jogo livre/desafio) e pelo servidor (campeonato). */
export class Draft {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.streams = createStreams(this.seed);
    this.taken = { roles: new Set(), nicks: new Set() };
    this.picks = {};
    this.refreshesLeft = MAX_REFRESHES;
    this.actions = [];
    this.offers = this._roll();
  }
  _byId(id) { return LINEUP_BY_ID.get(id); }
  _roll() { return pickRandomLineups(this.streams.draftRand, this.taken).map((l) => l.id); }
  get done() { return Object.keys(this.picks).length === ROLES.length; }
  get canUndo() { return this.actions.some((a) => a.t === "pick"); }

  refresh() {
    if (this.done) throw new GameError("draft-complete", "Seu elenco já está completo.");
    if (this.refreshesLeft <= 0) throw new GameError("no-refresh", "Sem atualizações nesta vaga.");
    this.refreshesLeft--;
    this.offers = this._roll();
    this.actions.push({ t: "refresh" });
  }

  pick(lineupId, nick) {
    if (this.done) throw new GameError("draft-complete", "Seu elenco já está completo.");
    if (!this.offers.includes(lineupId)) throw new GameError("not-offered", "Essa lineup não está entre as ofertas.");
    const pl = this._byId(lineupId).jogadores.find((p) => p.nick === nick);
    if (!pl) throw new GameError("not-offered", "Jogador inexistente nessa lineup.");
    if (this.taken.roles.has(pl.papel) || this.taken.nicks.has(pl.nick)) throw new GameError("not-eligible", "Papel ocupado ou jogador repetido.");
    this.taken.roles.add(pl.papel); this.taken.nicks.add(pl.nick);
    this.picks[pl.papel] = { lineupId, nick: pl.nick };
    this.refreshesLeft = MAX_REFRESHES;
    this.actions.push({ t: "pick", lineupId, nick: pl.nick });
    this.offers = this.done ? [] : this._roll();
  }

  /* Desfaz a última escolha (e as atualizações feitas depois dela): volta às MESMAS ofertas de antes. */
  undo() {
    const i = this.actions.map((a) => a.t).lastIndexOf("pick");
    if (i < 0) throw new GameError("nothing-to-undo", "Não há escolha para desfazer.");
    Object.assign(this, Draft.replay(this.seed, this.actions.slice(0, i)));
  }

  static replay(seed, actions) {
    const d = new Draft(seed);
    for (const a of actions) a.t === "refresh" ? d.refresh() : d.pick(a.lineupId, a.nick);
    return d;
  }
}

/* actions de um Draft -> log do Desafio diário: [{ refreshes, lineupId, nick }] (o que verifyDraft confere). */
export function actionsToLog(actions) {
  const log = [];
  let refreshes = 0;
  for (const a of actions) {
    if (a.t === "refresh") refreshes++;
    else { log.push({ refreshes, lineupId: a.lineupId, nick: a.nick }); refreshes = 0; }
  }
  return log;
}

/* Reproduz o draft de um jogador a partir da seed e do log de escolhas.
 * draft = [{ refreshes, lineupId, nick } x5], na ordem em que foram feitas.
 * Garante que cada escolha estava REALMENTE na tela (mesma leva que o cliente viu),
 * que o limite de atualizações foi respeitado e que o jogador era escalável.
 * Retorna picks no formato de resolveSquad(). Lança Error se algo não bater. */
export function verifyDraft(seed, draft) {
  if (!Array.isArray(draft) || draft.length !== ROLES.length) throw new Error("draft deve ter 5 escolhas");
  const { draftRand } = createStreams(seed);
  const taken = { roles: new Set(), nicks: new Set() };
  const picks = {};
  for (const step of draft) {
    const n = step?.refreshes;
    if (!Number.isInteger(n) || n < 0 || n > MAX_REFRESHES) throw new Error("atualizações inválidas");
    let offers;
    for (let i = 0; i <= n; i++) offers = pickRandomLineups(draftRand, taken); // 1ª leva + n atualizações
    const lu = offers.find((l) => l.id === step.lineupId);
    const pl = lu && lu.jogadores.find((p) => p.nick === step.nick);
    if (!pl) throw new Error("escolha não estava entre as ofertas");
    if (taken.roles.has(pl.papel) || taken.nicks.has(pl.nick)) throw new Error("jogador não escalável");
    taken.roles.add(pl.papel); taken.nicks.add(pl.nick);
    picks[pl.papel] = { lineupId: lu.id, nick: pl.nick };
  }
  return picks;
}

/* ------------------------------ Simulação ------------------------------ */
/* Números dos estilos — FONTE ÚNICA: a simulação e a tela de escolha leem daqui, então o que a
 * interface promete ("+2% por round", "muito imprevisível") é exatamente o que o motor faz.
 *   bias     × 2% = vantagem por round contra quem tem estilo "menos agressivo";
 *   variance = amplitude extra do acaso nos rounds (mais zebras para os dois lados). */
export const STYLE_INFO = {
  rush:   { bias: 1,   variance: 0.09 },
  tatico: { bias: 0,   variance: 0.0 },
  aim:    { bias: 0.5, variance: 0.04 },
};
const styleBias = (s) => STYLE_INFO[s]?.bias ?? 0;
const styleVariance = (s) => STYLE_INFO[s]?.variance ?? 0.03;

/* Força do time frente às lineups históricas (de onde saem os adversários). Percentil = % de
 * lineups MAIS FRACAS que o time; "média" = média das lineups históricas. */
const LEAGUE = LINEUPS.map((l) => l.forca).sort((a, b) => a - b);
const LEAGUE_AVG = Math.round(LEAGUE.reduce((s, f) => s + f, 0) / LEAGUE.length);
export function teamStrength(forca) {
  const percentil = Math.round((100 * LEAGUE.filter((f) => f < forca).length) / LEAGUE.length);
  return { forca, media: LEAGUE_AVG, percentil, nivel: percentil >= 65 ? "acima" : percentil <= 35 ? "abaixo" : "media" };
}

/* Sugestão: time forte → Tático (menos zebra, a força decide); fraco → Rush (a variância ajuda a zebra); no meio → Aim. */
export const styleAdvice = (nivel) => ({ acima: "tatico", abaixo: "rush", media: "aim" }[nivel]);

function pWinRound(rand, forceA, forceB, styleA, styleB) {
  let base = 0.5 + (forceA - forceB) / 160;
  base += (styleBias(styleA) - styleBias(styleB)) * 0.02;
  const noise = (rand() - 0.5) * (0.14 + styleVariance(styleA) + styleVariance(styleB));
  return Math.min(0.93, Math.max(0.07, base + noise));
}

/* MR12 + prorrogações MR3 (primeiro a 4). Ver regras na tela inicial. */
export function simulateMap(rand, teamA, teamB, mapName) {
  let a = 0, b = 0;
  const p = pWinRound(rand, teamA.forca, teamB.forca, teamA.estilo, teamB.estilo);
  while (a < 13 && b < 13) {
    if (rand() < p) a++; else b++;
    if (a === 12 && b === 12) break;
  }
  if (a >= 13) return { map: mapName, a, b, winner: "A", ot: 0 };
  if (b >= 13) return { map: mapName, a, b, winner: "B", ot: 0 };

  let ot = 0;
  for (;;) {
    ot++;
    let oa = 0, ob = 0;
    while (oa < 4 && ob < 4 && oa + ob < 6) {
      if (rand() < p) oa++; else ob++;
    }
    a += oa; b += ob;
    if (oa >= 4) return { map: mapName, a, b, winner: "A", ot };
    if (ob >= 4) return { map: mapName, a, b, winner: "B", ot };
  }
}

export function simulateMatch(rand, teamA, teamB, bo) {
  const need = Math.ceil(bo / 2);
  const pool = shuffle(MAPS, rand);
  let winsA = 0, winsB = 0, i = 0;
  const maps = [];
  while (winsA < need && winsB < need) {
    const res = simulateMap(rand, teamA, teamB, pool[i % pool.length]);
    i++;
    if (res.winner === "A") winsA++; else winsB++;
    maps.push(res);
  }
  return { winner: winsA > winsB ? teamA : teamB, loser: winsA > winsB ? teamB : teamA, winsA, winsB, maps };
}

/* ----------------------- Estatísticas fictícias ----------------------- */
const rolePower = (papel) => ({ AWP: 1.3, Entry: 1.15, Rifler: 1.0, Support: 0.9, IGL: 0.9 }[papel] ?? 1.0);

function statsForTeamInMatch(rand, team, roundsWon, roundsLost) {
  const players = team.jogadores;
  const killsPool = Math.max(5, Math.round(roundsWon * 3.2 + roundsLost * 1.3));
  const deathsPool = Math.max(5, Math.round(roundsLost * 3.2 + roundsWon * 1.3));
  const killW = players.map((p) => rolePower(p.papel) * (0.75 + rand() * 0.5));
  const deathW = players.map(() => 0.75 + rand() * 0.5);
  const killSum = killW.reduce((s, v) => s + v, 0);
  const deathSum = deathW.reduce((s, v) => s + v, 0);
  return players.map((p, i) => {
    const kills = Math.max(0, Math.round((killsPool * killW[i]) / killSum));
    const deaths = Math.max(1, Math.round((deathsPool * deathW[i]) / deathSum));
    return { nick: p.nick, papel: p.papel, pais: p.pais || "", kills, deaths, impact: kills - deaths * 0.9 };
  });
}

function recordMatchStats(t, teamA, teamB, res) {
  let aWon = 0, aLost = 0;
  res.maps.forEach((m) => { aWon += m.a; aLost += m.b; });
  const statsA = statsForTeamInMatch(t.rand, teamA, aWon, aLost);
  const statsB = statsForTeamInMatch(t.rand, teamB, aLost, aWon);
  res.matchStats = { A: statsA, B: statsB };
  for (const [team, stats] of [[teamA, statsA], [teamB, statsB]]) {
    for (const s of stats) {
      const key = team.id + "::" + s.nick;
      const g = t.playerStats[key] ??= { nick: s.nick, papel: s.papel, pais: s.pais, teamNome: team.nome, isUser: team.isUser, kills: 0, deaths: 0, impact: 0, maps: 0 };
      g.kills += s.kills; g.deaths += s.deaths; g.impact += s.impact; g.maps += res.maps.length;
    }
  }
}

/* -------------------------------- Torneio -------------------------------- */
function makeAiTeam(t, lineup) {
  return {
    id: lineup.id + "-ai" + (++t.aiCounter),
    // ano no nome: evita dois "Natus Vincere" indistinguíveis no mesmo torneio
    nome: `${lineup.time} ${lineup.ano}`,
    forca: Math.round(lineup.jogadores.reduce((s, p) => s + p.forca, 0) / 5),
    estilo: STYLES[Math.floor(t.rand() * STYLES.length)],
    isUser: false,
    jogadores: lineup.jogadores,
    wins: 0, losses: 0, mapsLostPlayoffs: 0,
  };
}

export function buildUserTeam({ teamName, squad, style }) {
  if (!STYLES.includes(style)) throw new Error("estilo inválido");
  const forca = Math.round(ROLES.reduce((s, r) => s + squad[r].forca, 0) / 5);
  return {
    id: "you",
    nome: sanitizeTeamName(teamName) || "Seu time",
    forca, estilo: style, isUser: true,
    wins: 0, losses: 0, mapsLostPlayoffs: 0,
    squad,
    jogadores: ROLES.map((r) => ({ nick: squad[r].nick, papel: r, pais: squad[r].pais || "" })),
  };
}

/* Cria o torneio. `squad` deve vir de resolveSquad() (dados confiáveis). */
export function createTournament({ teamName, squad, style, seed }) {
  const { simRand } = createStreams(seed);
  const t = { seed: seed >>> 0, rand: simRand, aiCounter: 0, playerStats: {}, phase: "swiss", roundNum: 1 };
  const you = buildUserTeam({ teamName, squad, style });
  const pool = shuffle(LINEUPS, t.rand).slice(0, 15).map((l) => makeAiTeam(t, l));
  t.teams = [you, ...pool];
  t.active = [...t.teams];
  t.qualified = [];
  t.eliminated = [];
  return t;
}

/* Campeonato multiplayer (Fase 3): 2–8 times humanos + IA até completar 16.
 * humans = [{ teamName, squad (de resolveSquad), style }]; o índice vira `slot` do time. */
export const CUP_MAX_HUMANS = 8;
export function createCup({ humans, seed }) {
  if (!Array.isArray(humans) || humans.length < 1 || humans.length > CUP_MAX_HUMANS) throw new Error("nº de humanos inválido");
  const { simRand } = createStreams(seed);
  const t = { seed: seed >>> 0, rand: simRand, aiCounter: 0, playerStats: {}, phase: "swiss", roundNum: 1 };
  const hs = humans.map((h, i) => ({ ...buildUserTeam(h), id: "human-" + i, isUser: false, isHuman: true, slot: i }));
  const pool = shuffle(LINEUPS, t.rand).slice(0, 16 - hs.length).map((l) => makeAiTeam(t, l));
  t.teams = [...hs, ...pool];
  t.active = [...t.teams];
  t.qualified = [];
  t.eliminated = [];
  return t;
}

/* Situação de cada time (para tabelas): active | qualified | eliminated | out:<fase> | champion */
export function teamStatus(t, team) {
  if (t.champion === team) return "champion";
  if (t.eliminated.includes(team)) return "eliminated";
  if (t.qualified.includes(team)) return team.outAt ? "out:" + team.outAt : "qualified";
  return "active";
}

const boForRecord = (w, l) => ((w + l <= 1) || (w === 1 && l === 1) ? 1 : 3);

function runSwissRound(t) {
  const groups = {};
  for (const team of t.active) (groups[team.wins + "-" + team.losses] ??= []).push(team);
  const results = [];
  for (const key of Object.keys(groups)) {
    const [w, l] = key.split("-").map(Number);
    const bo = boForRecord(w, l);
    const arr = shuffle(groups[key], t.rand);
    for (let i = 0; i + 1 < arr.length; i += 2) {
      const a = arr[i], b = arr[i + 1];
      const res = simulateMatch(t.rand, a, b, bo);
      recordMatchStats(t, a, b, res);
      if (res.winner === a) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
      results.push({ a, b, res, bo });
    }
  }
  t.active = t.active.filter((team) => {
    if (team.wins >= 3) { t.qualified.push(team); return false; }
    if (team.losses >= 3) { t.eliminated.push(team); return false; }
    return true;
  });
  return { type: "swiss", round: t.roundNum++, results };
}

function seedPlayoffs(t) {
  const q = [...t.qualified].sort((x, y) => {
    const dx = x.wins - x.losses, dy = y.wins - y.losses;
    return dy !== dx ? dy - dx : y.forca - x.forca;
  });
  return [q[0], q[7], q[3], q[4], q[2], q[5], q[1], q[6]]; // 1v8, 4v5, 3v6, 2v7
}

function runPlayoffRound(t, pairs, bo, stage) {
  const results = [], winners = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i], b = pairs[i + 1];
    const res = simulateMatch(t.rand, a, b, bo);
    recordMatchStats(t, a, b, res);
    // mapas perdidos nos playoffs: vale para o usuário (single) e para todos os humanos (campeonato)
    for (const [team, lostWhen] of [[a, "B"], [b, "A"]]) {
      if (team.isUser || team.isHuman) team.mapsLostPlayoffs += res.maps.filter((m) => m.winner === lostWhen).length;
    }
    res.loser.outAt = stage;                                   // onde o time caiu (usado pelo resumo do campeonato)
    results.push({ a, b, res, bo });
    winners.push(res.winner);
  }
  return { results, winners };
}

/* Avança UMA etapa. Retorna o evento ({type,...}) ou null se já terminou.
 * O cliente chama a cada clique; um servidor pode chamar em laço até null. */
export function advance(t) {
  switch (t.phase) {
    case "swiss": {
      if (t.active.length === 0) { t.phase = "seed"; return advance(t); }
      return runSwissRound(t);
    }
    case "seed":
      t.playoffSeeds = seedPlayoffs(t);
      t.phase = "qf";
      return { type: "seed", seeds: t.playoffSeeds };
    case "qf": {
      const { results, winners } = runPlayoffRound(t, t.playoffSeeds, 3, "Quartas");
      t.semis = winners; t.phase = "sf";
      return { type: "qf", results };
    }
    case "sf": {
      const { results, winners } = runPlayoffRound(t, t.semis, 3, "Semifinal");
      t.finalPair = winners; t.phase = "final";
      return { type: "sf", results };
    }
    case "final": {
      const { results } = runPlayoffRound(t, t.finalPair, 5, "Final");
      t.champion = results[0].res.winner;
      t.phase = "done";
      return { type: "final", results };
    }
    default:
      return null;
  }
}

export function playToEnd(t) {
  const log = [];
  for (let e = advance(t); e; e = advance(t)) log.push(e);
  return log;
}

export function tournamentMvp(t) {
  const arr = Object.values(t.playerStats);
  if (!arr.length) return null;
  return arr.reduce((best, p) => (p.impact > best.impact ? p : best));
}

/* Resumo canônico do resultado do usuário — o que um ranking/servidor guardaria. */
export function summarize(t) {
  const you = t.teams.find((x) => x.isUser);
  const isChampion = t.champion === you;
  const wasInPlayoffs = t.qualified.includes(you);
  const cleanSwiss = you.wins === 3 && you.losses === 0;
  const cleanPlayoffs = wasInPlayoffs && you.mapsLostPlayoffs === 0;
  return {
    seed: t.seed, teamName: you.nome, forca: you.forca, style: you.estilo,
    wins: you.wins, losses: you.losses,
    wasInPlayoffs, isChampion, cleanPlayoffs,
    perfeito: isChampion && cleanSwiss && cleanPlayoffs,
    champion: t.champion.nome,
  };
}

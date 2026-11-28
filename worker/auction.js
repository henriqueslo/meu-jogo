/* Leilão multiplayer — máquina de estados PURA (sem Cloudflare, sem I/O), com o mesmo contrato do campeonato
 * (join / apply / view / toJSON / fromJSON) mais o relógio: `tick(now, connected)` e `nextDeadline()`.
 * O tempo é sempre INJETADO (`now`, em ms), então tudo roda e é testado em Node, sem esperar.
 *
 *   lobby (2–5 humanos; dono = slot 0) --start--> auction (um jogador histórico por vez; lance fechado e
 *   simultâneo) --acabaram os leilões--> style (cada um escolhe o estilo) --todos--> running (o mesmo
 *   campeonato simulado: suíço + playoffs completados até 16 times) --> done
 *
 * Regras (docs/MULTIPLAYER.md):
 *  - 100 moedas por jogador; precisa fechar 5 vagas (AWP, IGL, Entry, Support, Rifler);
 *  - lance fechado e simultâneo: ninguém vê o lance dos outros até a revelação; passar é livre;
 *  - reserva: lance máximo = saldo − (vagas vazias − 1), para ninguém ficar sem moedas para completar o time;
 *  - 10 leilões por jogador, o mesmo número de cada papel (oferta = o dobro da demanda);
 *  - empate: leva quem deu o lance PRIMEIRO (pelo relógio do servidor); só no mesmíssimo instante, sorteio pela semente;
 *  - vaga que sobra recebe, de graça, o melhor descartado do papel (os times mais fracos escolhem primeiro).
 * O servidor é a autoridade: o cliente manda intenções (start, bid, pass, style, force, advance). */
import { LINEUPS, ROLES } from "../site/js/data.js";
import { STYLES, resolveSquad, sanitizeTeamName, hashSeed, mulberry32, shuffle, GameError } from "../site/js/engine.js";
import { moderateName, NAME_BLOCKED_MESSAGE } from "../site/js/moderation.js";
import { buildRun, stepRun, runPhase, runView } from "./run.js";
import { hex } from "./rooms.js";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const START_COINS = 100;
export const LOTS_PER_PLAYER = 10;
export const BID_MS = 15_000;          // prazo para dar o lance
export const REVEAL_MS = 5_000;        // tempo para ler a revelação antes do próximo leilão

/* A fila de leilões: determinística em (seed, n). Um jogador por nick (nenhum se repete), `2n` por papel, embaralhados. */
export function buildPool(seed, n) {
  const rand = mulberry32(hashSeed(`${seed}|auction|pool|${n}`));
  const byNick = new Map();
  for (const lu of LINEUPS) for (const p of lu.jogadores) {
    if (!byNick.has(p.nick)) byNick.set(p.nick, []);
    byNick.get(p.nick).push({ lu, p });
  }
  const entries = [...byNick.keys()].sort().map((nick) => {            // o mesmo nick pode ter várias aparições: sorteia uma
    const opts = byNick.get(nick), { lu, p } = opts[Math.floor(rand() * opts.length)];
    return { id: `${lu.id}|${p.nick}`, lineupId: lu.id, nick: p.nick, role: p.papel, pais: p.pais, team: lu.time, ano: lu.ano, forca: p.forca };
  });
  const lots = [];
  for (const role of ROLES) lots.push(...shuffle(entries.filter((e) => e.role === role), rand).slice(0, 2 * n));
  return shuffle(lots, rand);
}

const isInt = (v) => Number.isInteger(v);

export class Auction {
  constructor({ code, seed, started = false, n = 0, players = [], idx = 0, step = null, deadline = null, bids = {}, bidTimes = {}, history = [], fills = [], over = false, steps = 0 }) {
    this.code = code; this.seed = seed >>> 0; this.started = started; this.n = n;
    this.players = players.map((p) => ({ name: p.name, token: p.token, style: p.style ?? null }));
    this.idx = idx; this.step = step; this.deadline = deadline; this.bids = { ...bids }; this.bidTimes = { ...bidTimes };   // bidTimes: quando cada lance chegou (desempate)
    this.history = history.map((h) => ({ ...h, bids: [...h.bids] })); this.fills = fills.map((f) => ({ ...f }));
    this.over = over; this.steps = steps;
    this._pool = null; this.run = null;
    if (this.over && this.players.length && this.players.every((p) => p.style)) this.run = buildRun(this._humans(), this._runSeed(), this.steps);
  }
  static create(code, seed) { return new Auction({ code, seed }); }

  get pool() { return (this._pool ??= buildPool(this.seed, this.n)); }
  _runSeed() { return hashSeed(`${this.seed}|auction|run`); }

  get phase() {
    if (!this.started) return "lobby";
    if (!this.over) return "auction";
    if (!this.run) return "style";
    return runPhase(this.run);
  }

  toJSON() {
    return {
      code: this.code, seed: this.seed, started: this.started, n: this.n, idx: this.idx, step: this.step, deadline: this.deadline,
      bids: this.bids, bidTimes: this.bidTimes, history: this.history, fills: this.fills, over: this.over, steps: this.steps,
      players: this.players.map((p) => ({ name: p.name, token: p.token, style: p.style })),
    };
  }
  static fromJSON(j) { return new Auction(j); }

  join(name, token) {
    if (token) {
      const slot = this.players.findIndex((p) => p.token === token);
      if (slot >= 0) return { slot, token, reconnected: true };
    }
    if (this.started) throw new GameError("cup-started", "O leilão já começou.");
    if (this.players.length >= MAX_PLAYERS) throw new GameError("room-full", "Sala cheia.");
    const clean = sanitizeTeamName(name);
    if (clean.length < 2) throw new GameError("invalid-name", "Nome do time precisa de 2–24 caracteres válidos.");
    if (!moderateName(clean).ok) throw new GameError("name-blocked", NAME_BLOCKED_MESSAGE);
    if (this.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) throw new GameError("name-taken", "Já existe um time com esse nome na sala.");
    const player = { name: clean, token: hex(16), style: null };
    this.players.push(player);
    return { slot: this.players.length - 1, token: player.token };
  }

  /* ------------------------------ derivados do histórico ------------------------------ */
  /* slot -> { papel: { lot, price } } com o que cada um conquistou (lances ganhos + vagas completadas). */
  _squads() {
    const sq = this.players.map(() => ({})), pool = this.pool;
    for (const h of this.history) if (h.winner !== null) sq[h.winner][pool[h.lot].role] = { lot: h.lot, price: h.price };
    for (const f of this.fills) sq[f.slot][f.role] = { lot: f.lot, price: 0 };
    return sq;
  }
  _coins(slot) { return START_COINS - this.history.reduce((s, h) => s + (h.winner === slot ? h.price : 0), 0); }
  _maxBid(slot, sq) { return this._coins(slot) - (ROLES.length - Object.keys(sq[slot]).length - 1); }

  /* Por que este jogador não pode dar lance neste leilão (null = pode). */
  _why(slot, sq) {
    if (this.phase !== "auction" || this.step !== "bidding") return "closed";
    if (sq[slot][this.pool[this.idx].role]) return "role-filled";
    if (slot in this.bids) return "submitted";
    return null;
  }
  _eligible(slot, sq) { return !sq[slot][this.pool[this.idx].role]; }

  /* Fechar antes do prazo: todos os que PODEM dar lance e estão conectados já enviaram (quem caiu conta como
   * passou). Se NINGUÉM está conectado não fecha (uma queda geral de rede não pode queimar lotes). */
  _shouldCloseEarly(connected) {
    if (!this.players.some((_, s) => connected[s])) return false;
    const sq = this._squads();
    return this.players.map((_, s) => s).filter((s) => this._eligible(s, sq) && connected[s]).every((s) => s in this.bids);
  }

  /* ------------------------------ andamento do leilão ------------------------------ */
  /* Abre o leilão `idx` (pulando os que ninguém pode disputar) ou encerra tudo. `now` = quando ele abre. */
  _openLot(now) {
    for (;;) {
      const sq = this._squads();
      if (this.idx >= this.pool.length || sq.every((s) => Object.keys(s).length === ROLES.length)) return this._finish();
      const lot = this.pool[this.idx];
      if (sq.some((s) => !s[lot.role])) { this.step = "bidding"; this.deadline = now + BID_MS; this.bids = {}; this.bidTimes = {}; return; }
      this.history.push({ lot: this.idx, bids: this.players.map(() => 0), winner: null, price: 0, skipped: true });
      this.idx++;
    }
  }

  _reveal(at) {
    const amounts = this.players.map((_, s) => this.bids[s] ?? 0), top = Math.max(...amounts);
    let winner = null, price = 0, tie = null;
    if (top > 0) {
      const tied = amounts.map((a, s) => (a === top ? s : -1)).filter((s) => s >= 0);
      price = top;
      if (tied.length === 1) winner = tied[0];
      else {                                                                  // empate: leva quem deu o lance primeiro
        const quando = (s) => this.bidTimes[s] ?? Infinity;
        const primeiro = Math.min(...tied.map(quando)), rapidos = tied.filter((s) => quando(s) === primeiro);
        if (rapidos.length === 1) { winner = rapidos[0]; tie = "speed"; }
        else { winner = rapidos[hashSeed(`${this.seed}|tie|${this.idx}`) % rapidos.length]; tie = "draw"; }   // mesmo instante: sorteio da semente
      }
    }
    this.history.push({ lot: this.idx, bids: amounts, winner, price, tie });
    this.step = "reveal"; this.deadline = at + REVEAL_MS;
  }

  /* Acabaram os leilões: vagas que sobraram recebem de graça o melhor descartado do papel, os mais fracos primeiro. */
  _finish() {
    this.step = null; this.deadline = null; this.over = true;
    const sq = this._squads(), pool = this.pool;
    const usados = new Set(this.history.filter((h) => h.winner !== null).map((h) => h.lot));
    const forca = (s) => Object.values(sq[s]).reduce((sum, c) => sum + pool[c.lot].forca, 0);
    const ordem = this.players.map((_, s) => s).sort((a, b) => forca(a) - forca(b) || a - b);
    for (const slot of ordem) for (const role of ROLES) {
      if (sq[slot][role]) continue;
      const livres = pool.map((l, i) => ({ l, i })).filter(({ l, i }) => l.role === role && !usados.has(i)).sort((a, b) => b.l.forca - a.l.forca || a.i - b.i);
      if (!livres.length) throw new GameError("internal", "Sem jogador livre para completar o elenco.");
      usados.add(livres[0].i); this.fills.push({ slot, role, lot: livres[0].i }); sq[slot][role] = { lot: livres[0].i, price: 0 };
    }
  }

  _control(slot, connected) {
    if (slot !== 0 && connected[0]) throw new GameError("not-host", "Só o dono da sala pode fazer isso.");
  }

  apply(slot, msg, { now = Date.now(), connected = [] } = {}) {
    const p = this.players[slot];
    if (!p) throw new GameError("not-joined", "Entre na sala primeiro.");
    switch (msg?.t) {
      case "start":
        if (this.phase !== "lobby") throw new GameError("bad-phase", "O leilão já começou.");
        if (slot !== 0) throw new GameError("not-host", "Só o dono da sala pode iniciar.");
        if (this.players.length < MIN_PLAYERS) throw new GameError("not-enough", `Precisa de pelo menos ${MIN_PLAYERS} jogadores.`);
        this.started = true; this.n = this.players.length; this.idx = 0; this._pool = null;
        this._openLot(now); return;
      case "bid": case "pass": {
        if (this.phase !== "auction" || this.step !== "bidding") throw new GameError("bad-phase", "Não há leilão aberto para dar lance.");
        const sq = this._squads(), why = this._why(slot, sq);
        if (why === "submitted") throw new GameError("already-bid", "Você já enviou o seu lance neste leilão.");
        if (why === "role-filled") throw new GameError("role-filled", "Você já tem esse papel no elenco.");
        let amount = 0;
        if (msg.t === "bid") {
          if (!isInt(msg.amount) || msg.amount < 1) throw new GameError("bad-message", "O lance precisa ser um número inteiro de moedas (1 ou mais).");
          if (msg.amount > this._maxBid(slot, sq)) throw new GameError("bid-too-high", `Lance máximo agora: ${this._maxBid(slot, sq)} (você precisa reservar 1 moeda para cada vaga que falta).`);
          amount = msg.amount;
        }
        this.bids[slot] = amount; this.bidTimes[slot] = now;
        if (this._shouldCloseEarly(connected)) this._reveal(now);
        return;
      }
      case "style":
        if (this.phase !== "style") throw new GameError("bad-phase", "O estilo se escolhe depois do leilão.");
        if (p.style) throw new GameError("style-locked", "Estilo já escolhido.");
        if (!STYLES.includes(msg.style)) throw new GameError("bad-message", "Estilo inválido.");
        p.style = msg.style; this._maybeBegin(); return;
      case "force":                                    // completa o estilo (Tático) de quem ainda não escolheu
        if (this.phase !== "style") throw new GameError("bad-phase", "Só dá para completar na escolha de estilo.");
        this._control(slot, connected);
        for (const q of this.players) q.style ??= "tatico";
        this._maybeBegin(); return;
      case "advance":
        if (this.phase !== "running") throw new GameError("bad-phase", "Não há rodada para avançar.");
        this._control(slot, connected);
        if (stepRun(this.run)) this.steps++;
        return;
      default:
        throw new GameError("bad-message", "Mensagem desconhecida.");
    }
  }

  /* O relógio: fecha leilões vencidos, passa da revelação para o próximo (pode andar vários, depois de uma pausa
   * longa) e fecha cedo quando só falta quem está desconectado. Devolve true se algo mudou. */
  tick(now, connected = []) {
    if (this.phase !== "auction") return false;
    let changed = false;
    for (let guard = 0; guard < 1000 && this.phase === "auction"; guard++) {
      if (this.step === "bidding") {
        if (now >= this.deadline) { this._reveal(this.deadline); changed = true; continue; }
        if (this._shouldCloseEarly(connected)) { this._reveal(now); changed = true; continue; }
        break;
      }
      if (this.step === "reveal" && now >= this.deadline) { const at = this.deadline; this.idx++; this._openLot(at); changed = true; continue; }
      break;
    }
    return changed;
  }

  /* Quando o relógio precisa acordar (ms desde a época) ou null. */
  nextDeadline() { return this.phase === "auction" ? this.deadline : null; }

  _maybeBegin() {
    if (!this.players.every((p) => p.style)) return;
    this.steps = 0;
    this.run = buildRun(this._humans(), this._runSeed(), 0);
  }

  _humans() {
    const sq = this._squads(), pool = this.pool;
    return this.players.map((p, s) => ({
      teamName: p.name, style: p.style,
      squad: resolveSquad(Object.fromEntries(ROLES.map((r) => [r, { lineupId: pool[sq[s][r].lot].lineupId, nick: pool[sq[s][r].lot].nick }]))),
    }));
  }

  /* ------------------------------ visão de um jogador ------------------------------ */
  view(slot, connected = [], now = Date.now()) {
    const me = this.players[slot], phase = this.phase, pool = this.started ? this.pool : [];
    const sq = this.started ? this._squads() : this.players.map(() => ({}));
    const squadView = (s) => Object.fromEntries(Object.entries(sq[s]).map(([role, c]) => {
      const l = pool[c.lot];
      return [role, { nick: l.nick, pais: l.pais, forca: l.forca, team: l.team, ano: l.ano, lineupId: l.lineupId, price: c.price }];
    }));
    const lot = phase === "auction" ? pool[this.idx] : null;
    const bidding = phase === "auction" && this.step === "bidding";
    const ultimo = [...this.history].reverse().find((h) => !h.skipped);
    const remaining = Object.fromEntries(ROLES.map((r) => [r, 0]));
    if (phase === "auction") for (let i = this.idx + 1; i < pool.length; i++) remaining[pool[i].role]++;

    const out = {
      v: 1, kind: "auction", phase, code: this.code, min_players: MIN_PLAYERS, max_players: MAX_PLAYERS,
      step: phase === "auction" ? this.step : null,
      msLeft: phase === "auction" ? Math.max(0, this.deadline - now) : 0,
      lot: lot ? { ...lot } : null,
      idx: phase === "auction" ? this.idx + 1 : this.started ? pool.length : 0,
      total: this.started ? pool.length : 0,
      remaining,
      last: ultimo ? { lot: { ...pool[ultimo.lot] }, bids: this.players.map((p, s) => ({ slot: s, name: p.name, amount: ultimo.bids[s] })), winner: ultimo.winner, price: ultimo.price, tie: ultimo.tie ?? null } : null,
      fills: this.fills.map((f) => ({ slot: f.slot, role: f.role, nick: pool[f.lot].nick, forca: pool[f.lot].forca, team: pool[f.lot].team })),
      you: me ? {
        slot, name: me.name, host: slot === 0, canControl: slot === 0 || !connected[0], style: me.style,
        coins: this.started ? this._coins(slot) : START_COINS, squad: squadView(slot),
        maxBid: bidding ? Math.max(0, this._maxBid(slot, sq)) : 0,
        canBid: bidding && this._why(slot, sq) === null,
        why: bidding ? this._why(slot, sq) : null,
        submitted: bidding ? slot in this.bids : false,
        bid: bidding ? (this.bids[slot] ?? null) : null,
      } : null,
      players: this.players.map((p, s) => ({
        name: p.name, host: s === 0, connected: !!connected[s],
        coins: this.started ? this._coins(s) : START_COINS, filled: Object.keys(sq[s]).length, squad: squadView(s),
        submitted: bidding ? s in this.bids : false, eligible: bidding ? this._eligible(s, sq) : false,
        ready: !!p.style,
      })),
      teams: null, events: [], result: null,
    };
    if (this.run) Object.assign(out, runView(this.run, (s, role) => pool[sq[s][role].lot].nick));
    return out;
  }
}

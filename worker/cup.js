/* Campeonato multiplayer (Fase 3) — máquina de estados PURA com o contrato
 * join / apply / view / toJSON / fromJSON, então o Durable Object genérico (room-do.js) a hospeda.
 *
 *   lobby (2–8 humanos entram; dono = slot 0) --start--> draft (cada um monta o elenco; mesma seed)
 *   --todos prontos--> running (servidor simula; o dono avança rodada a rodada) --> done
 *
 * Autoridade total do servidor: o cliente manda intenções (refresh, pick, style, start, force,
 * advance). Dono sumiu? Qualquer jogador conectado pode `force`/`advance` (sem timers).
 * Persistência: seed + ações do draft + estilos + nº de passos; o torneio é reconstruído por replay. */
import { STYLES, resolveSquad, sanitizeTeamName, hashSeed, GameError, Draft } from "../site/js/engine.js";
import { buildRun, stepRun, runPhase, runView } from "./run.js";
import { hex, str } from "./rooms.js";
import { moderateName, NAME_BLOCKED_MESSAGE } from "../site/js/moderation.js";

export const MIN_HUMANS = 2;
export const MAX_HUMANS = 8;

const eligibleFirst = (d) => {                       // autopick: 1º jogador escalável das ofertas
  for (const id of d.offers) {
    const lu = d._byId(id);
    for (const p of lu.jogadores) if (!d.taken.roles.has(p.papel) && !d.taken.nicks.has(p.nick)) return { id, nick: p.nick };
  }
  return null;
};

export class Cup {
  constructor({ code, seed, started = false, running = false, steps = 0, players = [] }) {
    this.code = code; this.seed = seed >>> 0; this.started = started; this.running = running; this.steps = steps;
    this.players = players.map((p) => ({ ...p, draft: Draft.replay(this._draftSeed(), p.actions ?? []) }));
    this.run = null;
    if (this.running) this.run = buildRun(this._humans(), this._runSeed(), this.steps);
  }
  static create(code, seed) { return new Cup({ code, seed }); }

  _draftSeed() { return hashSeed(`${this.seed}|cup`); }
  _runSeed() { return hashSeed(`${this.seed}|cup|run`); }

  get phase() {
    if (!this.started) return "lobby";
    if (!this.running) return "draft";
    return runPhase(this.run);
  }

  toJSON() {
    return {
      code: this.code, seed: this.seed, started: this.started, running: this.running, steps: this.steps,
      players: this.players.map((p) => ({ name: p.name, token: p.token, style: p.style ?? null, actions: p.draft.actions })),
    };
  }
  static fromJSON(j) { return new Cup(j); }

  join(name, token) {
    if (token) {
      const slot = this.players.findIndex((p) => p.token === token);
      if (slot >= 0) return { slot, token, reconnected: true };
    }
    if (this.started) throw new GameError("cup-started", "O campeonato já começou.");
    if (this.players.length >= MAX_HUMANS) throw new GameError("room-full", "Sala cheia.");
    const clean = sanitizeTeamName(name);
    if (clean.length < 2) throw new GameError("invalid-name", "Nome do time precisa de 2–24 caracteres válidos.");
    if (!moderateName(clean).ok) throw new GameError("name-blocked", NAME_BLOCKED_MESSAGE);
    if (this.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) throw new GameError("name-taken", "Já existe um time com esse nome na sala.");
    const player = { name: clean, token: hex(16), style: null, actions: [], draft: new Draft(this._draftSeed()) };
    this.players.push(player);
    return { slot: this.players.length - 1, token: player.token };
  }

  _control(slot, connected) {                         // dono, ou qualquer jogador se o dono estiver offline
    if (slot !== 0 && connected[0]) throw new GameError("not-host", "Só o dono da sala pode fazer isso.");
  }
  _ready(p) { return p.draft.done && !!p.style; }

  apply(slot, msg, { connected = [] } = {}) {
    const p = this.players[slot];
    if (!p) throw new GameError("not-joined", "Entre na sala primeiro.");
    switch (msg?.t) {
      case "start":
        if (this.phase !== "lobby") throw new GameError("bad-phase", "O campeonato já começou.");
        if (slot !== 0) throw new GameError("not-host", "Só o dono da sala pode iniciar.");
        if (this.players.length < MIN_HUMANS) throw new GameError("not-enough", `Precisa de pelo menos ${MIN_HUMANS} jogadores.`);
        this.started = true; return;
      case "refresh":
        this._needDraft(); p.draft.refresh(); return;
      case "pick":
        this._needDraft();
        if (!str(msg.lineupId, 64) || !str(msg.nick, 40)) throw new GameError("bad-message", "pick inválido.");
        p.draft.pick(msg.lineupId, msg.nick); return;
      case "undo":                                       // desfazer a última escolha (só antes de fixar o estilo)
        this._needDraft();
        if (p.style) throw new GameError("style-locked", "Estilo já escolhido; não dá mais para desfazer.");
        p.draft.undo(); return;
      case "style":
        this._needDraft();
        if (!p.draft.done) throw new GameError("draft-incomplete", "Complete o elenco antes do estilo.");
        if (p.style) throw new GameError("style-locked", "Estilo já escolhido.");
        if (!STYLES.includes(msg.style)) throw new GameError("bad-message", "Estilo inválido.");
        p.style = msg.style; this._maybeBegin(); return;
      case "force":                                    // completa automaticamente quem ainda não terminou
        this._needDraft(); this._control(slot, connected);
        for (const q of this.players) {
          while (!q.draft.done) { const c = eligibleFirst(q.draft); q.draft.pick(c.id, c.nick); }
          q.style ??= "tatico";
        }
        this._maybeBegin(); return;
      case "advance":
        if (this.phase !== "running") throw new GameError("bad-phase", "Não há rodada para avançar.");
        this._control(slot, connected);
        this._step(); return;
      default:
        throw new GameError("bad-message", "Mensagem desconhecida.");
    }
  }

  _needDraft() { if (this.phase !== "draft") throw new GameError("bad-phase", "Não está na fase de draft."); }

  _maybeBegin() {
    if (!this.players.every((p) => this._ready(p))) return;
    this.running = true; this.steps = 0;
    this.run = buildRun(this._humans(), this._runSeed(), 0);
  }

  _humans() { return this.players.map((p) => ({ teamName: p.name, squad: resolveSquad(p.draft.picks), style: p.style })); }

  _step() { if (stepRun(this.run)) this.steps++; }

  view(slot, connected = []) {
    const me = this.players[slot];
    const squad = me ? Object.fromEntries(Object.entries(resolveSquad(me.draft.picks, { partial: true })).map(([r, s]) => [r, { nick: s.nick, pais: s.pais, forca: s.forca, team: s.team, lineupId: s.lineupId }])) : {};
    const phase = this.phase;
    const canControl = slot === 0 || !connected[0];
    const out = {
      v: 1, kind: "cup", phase, code: this.code, max_players: MAX_HUMANS, min_players: MIN_HUMANS,
      you: me ? { slot, name: me.name, host: slot === 0, canControl, offers: phase === "draft" ? me.draft.offers : [], refreshesLeft: me.draft.refreshesLeft, squad, draftDone: me.draft.done, canUndo: me.draft.canUndo && !me.style, style: me.style } : null,
      players: this.players.map((p, i) => ({ name: p.name, host: i === 0, connected: !!connected[i], picks: Object.keys(p.draft.picks).length, ready: this._ready(p) })),
      teams: null, events: [], result: null,
    };
    if (this.running) Object.assign(out, runView(this.run, (slot, role) => this.players[slot].draft.picks[role].nick));
    return out;
  }
}

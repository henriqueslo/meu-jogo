/* Duelo 1v1 — máquina de estados PURA (sem Cloudflare, sem I/O).
 * O Durable Object (room-do.js) só cuida de sockets e persistência; toda regra está aqui,
 * por isso roda e é testada em Node.
 *
 * Fluxo:  waiting (<2 jogadores) -> draft (cada um monta o elenco; MESMAS ofertas, mesma seed)
 *         -> done (servidor simula a série Bo3) -> rematch (ambos pedem) -> draft (nova rodada)
 *
 * O servidor é a autoridade: o cliente só envia INTENÇÕES (refresh, pick, style, rematch).
 * Ofertas, ratings e resultado nunca vêm do cliente. O estado do draft é reconstruível por
 * replay (seed + ações), então persiste como JSON simples e sobrevive à hibernação do DO. */
import { LINEUPS, ROLES } from "../site/js/data.js";
import {
  MAX_REFRESHES, STYLES, createStreams, pickRandomLineups, resolveSquad,
  sanitizeTeamName, duelMatch, hashSeed,
  GameError, Draft,
} from "../site/js/engine.js";
import { moderateName, NAME_BLOCKED_MESSAGE } from "../site/js/moderation.js";

export const MAX_PLAYERS = 2;
export const BEST_OF = 3;
const BY_ID = new Map(LINEUPS.map((l) => [l.id, l]));

// Erros e Draft vêm do motor compartilhado (o navegador usa a mesma classe). DuelError = GameError.
export { GameError as DuelError, Draft };
const DuelError = GameError;

export const hex = (n) => [...globalThis.crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;

export class Duel {
  constructor({ code, seed, round = 0, players = [], result = null }) {
    this.code = code; this.seed = seed >>> 0; this.round = round; this.result = result;
    this.players = players.map((p) => ({ ...p, draft: Draft.replay(this._draftSeed(round), p.actions ?? []) }));
  }
  static create(code, seed) { return new Duel({ code, seed }); }

  _draftSeed(round = this.round) { return hashSeed(`${this.seed}|${round}`); }
  get phase() { return this.players.length < MAX_PLAYERS ? "waiting" : this.result ? "done" : "draft"; }

  toJSON() {
    return {
      code: this.code, seed: this.seed, round: this.round, result: this.result,
      players: this.players.map((p) => ({ name: p.name, token: p.token, style: p.style ?? null, rematch: !!p.rematch, actions: p.draft.actions })),
    };
  }
  static fromJSON(j) { return new Duel(j); }

  /* Entra na sala (ou reconecta com o token). Retorna { slot, token }. */
  join(name, token) {
    if (token) {
      const slot = this.players.findIndex((p) => p.token === token);
      if (slot >= 0) return { slot, token, reconnected: true };
    }
    if (this.players.length >= MAX_PLAYERS) throw new DuelError("room-full", "Sala cheia.");
    const clean = sanitizeTeamName(name);
    if (clean.length < 2) throw new DuelError("invalid-name", "Nome do time precisa de 2–24 caracteres válidos.");
    if (!moderateName(clean).ok) throw new DuelError("name-blocked", NAME_BLOCKED_MESSAGE);
    const player = { name: clean, token: hex(16), style: null, rematch: false, actions: [], draft: new Draft(this._draftSeed()) };
    this.players.push(player);
    return { slot: this.players.length - 1, token: player.token };
  }

  /* Aplica uma intenção do jogador `slot`. Lança DuelError se inválida (estado não muda). */
  apply(slot, msg) {
    const p = this.players[slot];
    if (!p) throw new DuelError("not-joined", "Entre na sala primeiro.");
    switch (msg?.t) {
      case "refresh":
        this._needDraft(); p.draft.refresh(); return;
      case "pick":
        this._needDraft();
        if (!str(msg.lineupId, 64) || !str(msg.nick, 40)) throw new DuelError("bad-message", "pick inválido.");
        p.draft.pick(msg.lineupId, msg.nick); return;
      case "undo":                                       // desfazer a última escolha (só antes de fixar o estilo)
        this._needDraft();
        if (p.style) throw new DuelError("style-locked", "Estilo já escolhido; não dá mais para desfazer.");
        p.draft.undo(); return;
      case "style":
        this._needDraft();
        if (!p.draft.done) throw new DuelError("draft-incomplete", "Complete o elenco antes do estilo.");
        if (p.style) throw new DuelError("style-locked", "Estilo já escolhido.");
        if (!STYLES.includes(msg.style)) throw new DuelError("bad-message", "Estilo inválido.");
        p.style = msg.style; this._maybeFinish(); return;
      case "rematch":
        if (this.phase !== "done") throw new DuelError("bad-phase", "Revanche só depois do resultado.");
        p.rematch = true;
        if (this.players.every((x) => x.rematch)) this._nextRound();
        return;
      default:
        throw new DuelError("bad-message", "Mensagem desconhecida.");
    }
  }

  _needDraft() { if (this.phase !== "draft") throw new DuelError("bad-phase", "A partida não está em fase de draft."); }

  _maybeFinish() {
    if (!this.players.every((p) => p.draft.done && p.style)) return;
    const [a, b] = this.players.map((p) => ({ teamName: p.name, squad: resolveSquad(p.draft.picks), style: p.style }));
    const m = duelMatch({ a, b, seed: hashSeed(`${this.seed}|${this.round}|match`), bo: BEST_OF });
    const side = (s) => ({ name: s.teamName, style: s.style, squad: Object.fromEntries(ROLES.map((r) => [r, { nick: s.squad[r].nick, pais: s.squad[r].pais, team: s.squad[r].team, forca: s.squad[r].forca }])) });
    this.result = { winner: m.winner, winsA: m.winsA, winsB: m.winsB, maps: m.maps, forca: m.forca, a: side(a), b: side(b), stats: m.stats };
  }

  _nextRound() {
    this.round++; this.result = null;
    this.players = this.players.map((p) => ({ name: p.name, token: p.token, style: null, rematch: false, actions: [], draft: new Draft(this._draftSeed()) }));
  }

  /* Visão para um jogador: só o que ele pode ver. O elenco do rival aparece apenas no resultado. */
  view(slot, connected = []) {
    const me = this.players[slot], opp = this.players[1 - slot];
    const squad = me ? Object.fromEntries(Object.entries(resolveSquad(me.draft.picks, { partial: true })).map(([r, s]) => [r, { nick: s.nick, pais: s.pais, forca: s.forca, team: s.team, lineupId: s.lineupId }])) : {};
    return {
      v: 1, phase: this.phase, code: this.code, round: this.round, best_of: BEST_OF,
      you: me ? { slot, name: me.name, offers: this.phase === "draft" ? me.draft.offers : [], refreshesLeft: me.draft.refreshesLeft, squad, draftDone: me.draft.done, canUndo: me.draft.canUndo && !me.style, style: me.style, rematch: !!me.rematch } : null,
      opp: opp ? { name: opp.name, connected: !!connected[1 - slot], picks: Object.keys(opp.draft.picks).length, styleChosen: !!opp.style, rematch: !!opp.rematch } : null,
      result: this.result,
    };
  }
}

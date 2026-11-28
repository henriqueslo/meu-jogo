/* Durable Object de uma sala. Cuida de sockets + persistência; as regras
 * estão em cup.js (puro/testado). Usa a WebSocket Hibernation API: o objeto pode ser
 * descarregado da memória sem derrubar as conexões, e o estado é restaurado do storage. */
import { DurableObject } from "cloudflare:workers";
import { GameError } from "../site/js/engine.js";
import { Cup } from "./cup.js";
import { Auction } from "./auction.js";
import { makeBucket, MAX_MESSAGE_BYTES, nextAlarm, decideAlarm } from "./rooms.js";
import { log } from "./log.js";

const TTL_MS = 60 * 60 * 1000;      // sala some após 1 h sem atividade
const MAX_SOCKETS = 16;             // até 8 jogadores + folga para reconexões
const CLOSE = { REPLACED: 4000, BAD_HELLO: 4003, RATE: 4008, TOO_BIG: 4009, FULL: 4013 };

/* Base genérica: um Durable Object hospeda UMA partida cuja lógica pura (Logic) segue o contrato
 * join/apply/view/toJSON/fromJSON. CupRoom = campeonato; AuctionRoom = leilão (que também tem relógio:
 * tick(now, connected) e nextDeadline(), servidos pelo alarme do Durable Object). */
class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    this.ttlAt = null;                  // quando a sala expira (1 h depois da última atividade de um jogador)
    this.buckets = new WeakMap();
    this.flagged = new WeakSet();       // sockets já registrados no log (1 linha por conexão, não por mensagem)
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("game");
      if (saved) this.game = this.Logic.fromJSON(saved);
      this.ttlAt = (await ctx.storage.get("ttlAt")) ?? null;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    // Chamada interna do Worker (a rota pública de salas só existe via Worker).
    if (request.method === "POST" && url.pathname === "/init") {
      if (this.game) return new Response(null, { status: 409 });
      const { code, seed } = await request.json();
      this.game = this.Logic.create(code, seed);
      await this.#save();
      return new Response(null, { status: 201 });
    }
    // Consulta leve usada pelo botão "voltar à sala": só diz se a sala existe e em que fase está.
    if (request.method === "GET" && url.pathname === "/info") {
      return this.game ? Response.json({ phase: this.game.phase }) : new Response(null, { status: 404 });
    }
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    if (!this.game) return new Response("Sala inexistente", { status: 404 });

    // Sockets que nunca se identificaram (slot null) não podem ocupar a sala.
    let sockets = this.ctx.getWebSockets();
    if (sockets.length >= MAX_SOCKETS) {
      for (const s of sockets) if (s.deserializeAttachment()?.slot == null) s.close(CLOSE.FULL, "limpeza");
      sockets = this.ctx.getWebSockets();
      if (sockets.length >= MAX_SOCKETS) return new Response("Sala lotada", { status: 503 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ slot: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== "string" || data.length > MAX_MESSAGE_BYTES) {
      this.#flag(ws, "ws_too_big");
      return ws.close(CLOSE.TOO_BIG, "mensagem inválida");
    }
    let bucket = this.buckets.get(ws);
    if (!bucket) this.buckets.set(ws, (bucket = makeBucket()));
    if (!bucket.take()) { this.#flag(ws, "ws_rate_limited"); return ws.close(CLOSE.RATE, "rate limit"); }

    let msg;
    try { msg = JSON.parse(data); } catch { return this.#send(ws, { t: "error", code: "bad-json", detail: "JSON inválido." }); }
    const att = ws.deserializeAttachment() ?? { slot: null };

    try {
      if (att.slot == null) {
        if (msg?.t !== "hello") return ws.close(CLOSE.BAD_HELLO, "envie hello primeiro");
        const token = typeof msg.token === "string" && msg.token.length === 32 ? msg.token : undefined;
        const { slot, token: tk } = this.game.join(typeof msg.name === "string" ? msg.name.slice(0, 64) : "", token);
        for (const other of this.ctx.getWebSockets()) {          // mesma pessoa reconectando: derruba a conexão antiga
          if (other !== ws && other.deserializeAttachment()?.slot === slot) other.close(CLOSE.REPLACED, "substituída");
        }
        ws.serializeAttachment({ slot });
        log("player_joined", { kind: this.Logic.name, slot, reconnected: tk === token });
        await this.#save();
        await this.#clock();                                     // quem voltou deixa de contar como offline
        this.#send(ws, { t: "welcome", v: 1, slot, token: tk, code: this.game.code });
      } else {
        if (msg?.t === "hello") throw new GameError("bad-message", "Já identificado.");
        const before = this.game.phase;
        this.game.apply(att.slot, msg, { connected: this.#connected(), now: Date.now() });
        if (before !== "done" && this.game.phase === "done") log("game_done", { kind: this.Logic.name });
        this.#logCancel(before);
        await this.#save();
      }
    } catch (e) {
      if (e instanceof GameError) this.#send(ws, { t: "error", code: e.code, detail: e.message });
      else { log("error", { where: "room", kind: this.Logic.name, message: String(e?.message ?? e) }, "error"); this.#send(ws, { t: "error", code: "internal", detail: "Erro interno." }); }
      return;
    }
    this.#broadcast();
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch { /* já fechado */ }
    await this.#clock();                 // quem caiu não pode segurar o leilão
    this.#broadcast();
  }
  async webSocketError() { this.#broadcast(); }

  async alarm() {
    if (!this.game) return;
    const what = decideAlarm({ now: Date.now(), ttlAt: this.ttlAt, deadline: this.game.nextDeadline?.() ?? null });
    if (what === "expire") {            // TTL: apaga a sala
      for (const s of this.ctx.getWebSockets()) s.close(1000, "sala encerrada");
      await this.ctx.storage.deleteAll();
      this.game = null; this.ttlAt = null;
      return;
    }
    if (what === "tick") { await this.#clock(); this.#broadcast(); return; }
    await this.#schedule();             // acordou cedo
  }

  /* Deixa o relógio do jogo andar (prazos vencidos, quem caiu) e guarda se algo mudou. Não renova o TTL:
   * só a atividade de um jogador mantém a sala viva. */
  async #clock() {
    if (!this.game?.tick) return;
    const before = this.game.phase;
    if (this.game.tick(Date.now(), this.#connected())) { this.#logCancel(before); await this.#save({ activity: false }); }
    else await this.#schedule();
  }

  /* Leilão cancelado por desistência: uma linha de log (só o motivo, nunca o nome de quem saiu). */
  #logCancel(before) {
    if (before !== "cancelled" && this.game.phase === "cancelled") log("room_cancelled", { kind: this.Logic.name, why: this.game.cancelled?.why ?? "" });
  }

  async #save({ activity = true } = {}) {
    await this.ctx.storage.put("game", this.game.toJSON());
    if (activity || this.ttlAt == null) { this.ttlAt = Date.now() + TTL_MS; await this.ctx.storage.put("ttlAt", this.ttlAt); }
    await this.#schedule();
  }

  async #schedule() {
    await this.ctx.storage.setAlarm(nextAlarm({ ttlAt: this.ttlAt, deadline: this.game?.nextDeadline?.() ?? null }));
  }

  /* Abuso: registra UMA vez por conexão. Depois de fechada, a fila de mensagens já enviadas
   * ainda chega aqui; sem isso um flood viraria um flood de linhas de log. */
  #flag(ws, event) {
    if (this.flagged.has(ws)) return;
    this.flagged.add(ws);
    log(event, { kind: this.Logic.name }, "warn");
  }

  #send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch { /* socket já caiu */ } }

  #connected() {
    const connected = [];
    for (const s of this.ctx.getWebSockets()) {
      const slot = s.deserializeAttachment()?.slot;
      if (slot != null && s.readyState === 1) connected[slot] = true;
    }
    return connected;
  }

  #broadcast() {
    if (!this.game) return;
    const live = this.ctx.getWebSockets().filter((s) => s.deserializeAttachment()?.slot != null && s.readyState === 1);
    const connected = this.#connected();
    for (const s of live) this.#send(s, { t: "state", ...this.game.view(s.deserializeAttachment().slot, connected, Date.now()) });
  }
}

export class CupRoom extends GameRoom { get Logic() { return Cup; } }
export class AuctionRoom extends GameRoom { get Logic() { return Auction; } }

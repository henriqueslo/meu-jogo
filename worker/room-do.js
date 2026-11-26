/* Durable Object de uma sala de duelo. Cuida de sockets + persistência; as regras
 * estão em duel.js (puro/testado). Usa a WebSocket Hibernation API: o objeto pode ser
 * descarregado da memória sem derrubar as conexões, e o estado é restaurado do storage. */
import { DurableObject } from "cloudflare:workers";
import { Duel, DuelError } from "./duel.js";
import { Cup } from "./cup.js";
import { makeBucket, MAX_MESSAGE_BYTES } from "./rooms.js";

const TTL_MS = 60 * 60 * 1000;      // sala some após 1 h sem atividade
const MAX_SOCKETS = 16;             // até 8 jogadores + folga para reconexões
const CLOSE = { REPLACED: 4000, BAD_HELLO: 4003, RATE: 4008, TOO_BIG: 4009, FULL: 4013 };

/* Base genérica: um Durable Object hospeda UMA partida cuja lógica pura (Logic) segue o contrato
 * join/apply/view/toJSON/fromJSON. Room = duelo 1x1; CupRoom = campeonato. */
class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    this.buckets = new WeakMap();
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("duel");
      if (saved) this.game = this.Logic.fromJSON(saved);
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    // Chamada interna do Worker (a rota pública /rooms só existe via Worker).
    if (request.method === "POST" && url.pathname === "/init") {
      if (this.game) return new Response(null, { status: 409 });
      const { code, seed } = await request.json();
      this.game = this.Logic.create(code, seed);
      await this.#save();
      return new Response(null, { status: 201 });
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
    if (typeof data !== "string" || data.length > MAX_MESSAGE_BYTES) return ws.close(CLOSE.TOO_BIG, "mensagem inválida");
    let bucket = this.buckets.get(ws);
    if (!bucket) this.buckets.set(ws, (bucket = makeBucket()));
    if (!bucket.take()) return ws.close(CLOSE.RATE, "rate limit");

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
        await this.#save();
        this.#send(ws, { t: "welcome", v: 1, slot, token: tk, code: this.game.code });
      } else {
        if (msg?.t === "hello") throw new DuelError("bad-message", "Já identificado.");
        this.game.apply(att.slot, msg, { connected: this.#connected() });
        await this.#save();
      }
    } catch (e) {
      if (e instanceof DuelError) this.#send(ws, { t: "error", code: e.code, detail: e.message });
      else { console.error("room error", e); this.#send(ws, { t: "error", code: "internal", detail: "Erro interno." }); }
      return;
    }
    this.#broadcast();
  }

  async webSocketClose(ws) { try { ws.close(); } catch { /* já fechado */ } this.#broadcast(); }
  async webSocketError() { this.#broadcast(); }

  async alarm() {            // TTL: apaga a sala
    for (const s of this.ctx.getWebSockets()) s.close(1000, "sala encerrada");
    await this.ctx.storage.deleteAll();
    this.game = null;
  }

  async #save() {
    await this.ctx.storage.put("duel", this.game.toJSON());
    await this.ctx.storage.setAlarm(Date.now() + TTL_MS);
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
    for (const s of live) this.#send(s, { t: "state", ...this.game.view(s.deserializeAttachment().slot, connected) });
  }
}

export class Room extends GameRoom { get Logic() { return Duel; } }
export class CupRoom extends GameRoom { get Logic() { return Cup; } }

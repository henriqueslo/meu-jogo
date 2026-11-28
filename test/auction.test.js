import { test } from "node:test";
import assert from "node:assert/strict";
import { LINEUPS, ROLES } from "../site/js/data.js";
import { GameError, mulberry32 } from "../site/js/engine.js";
import { Auction, buildPool, MIN_PLAYERS, MAX_PLAYERS, START_COINS, LOTS_PER_PLAYER, BID_MS, REVEAL_MS } from "../worker/auction.js";

const T0 = 1_000_000;
const ALL = [true, true, true, true, true];
const NOMES = "ABCDE";

const lobby = (n = 3, seed = 7) => { const a = Auction.create("ABC234", seed); for (let i = 0; i < n; i++) a.join("Time " + NOMES[i]); return a; };
const apply = (a, slot, msg, now = T0, connected = ALL) => a.apply(slot, msg, { now, connected });
const begun = (n = 3, seed = 7) => { const a = lobby(n, seed); apply(a, 0, { t: "start" }); return a; };
const view = (a, slot, now = T0, connected = ALL) => a.view(slot, connected, now);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `esperava ${code}`);
const roundtrip = (a) => Auction.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));

/* Todos passam no leilão atual (e, se `espera`, deixa a revelação passar para abrir o próximo). */
function todosPassam(a, now, n) {
  for (let s = 0; s < n; s++) if (view(a, s, now).you.canBid) apply(a, s, { t: "pass" }, now);
}
const proximo = (a, now) => { a.tick(now + REVEAL_MS, ALL); return now + REVEAL_MS; };

/* ------------------------------ pool ------------------------------ */
test("pool: 10 leilões por jogador, o dobro da demanda de cada papel, nicks únicos e determinístico", () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const pool = buildPool(123, n);
    assert.equal(pool.length, LOTS_PER_PLAYER * n);
    for (const r of ROLES) assert.equal(pool.filter((l) => l.role === r).length, 2 * n, `${n} jogadores: papel ${r}`);
    assert.equal(new Set(pool.map((l) => l.nick)).size, pool.length, "nicks únicos (resolveSquad recusa repetidos)");
    assert.deepEqual(buildPool(123, n), pool);
  }
  assert.notDeepEqual(buildPool(1, 3).map((l) => l.id), buildPool(2, 3).map((l) => l.id));
});

test("pool: cada leilão é um jogador real, no papel e com o rating da lineup de onde veio", () => {
  for (const l of buildPool(9, 5)) {
    const lu = LINEUPS.find((x) => x.id === l.lineupId);
    const p = lu.jogadores.find((j) => j.nick === l.nick && j.papel === l.role);
    assert.ok(p, `${l.nick} (${l.role}) não existe em ${l.lineupId}`);
    assert.equal(l.forca, p.forca); assert.equal(l.pais, p.pais); assert.equal(l.team, lu.time); assert.equal(l.ano, lu.ano);
  }
});

/* ------------------------------ lobby ------------------------------ */
test("lobby: de 2 a 5 jogadores; o 6º recebe room-full; nome ruim, bloqueado ou repetido é recusado", () => {
  const a = lobby(5);
  throwsCode(() => a.join("Time F"), "room-full");
  const b = Auction.create("ABC234", 1);
  throwsCode(() => b.join("@@"), "invalid-name");
  throwsCode(() => b.join("f.u.c.k"), "name-blocked");
  b.join("Time A"); throwsCode(() => b.join("time a"), "name-taken");
  assert.equal(b.players.length, 1);
});

test("start: só o dono, com pelo menos 2 jogadores; depois de começar ninguém entra e não dá para começar de novo", () => {
  const a = Auction.create("ABC234", 3); a.join("Time A");
  throwsCode(() => apply(a, 0, { t: "start" }), "not-enough");
  a.join("Time B");
  throwsCode(() => apply(a, 1, { t: "start" }), "not-host");
  apply(a, 0, { t: "start" });
  throwsCode(() => a.join("Time C"), "cup-started");
  throwsCode(() => apply(a, 0, { t: "start" }), "bad-phase");
  assert.equal(a.join("x", a.players[1].token).reconnected, true);     // quem já estava volta com o token
});

/* ------------------------------ começo ------------------------------ */
test("início: todos com 100 moedas, 1º leilão aberto com prazo de 15 s e a visão do jogo", () => {
  const a = begun(3);
  const v = view(a, 0);
  assert.equal(v.kind, "auction"); assert.equal(v.phase, "auction"); assert.equal(v.step, "bidding");
  assert.equal(v.idx, 1); assert.equal(v.total, LOTS_PER_PLAYER * 3);
  assert.equal(v.msLeft, BID_MS); assert.equal(a.nextDeadline(), T0 + BID_MS);
  assert.ok(v.lot.nick && ROLES.includes(v.lot.role) && v.lot.forca > 0);
  assert.equal(v.you.coins, START_COINS); assert.equal(v.you.maxBid, START_COINS - 4);
  assert.equal(v.you.canBid, true); assert.equal(v.last, null);
  assert.deepEqual(v.players.map((p) => p.coins), [100, 100, 100]);
  assert.equal(Object.values(v.remaining).reduce((s, x) => s + x, 0), v.total - 1);
});

/* ------------------------------ lances ------------------------------ */
test("lances são fechados: ninguém vê o lance dos outros antes da revelação", () => {
  const a = begun(3);
  apply(a, 0, { t: "bid", amount: 37 });
  const v1 = view(a, 1);
  assert.equal(v1.players[0].submitted, true); assert.equal(v1.players[1].submitted, false);
  assert.equal(v1.you.bid, null); assert.equal(view(a, 0).you.bid, 37);
  assert.ok(!JSON.stringify(v1).includes("37"), "o valor do lance de outro jogador não pode aparecer na visão");
  assert.equal(v1.step, "bidding");
});

test("validação do lance: inteiro ≥ 1 e ≤ máximo; um só por leilão; só durante o leilão", () => {
  const a = begun(3);
  for (const amount of [0, -1, 1.5, "10", NaN, null, undefined, Infinity]) throwsCode(() => apply(a, 0, { t: "bid", amount }), "bad-message");
  throwsCode(() => apply(a, 0, { t: "bid", amount: 97 }), "bid-too-high");          // 100 − (5 vagas − 1) = 96
  apply(a, 0, { t: "bid", amount: 96 });
  throwsCode(() => apply(a, 0, { t: "bid", amount: 5 }), "already-bid");
  throwsCode(() => apply(a, 0, { t: "pass" }), "already-bid");
  throwsCode(() => apply(a, 9, { t: "pass" }), "not-joined");
  throwsCode(() => apply(a, 1, { t: "joga" }), "bad-message");
  const l = lobby(2); throwsCode(() => apply(l, 0, { t: "bid", amount: 5 }), "bad-phase");
});

test("passar é livre e conta como lance enviado: todos passam → o jogador é descartado, ninguém paga", () => {
  const a = begun(3);
  const lot = view(a, 0).lot;
  todosPassam(a, T0, 3);
  const v = view(a, 0, T0);
  assert.equal(v.step, "reveal");
  assert.equal(v.last.winner, null); assert.equal(v.last.lot.nick, lot.nick);
  assert.deepEqual(v.players.map((p) => p.coins), [100, 100, 100]);
  assert.equal(a.nextDeadline(), T0 + REVEAL_MS);
});

test("maior lance leva e paga o que ofereceu; depois da revelação todos veem quanto cada um pagou", () => {
  const a = begun(3);
  const lot = view(a, 0).lot;
  apply(a, 0, { t: "bid", amount: 25 }); apply(a, 1, { t: "bid", amount: 40 }); apply(a, 2, { t: "pass" }, T0 + 3000);
  const v = view(a, 1, T0 + 3000);
  assert.equal(v.step, "reveal"); assert.equal(v.last.winner, 1); assert.equal(v.last.price, 40);
  assert.deepEqual(v.last.bids.map((b) => [b.slot, b.amount]), [[0, 25], [1, 40], [2, 0]]);
  assert.equal(v.you.coins, 60); assert.equal(v.you.squad[lot.role].nick, lot.nick); assert.equal(v.you.squad[lot.role].price, 40);
  assert.deepEqual(v.players.map((p) => p.coins), [100, 60, 100]);
  assert.equal(view(a, 0, T0 + 3000).you.coins, 100);
});

test("reserva: o lance máximo é o saldo menos 1 moeda por vaga ainda vazia (depois desta)", () => {
  const a = begun(2);
  apply(a, 0, { t: "bid", amount: 96 }); apply(a, 1, { t: "pass" });             // 4 moedas, 4 vagas
  let now = proximo(a, T0);
  for (let i = 0; i < 20 && !(view(a, 0, now).step === "bidding" && view(a, 0, now).you.canBid); i++) { todosPassam(a, now, 2); now = proximo(a, now); }
  const v = view(a, 0, now);
  assert.equal(v.you.coins, 4); assert.equal(v.you.maxBid, 1);                    // 4 − (4 vagas − 1) = 1
  throwsCode(() => apply(a, 0, { t: "bid", amount: 2 }, now), "bid-too-high");
});

test("papel já preenchido: não dá para dar lance (com o motivo) e a revelação não espera por quem não pode", () => {
  const a = begun(2);
  const r0 = view(a, 0).lot.role;
  apply(a, 0, { t: "bid", amount: 10 }); apply(a, 1, { t: "pass" });
  let now = proximo(a, T0);
  // procura o próximo leilão do MESMO papel (o jogador 0 não pode disputar)
  for (let i = 0; i < 20 && !(view(a, 0, now).step === "bidding" && view(a, 0, now).lot?.role === r0); i++) { todosPassam(a, now, 2); now = proximo(a, now); }
  const v = view(a, 0, now);
  assert.equal(v.lot.role, r0); assert.equal(v.you.canBid, false); assert.equal(v.you.why, "role-filled");
  throwsCode(() => apply(a, 0, { t: "bid", amount: 5 }, now), "role-filled");
  apply(a, 1, { t: "bid", amount: 3 }, now);                                       // só o jogador 1 podia: revela na hora
  assert.equal(view(a, 1, now).step, "reveal"); assert.equal(view(a, 1, now).last.winner, 1);
});

test("empate: quem tem menos jogadores leva; com o mesmo número, sorteio determinístico pela semente", () => {
  const vencedor = (seed) => { const a = begun(2, seed); apply(a, 0, { t: "bid", amount: 10 }); apply(a, 1, { t: "bid", amount: 10 }); return view(a, 0).last.winner; };
  assert.equal(vencedor(5), vencedor(5));                                          // determinístico
  assert.deepEqual(new Set([...Array(30).keys()].map((s) => vencedor(s + 1))), new Set([0, 1]));   // e os dois lados ganham
  // 0 já tem 1 jogador: num empate o 1 (com zero) leva
  const a = begun(2, 11);
  const r0 = view(a, 0).lot.role;
  apply(a, 0, { t: "bid", amount: 10 }); apply(a, 1, { t: "pass" });
  let now = proximo(a, T0);
  for (let i = 0; i < 20 && !(view(a, 0, now).step === "bidding" && view(a, 0, now).lot?.role !== r0); i++) { todosPassam(a, now, 2); now = proximo(a, now); }
  apply(a, 0, { t: "bid", amount: 7 }, now); apply(a, 1, { t: "bid", amount: 7 }, now);
  assert.equal(view(a, 0, now).last.winner, 1);
});

/* ------------------------------ tempo ------------------------------ */
test("prazo: ao fim de 15 s quem não respondeu conta como passou; a revelação dura 5 s e abre o próximo", () => {
  const a = begun(3);
  apply(a, 0, { t: "bid", amount: 20 });
  assert.equal(a.tick(T0 + BID_MS - 1, ALL), false); assert.equal(view(a, 0, T0 + BID_MS - 1).step, "bidding");
  assert.equal(view(a, 0, T0 + BID_MS - 1).msLeft, 1);
  assert.equal(a.tick(T0 + BID_MS, ALL), true);
  assert.equal(view(a, 0, T0 + BID_MS).last.winner, 0);                            // os outros 2 passaram por falta de resposta
  assert.equal(a.tick(T0 + BID_MS + REVEAL_MS - 1, ALL), false);
  assert.equal(a.tick(T0 + BID_MS + REVEAL_MS, ALL), true);
  const v = view(a, 0, T0 + BID_MS + REVEAL_MS);
  assert.equal(v.idx, 2); assert.equal(v.step, "bidding"); assert.equal(v.msLeft, BID_MS);
});

test("depois de uma pausa longa (hibernação) o tick põe tudo em dia, sem pular regras", () => {
  const a = begun(2);
  assert.equal(a.tick(T0 + 60 * 60 * 1000, ALL), true);
  assert.equal(view(a, 0, T0 + 3600000).phase, "style");                           // 20 leilões × 20 s cabem na pausa
  assert.equal(a.nextDeadline(), null);
  for (let s = 0; s < 2; s++) assert.equal(Object.keys(view(a, s).you.squad).length, 5);   // todos passaram: vagas completadas de graça
});

test("jogador desconectado não segura a revelação (conta como passou)", () => {
  const a = begun(3);
  const off = [true, true, false];
  apply(a, 0, { t: "bid", amount: 5 }, T0, off); apply(a, 1, { t: "bid", amount: 6 }, T0 + 1000, off);
  assert.equal(view(a, 0, T0 + 1000, off).step, "reveal");
  const b = begun(3);                                                              // e se ele cai DEPOIS de os outros enviarem
  apply(b, 0, { t: "bid", amount: 5 }); apply(b, 1, { t: "bid", amount: 6 });
  assert.equal(view(b, 0).step, "bidding");
  assert.equal(b.tick(T0 + 2000, off), true);
  assert.equal(view(b, 0, T0 + 2000, off).step, "reveal");
});

test("se só sobram desconectados que poderiam dar lance, o leilão fecha na hora; se NINGUÉM está conectado, não queima lotes", () => {
  const a = begun(2, 11);
  const r0 = view(a, 0).lot.role;
  apply(a, 0, { t: "bid", amount: 10 }); apply(a, 1, { t: "pass" });
  let now = proximo(a, T0);
  for (let i = 0; i < 20 && !(view(a, 0, now).step === "bidding" && view(a, 0, now).lot?.role === r0); i++) { todosPassam(a, now, 2); now = proximo(a, now); }
  assert.equal(view(a, 0, now).you.canBid, false);                     // o 0 já tem esse papel; o 1 PODERIA dar lance
  assert.equal(a.tick(now + 100, [true, true]), false);                // o 1 está conectado: tem que esperar por ele
  assert.equal(a.tick(now + 200, [false, false]), false);              // ninguém conectado (queda geral): segue o prazo normal
  assert.equal(view(a, 0, now + 200).step, "bidding");
  assert.equal(a.tick(now + 300, [true, false]), true);                // o 1 caiu e só o 0 (que não pode) está online: fecha já
  assert.equal(view(a, 0, now + 300).step, "reveal"); assert.equal(view(a, 0, now + 300).last.winner, null);
});

/* ------------------------------ vagas que sobram ------------------------------ */
test("vaga que sobra recebe de graça o melhor descartado do papel", () => {
  const a = begun(2, 21);
  let now = T0, guard = 0;
  while (view(a, 0, now).phase === "auction" && guard++ < 200) {          // 0 sempre dá o lance máximo; 1 sempre passa
    const v0 = view(a, 0, now);
    if (v0.step === "bidding") {
      if (v0.you.canBid) apply(a, 0, { t: "bid", amount: v0.you.maxBid }, now);
      if (view(a, 1, now).you.canBid) apply(a, 1, { t: "pass" }, now);
    }
    now = a.nextDeadline() ?? now; a.tick(now, ALL);
  }
  assert.equal(view(a, 0, now).phase, "style");
  const nao_vendidos = a.history.filter((h) => h.winner === null).map((h) => h.lot);
  const pool = a.pool;
  for (const r of ROLES) {
    const melhor = nao_vendidos.map((i) => pool[i]).filter((l) => l.role === r).sort((x, y) => y.forca - x.forca)[0];
    assert.equal(view(a, 1, now).you.squad[r].nick, melhor.nick, `1º a escolher leva o melhor descartado de ${r}`);
    assert.equal(view(a, 1, now).you.squad[r].price, 0);
  }
  assert.equal(view(a, 1, now).fills.length, 5);
});

/* ------------------------------ estilo e torneio ------------------------------ */
function ateOEstilo(n = 3, seed = 31) {
  const a = begun(n, seed); a.tick(T0 + 3_600_000, ALL); return a;       // todo mundo passa; vagas completadas
}
test("estilo: só depois do leilão; é definitivo; quando todos escolhem, o torneio começa (16 times)", () => {
  const a = begun(2);
  throwsCode(() => apply(a, 0, { t: "style", style: "rush" }), "bad-phase");
  const b = ateOEstilo(2); const now = T0 + 3_600_000;
  throwsCode(() => apply(b, 0, { t: "style", style: "nope" }, now), "bad-message");
  apply(b, 0, { t: "style", style: "rush" }, now);
  throwsCode(() => apply(b, 0, { t: "style", style: "aim" }, now), "style-locked");
  assert.equal(view(b, 0, now).phase, "style"); assert.equal(view(b, 0, now).you.style, "rush");
  apply(b, 1, { t: "style", style: "tatico" }, now);
  const v = view(b, 0, now);
  assert.equal(v.phase, "running"); assert.equal(v.teams.length, 16);
});

test("force: dono (ou qualquer um se o dono estiver offline) define Tático para quem faltar", () => {
  const a = ateOEstilo(3); const now = T0 + 3_600_000;
  apply(a, 1, { t: "style", style: "aim" }, now);
  throwsCode(() => apply(a, 2, { t: "force" }, now), "not-host");
  apply(a, 2, { t: "force" }, now, [false, true, true]);                         // dono offline
  assert.equal(view(a, 0, now).phase, "running");
  assert.equal(a.players[0].style, "tatico"); assert.equal(a.players[1].style, "aim");
});

test("torneio: advance até o fim; o resultado traz o elenco que cada humano montou no leilão", () => {
  const a = ateOEstilo(3, 77); const now = T0 + 3_600_000;
  for (let s = 0; s < 3; s++) apply(a, s, { t: "style", style: "tatico" }, now);
  throwsCode(() => apply(a, 1, { t: "advance" }, now), "not-host");
  for (let i = 0; i < 20 && view(a, 0, now).phase === "running"; i++) apply(a, 0, { t: "advance" }, now);
  const v = view(a, 0, now);
  assert.equal(v.phase, "done");
  assert.equal(v.result.humans.length, 3);
  for (const h of v.result.humans) for (const r of ROLES) assert.equal(h.squad[r], view(a, h.slot, now).you.squad[r].nick);
  assert.ok(v.result.champion.name);
});

test("persistência: guardar e restaurar em qualquer ponto devolve exatamente a mesma visão", () => {
  const a = begun(3, 5);
  const confere = (now) => { const b = roundtrip(a); for (let s = 0; s < 3; s++) assert.deepEqual(view(b, s, now), view(a, s, now)); assert.equal(b.nextDeadline(), a.nextDeadline()); };
  confere(T0);                                                                   // começo do 1º leilão
  apply(a, 0, { t: "bid", amount: 12 }); confere(T0);                            // com lance escondido
  apply(a, 1, { t: "pass" }); apply(a, 2, { t: "bid", amount: 30 }, T0 + 4000); confere(T0 + 4000);   // revelação
  a.tick(T0 + 3_600_000, ALL); confere(T0 + 3_600_000);                          // estilo
  for (let s = 0; s < 3; s++) apply(a, s, { t: "style", style: "tatico" }, T0 + 3_600_000);
  confere(T0 + 3_600_000);                                                       // torneio
  for (let i = 0; i < 20 && view(a, 0, T0).phase === "running"; i++) { apply(a, 0, { t: "advance" }, T0 + 3_600_000); confere(T0 + 3_600_000); }
});

/* ------------------------------ partidas inteiras com robôs ------------------------------ */
function jogaComRobos(n, seed, botSeed) {
  const a = begun(n, seed), rnd = mulberry32(botSeed);
  let now = T0, lotes = 0, guard = 0;
  while (view(a, 0, now).phase === "auction") {
    assert.ok(guard++ < 400, "o leilão não terminou");
    const v0 = view(a, 0, now);
    if (v0.step === "bidding") {
      lotes++;
      // invariantes do leilão aberto
      const elegiveis = [...Array(n).keys()].filter((s) => view(a, s, now).you.canBid);
      assert.ok(elegiveis.length >= 1, "um leilão que ninguém pode disputar não pode ser apresentado");
      for (let s = 0; s < n; s++) {
        const y = view(a, s, now).you, vagas = ROLES.length - Object.keys(y.squad).length;
        assert.ok(y.coins >= vagas && y.coins <= START_COINS, `saldo ${y.coins} com ${vagas} vagas`);
        if (y.canBid) assert.ok(y.maxBid >= 1 && y.maxBid <= y.coins - (vagas - 1));
      }
      for (const s of elegiveis) {
        const y = view(a, s, now).you, x = rnd();
        apply(a, s, x < 0.35 ? { t: "pass" } : { t: "bid", amount: 1 + Math.floor(rnd() * (x > 0.9 ? y.maxBid : Math.min(y.maxBid, 25))) }, now);
      }
    }
    now = a.nextDeadline() ?? now; a.tick(now, ALL);
  }
  const fim = view(a, 0, now);
  assert.equal(fim.phase, "style");
  let gasto = 0;
  for (let s = 0; s < n; s++) {
    const y = view(a, s, now).you;
    assert.equal(Object.keys(y.squad).length, 5, "todo elenco termina completo");
    assert.equal(new Set(Object.values(y.squad).map((p) => p.nick)).size, 5, "sem jogador repetido no elenco");
    assert.equal(y.coins, START_COINS - Object.values(y.squad).reduce((sum, p) => sum + p.price, 0), "saldo = 100 − o que pagou");
    gasto += START_COINS - y.coins;
  }
  const todos = new Set(); for (let s = 0; s < n; s++) for (const p of Object.values(view(a, s, now).you.squad)) { assert.ok(!todos.has(p.nick), "o mesmo jogador não vai para dois times"); todos.add(p.nick); }
  assert.ok(lotes <= LOTS_PER_PLAYER * n);
  for (let s = 0; s < n; s++) apply(a, s, { t: "style", style: ["rush", "tatico", "aim"][Math.floor(rnd() * 3)] }, now);
  for (let i = 0; i < 30 && view(a, 0, now).phase === "running"; i++) apply(a, 0, { t: "advance" }, now);
  const done = view(a, 0, now);
  assert.equal(done.phase, "done"); assert.equal(done.result.humans.length, n);
  return JSON.stringify([done.result, gasto, lotes]);
}

test("partidas inteiras com robôs (2 a 5 jogadores, várias sementes): as regras valem do começo ao fim", () => {
  for (const n of [2, 3, 4, 5]) for (const seed of [1, 2, 3, 4, 5, 6]) jogaComRobos(n, seed * 101, seed + n);
});

test("a mesma partida (semente e jogadas iguais) termina exatamente igual", () => {
  assert.equal(jogaComRobos(4, 555, 9), jogaComRobos(4, 555, 9));
  assert.notEqual(jogaComRobos(4, 555, 9), jogaComRobos(4, 556, 9));
});

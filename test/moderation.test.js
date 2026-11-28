import { test } from "node:test";
import assert from "node:assert/strict";
import { moderateName } from "../site/js/moderation.js";
import { sanitizeTeamName, GameError } from "../site/js/engine.js";
import { Cup } from "../worker/cup.js";
import { handle, memoryStore, seedForDay, dayOf } from "../worker/handler.js";
import { createStreams, pickRandomLineups } from "../site/js/engine.js";

const ok = (n) => assert.equal(moderateName(sanitizeTeamName(n)).ok, true, `deveria PASSAR: ${n}`);
const blocked = (n, reason) => {
  const r = moderateName(sanitizeTeamName(n));
  assert.equal(r.ok, false, `deveria BLOQUEAR: ${n}`);
  if (reason) assert.equal(r.reason, reason, n);
};

test("nomes legítimos passam (inclui palavras que CONTÊM termos: sem falso positivo)", () => {
  for (const n of ["Falcons BR", "FURIA", "Natus Vincere", "São Paulo Ñ", "Assassinos", "Classic Crew", "Scunthorpe United", "Enviado FC",
    "Porrada Crew", "Niger Delta", "Cocktail", "Shiitake", "Grape Squad", "Mongólia", "Pitbull 2026", "Time 4 Ever", "w0nderful", "Cuiabá", "Cusco FC",
    "Espírito Santo", "KSCERATO", "s1mple", "G2.Esports", "Os_Brabos", "Team-Alpha", "Fúria Negra"]) ok(n);
});

test("palavrões e ódio são bloqueados (pt-BR e en)", () => {
  for (const n of ["Caralho FC", "Porra Team", "PUTA QUE PARIU", "Buceta Crew", "Viado United", "Fuck Team", "Shit Squad", "Bitch Please", "Nazi Gaming",
    "Hitler Youth", "Nigger", "faggot club", "KKK Team", "Estupro FC", "Arrombado", "Cuzão FC", "Foda-se", "Pornhub Esports"]) blocked(n, "profanity");
});

test("burlas comuns: repetição, l33t, separadores, acentos, caixa", () => {
  for (const n of ["Fuuuuck", "FUCK", "P0rra", "p.o.r.r.a", "c4ralho", "Pu7a", "f u c k", "f.u.c.k", "N1gger", "Niggggger", "Cárálho", "Hítler", "buuuceta", "p_o_r_n_h_u_b"]) blocked(n, "profanity");
});

test("links, contatos e números de telefone", () => {
  for (const n of ["www site", "meusite.com", "Team.gg", "visite http", "11 98765 4321", "55119876543"]) blocked(n);
  assert.equal(moderateName("meusite.com").reason, "link");
  assert.equal(moderateName("11 98765 4321").reason, "digits");
  ok("FURIA 2026"); ok("Time 12345678"); // 8 dígitos ainda passam
});

test("nomes que se passam pela equipe", () => {
  for (const n of ["Admin", "ADMINISTRADOR", "Moderador Oficial", "Suporte", "MinhaLineup", "Staff Team"]) blocked(n, "reserved");
  ok("Administrados FC"); ok("Oficina Team");
});

test("só pontuação / sem letras suficientes", () => {
  for (const n of ["..", "--", "_ _", "1"]) assert.equal(moderateName(sanitizeTeamName(n)).ok, false);
});

test("alfabetos não latinos e homóglifos são removidos na sanitização (não dá para burlar a lista)", () => {
  assert.equal(sanitizeTeamName("Рorra"), "orra");            // 'Р' cirílico removido
  assert.equal(sanitizeTeamName("Фук Team"), "Team");
  assert.equal(sanitizeTeamName("你好 FC"), "FC");
  assert.equal(sanitizeTeamName("٣٤٥٦"), "");                  // dígitos árabes-índicos
  assert.equal(sanitizeTeamName("Ｆｕｃｋ"), "Fuck");           // largura total vira ASCII (e aí é pego pelo filtro)
  blocked("Ｆｕｃｋ");
});

test("servidor: campeonato recusa nome bloqueado com 'name-blocked'", () => {
  const code = (fn) => assert.throws(fn, (e) => e instanceof GameError && e.code === "name-blocked");
  const c = Cup.create("ABC234", 1); code(() => c.join("f.u.c.k")); code(() => c.join("Caralho FC")); assert.equal(c.players.length, 0);
  c.join("Time Legal");                                        // nomes bons continuam entrando
});

test("servidor: desafio do dia devolve 422 para nome bloqueado e não grava nada", async () => {
  const env = { DAILY_SECRET: "test-secret-0123456789" }, NOW = new Date("2026-08-10T15:00:00Z"), store = memoryStore();
  const { draftRand } = createStreams(seedForDay(dayOf(NOW), env));
  const taken = { roles: new Set(), nicks: new Set() }, draft = [];
  for (let i = 0; i < 5; i++) {
    const offers = pickRandomLineups(draftRand, taken); let pick = null;
    for (const lu of offers) for (const p of lu.jogadores) if (!pick && !taken.roles.has(p.papel) && !taken.nicks.has(p.nick)) pick = { lineupId: lu.id, nick: p.nick, papel: p.papel };
    taken.roles.add(pick.papel); taken.nicks.add(pick.nick); draft.push({ refreshes: 0, lineupId: pick.lineupId, nick: pick.nick });
  }
  const post = (name) => handle(new Request("http://x/api/v1/daily/entries", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1.1.1.1" },
    body: JSON.stringify({ player_id: crypto.randomUUID(), team_name: name, style: "rush", draft }) }), env, store, NOW);
  const bad = await post("Porra Team");
  assert.equal(bad.status, 422); assert.deepEqual((await bad.json()).errors, [{ field: "team_name" }]);
  assert.equal(store.rows.length, 0);
  assert.equal((await post("Time Legal")).status, 201);
});

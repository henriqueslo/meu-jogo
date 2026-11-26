/* Moderação de nomes de time. Módulo PURO: roda no navegador (feedback imediato) e no servidor
 * (autoridade — o cliente não é confiável). Duas camadas, nesta ordem:
 *   1. sanitizeTeamName (engine.js): só letras latinas, dígitos ASCII, espaço . _ -  (fecha os
 *      truques de homóglifos de outros alfabetos, que nenhuma lista consegue cobrir);
 *   2. moderateName (aqui): palavrões/ódio, links/contatos, nomes que se passam pela equipe.
 *
 * Evita o problema de “Scunthorpe” (bloquear palavra inocente que contém um termo): termos curtos
 * ou ambíguos só valem como PALAVRA INTEIRA; só termos longos e inequívocos valem como pedaço.
 * Burla comum é tratada: acentos, letras repetidas (fuuuck), l33t (p0rra), separadores (f.u.c.k).
 *
 * É um PONTO DE PARTIDA: nenhuma lista pega tudo. Ajuste as listas abaixo conforme os casos reais. */

/* ---- Listas (escritas em forma normal: minúsculas, sem acento) ---- */

// Palavra inteira (token). Entradas são reduzidas (letras repetidas viram uma) ao carregar.
const WORDS = [
  // pt-BR
  "puta", "puto", "putaria", "putinha", "porra", "caralho", "cu", "cuzao", "merda", "bosta", "buceta",
  "foda", "fodase", "fodido", "foder", "fdp", "pqp", "vsf", "vtnc", "viado", "viadinho", "bicha",
  "arrombado", "retardado", "mongoloide", "vagabunda", "estupro", "estuprador",
  // en
  "fuck", "fucking", "fucker", "shit", "bitch", "cunt", "dick", "pussy", "slut", "whore", "asshole",
  "rape", "rapist", "porn", "porno", "retard", "fag",
  // ódio
  "nazi", "nazista", "heil", "kike", "chink", "spic", "tranny",
];
// Palavra inteira SEM reduzir repetições (ex.: "kkk" viraria "k").
const WORDS_RAW = ["kkk"];
// Pedaço (inequívocos e longos; reduzidos ao carregar).
const SUBSTRINGS = ["caralho", "buceta", "fuck", "hitler", "estupr", "arrombad", "pornhub", "xvideos", "porn"];
// Pedaço comparado SEM reduzir tudo (reduz só 3+ repetições para 2): evita “niger” (o país).
const SUBSTRINGS_MILD = ["nigger", "nigga", "faggot"];
// Passar-se pela equipe / dar a impressão de nome oficial (palavra inteira).
const RESERVED = ["admin", "administrador", "moderador", "moderator", "suporte", "support", "oficial", "official", "staff", "minhalineup"];

/* ---- Normalização ---- */
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t" };
const strip = (s) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const leet = (s) => s.replace(/[013457]/g, (c) => LEET[c]);
const aggr = (s) => s.replace(/(.)\1+/g, "$1");        // fuuuck -> fuck
const mild = (s) => s.replace(/(.)\1{2,}/g, "$1$1");   // niggger -> nigger (mantém o “gg” legítimo)

const WORD_SET = new Set(WORDS.map(aggr));
const RAW_SET = new Set(WORDS_RAW);
const RESERVED_SET = new Set(RESERVED.map(aggr));
const SUB = SUBSTRINGS.map(aggr);
const SUB_MILD = SUBSTRINGS_MILD.map(mild);

const LINK_RE = /\b(?:https?|www)\b|\.(?:com|net|org|br|gg|io|me|co|tv|xyz|link)\b|(?:^|\s)@\w/i;

/* Retorna { ok:true } ou { ok:false, reason } com reason em
 * "plain" | "link" | "digits" | "reserved" | "profanity".  Espera o nome JÁ sanitizado. */
export function moderateName(name) {
  const raw = String(name ?? "");
  if ((raw.match(/[\p{L}0-9]/gu) ?? []).length < 2) return { ok: false, reason: "plain" };       // só pontuação
  if (LINK_RE.test(raw)) return { ok: false, reason: "link" };
  if (raw.replace(/\D/g, "").length >= 9) return { ok: false, reason: "digits" };               // telefone/contato

  const text = leet(strip(raw));
  const parts = text.split(/[^a-z]+/).filter(Boolean);
  const compact = parts.join("");
  // "p.o.r.r.a": 3+ letras soltas em sequência viram uma palavra só antes de comparar
  const tokens = [];
  for (let i = 0; i < parts.length; ) {
    let j = i;
    while (j < parts.length && parts[j].length === 1) j++;
    if (j - i >= 3) { tokens.push(parts.slice(i, j).join("")); i = j; } else { tokens.push(parts[i]); i++; }
  }
  if (tokens.some((t) => RESERVED_SET.has(aggr(t)))) return { ok: false, reason: "reserved" };
  if (tokens.some((t) => WORD_SET.has(aggr(t)) || RAW_SET.has(t))) return { ok: false, reason: "profanity" };
  const a = aggr(compact), m = mild(compact);
  if (SUB.some((w) => a.includes(w)) || SUB_MILD.some((w) => m.includes(w))) return { ok: false, reason: "profanity" };
  return { ok: true };
}

export const NAME_BLOCKED_MESSAGE = "Esse nome não é permitido. Escolha outro (sem palavrões, links ou contatos).";

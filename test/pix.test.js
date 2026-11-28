/* PIX estático (BR Code) + QR code, tudo gerado no navegador, sem serviço de terceiros. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { crc16, brCode, chavePixValida, tlv } from "../site/js/pix.js";
import { qrMatrix, qrSvg } from "../site/js/qr.js";
import { APOIO } from "../site/js/apoio-config.js";

const CHAVE = "2376bee9-7825-4e2f-9ab2-7dd83bd5e946";

/* Lê o BR Code de volta (campo → valor), para conferir o que foi escrito. */
function ler(s) {
  const o = {};
  for (let i = 0; i < s.length;) { const id = s.slice(i, i + 2), n = Number(s.slice(i + 2, i + 4)); o[id] = s.slice(i + 4, i + 4 + n); i += 4 + n; }
  return o;
}

test("crc16: valor de referência do CRC-16/CCITT-FALSE ('123456789' → 29B1)", () => {
  assert.equal(crc16("123456789"), "29B1");
  assert.equal(crc16(""), "FFFF");
});

test("tlv: id + tamanho com 2 dígitos + valor", () => {
  assert.equal(tlv("00", "01"), "000201");
  assert.equal(tlv("59", "ABC"), "5903ABC");
});

test("chavePixValida: aceita chave aleatória (UUID), recusa lixo", () => {
  assert.ok(chavePixValida(CHAVE));
  assert.ok(chavePixValida(CHAVE.toUpperCase()));
  for (const ruim of ["", "abc", "2376bee9-7825-4e2f-9ab2-7dd83bd5e94", CHAVE + "0", `<${CHAVE}>`, null, undefined, 123]) assert.ok(!chavePixValida(ruim), String(ruim));
});

test("brCode: estrutura do PIX estático e CRC fecham", () => {
  const code = brCode({ chave: CHAVE, nome: "Minha LineUp", cidade: "Brasil" });
  const f = ler(code);
  assert.equal(f["00"], "01");                       // versão do payload
  assert.equal(f["01"], "11");                       // 11 = reutilizável (QR fixo)
  const conta = ler(f["26"]);
  assert.equal(conta["00"], "br.gov.bcb.pix");
  assert.equal(conta["01"], CHAVE);                  // a chave é minúscula, como no registro
  assert.equal(f["52"], "0000");
  assert.equal(f["53"], "986");                      // BRL
  assert.equal(f["58"], "BR");
  assert.equal(f["59"], "MINHA LINEUP");             // maiúsculas, sem acento, até 25
  assert.equal(f["60"], "BRASIL");                   // até 15
  assert.equal(ler(f["62"])["05"], "***");           // sem identificador: serve para qualquer doação
  assert.ok(!("54" in f), "sem valor: quem doa escolhe quanto");
  assert.match(code, /6304[0-9A-F]{4}$/);
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)));
});

test("brCode: nome e cidade são limpos (acento, símbolos, tamanho) e a chave inválida é recusada", () => {
  const f = ler(brCode({ chave: CHAVE, nome: "Açaí & Cia — Lineup do Zé com nome enorme", cidade: "São José dos Pinhais do Sul" }));
  assert.ok(f["59"].length <= 25 && /^[A-Z0-9 ]+$/.test(f["59"]), f["59"]);
  assert.ok(f["60"].length <= 15 && /^[A-Z0-9 ]+$/.test(f["60"]), f["60"]);
  assert.equal(ler(brCode({ chave: CHAVE, nome: "Ação", cidade: "São Paulo" }))["59"], "ACAO");
  assert.throws(() => brCode({ chave: "x", nome: "A", cidade: "B" }), /chave/i);
});

test("a configuração do apoio: chave válida e o BR Code dela fecha", () => {
  assert.ok(chavePixValida(APOIO.pixKey), "chave Pix da configuração");
  const code = brCode({ chave: APOIO.pixKey, nome: APOIO.nome, cidade: APOIO.cidade });
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)));
});

/* ------------------------------------ QR ------------------------------------ */
const bit = (m, x, y) => m[y][x];

test("qrMatrix: tamanho 17+4·versão, módulos finder nos três cantos, linha de sincronismo", () => {
  const m = qrMatrix("HELLO");
  assert.equal(m.length, 21);
  assert.ok(m.every((l) => l.length === 21));
  for (const [ox, oy] of [[0, 0], [14, 0], [0, 14]]) {
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
      const borda = i === 0 || i === 6 || j === 0 || j === 6, miolo = i >= 2 && i <= 4 && j >= 2 && j <= 4;
      assert.equal(bit(m, ox + j, oy + i), borda || miolo, `finder ${ox},${oy} em ${j},${i}`);
    }
  }
  for (let i = 8; i < 13; i++) { assert.equal(bit(m, i, 6), i % 2 === 0); assert.equal(bit(m, 6, i), i % 2 === 0); }
  assert.equal(bit(m, 8, 13), true, "módulo escuro fixo");
});

test("qrMatrix: cresce de versão conforme o texto e recusa o que não cabe", () => {
  assert.equal(qrMatrix("A".repeat(14)).length, 21);                 // versão 1 (14 bytes, nível M)
  assert.equal(qrMatrix("A".repeat(15)).length, 25);                 // versão 2
  const code = brCode({ chave: CHAVE, nome: "Minha LineUp", cidade: "Brasil" });
  const n = qrMatrix(code).length;
  assert.ok(n >= 45 && n <= 57 && (n - 17) % 4 === 0, `versão inesperada: ${n}`);
  assert.throws(() => qrMatrix("A".repeat(300)), /grande/i);
});

test("qrMatrix: é determinístico e o do PIX da configuração não mudou sem querer (conferido com um leitor de QR)", () => {
  const code = brCode({ chave: APOIO.pixKey, nome: APOIO.nome, cidade: APOIO.cidade });
  const flat = () => qrMatrix(code).map((l) => l.map((b) => (b ? "1" : "0")).join("")).join("\n");
  assert.equal(flat(), flat());
  assert.equal(createHash("sha256").update(flat()).digest("hex"), GOLDEN,
    "o QR do PIX mudou: se foi de propósito (chave, nome ou cidade novos), confira com um leitor de QR e atualize GOLDEN");
});

test("qrSvg: SVG com zona silenciosa, só preto e branco, acessível e sem nada de fora", () => {
  const svg = qrSvg("HELLO");
  assert.match(svg, /^<svg [^>]*viewBox="0 0 29 29"/);                // 21 + 2·4 de borda
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="[^"]+"/);
  assert.ok(!/https?:|<script|<image|xlink/i.test(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")), "nada de recurso externo");
  assert.match(svg, /fill="#000"/);
  assert.match(svg, /fill="#fff"/);
});

/* Conferido em 2026-11-28 decodificando o QR com jsQR (leitor independente). */
const GOLDEN = "e95c5397105997dde65c2672d0b7d68dffff626c011a98f5d2e58fbc84f1d5b6";

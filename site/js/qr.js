/* Gerador de QR code (modo byte, correção de erro M, versões 1 a 10): o suficiente para o BR Code do Pix.
 * Local e sem dependências. A saída é conferida em test/pix.test.js e com um leitor de QR de verdade. */

/* Por versão (nível M): [palavras de EC por bloco, [nº de blocos, dados por bloco], [nº de blocos longos, dados por bloco longo]] */
const M = [null,
  [10, [1, 16], [0, 0]], [16, [1, 28], [0, 0]], [26, [1, 44], [0, 0]], [18, [2, 32], [0, 0]], [24, [2, 43], [0, 0]],
  [16, [4, 27], [0, 0]], [18, [4, 31], [0, 0]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
const ALINHAMENTO = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const dadosTotal = (v) => M[v][1][0] * M[v][1][1] + M[v][2][0] * M[v][2][1];
const capacidade = (v) => Math.floor((dadosTotal(v) * 8 - 4 - (v < 10 ? 8 : 16)) / 8);

/* Aritmética em GF(256) (polinômio 0x11D) e Reed-Solomon. */
const EXP = new Array(512), LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function restoRS(dados, grau) {
  const div = new Array(grau).fill(0); div[grau - 1] = 1;
  for (let i = 0, raiz = 1; i < grau; i++) {
    for (let j = 0; j < grau; j++) { div[j] = mul(div[j], raiz); if (j + 1 < grau) div[j] ^= div[j + 1]; }
    raiz = mul(raiz, 2);
  }
  const r = new Array(grau).fill(0);
  for (const b of dados) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < grau; i++) r[i] ^= mul(div[i], f); }
  return r;
}

function palavras(bytes, v) {
  const bits = [];
  const poe = (valor, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  poe(0b0100, 4); poe(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) poe(b, 8);
  const total = dadosTotal(v) * 8;
  for (let i = 0; i < 4 && bits.length < total; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const dados = [];
  for (let i = 0; i < bits.length; i += 8) dados.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; dados.length < dadosTotal(v); pad ^= 0xec ^ 0x11) dados.push(pad);

  const [ec, [nCurtos, tamCurto], [nLongos, tamLongo]] = M[v];
  const blocos = []; let pos = 0;
  for (let i = 0; i < nCurtos + nLongos; i++) { const t = i < nCurtos ? tamCurto : tamLongo; blocos.push(dados.slice(pos, pos + t)); pos += t; }
  const ecs = blocos.map((b) => restoRS(b, ec)), saida = [];
  for (let i = 0; i < tamLongo || i < tamCurto; i++) for (const b of blocos) if (i < b.length) saida.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of ecs) saida.push(e[i]);
  return saida;
}

const MASCARAS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];

function penalidade(m) {
  const n = m.length; let p = 0, escuros = 0;
  const linha = (get) => {
    let corrida = 1;
    for (let i = 1; i < n; i++) { if (get(i) === get(i - 1)) { corrida++; if (corrida === 5) p += 3; else if (corrida > 5) p++; } else corrida = 1; }
    const s = Array.from({ length: n }, (_, i) => (get(i) ? 1 : 0)).join("");
    for (const pad of ["10111010000", "00001011101"]) for (let i = s.indexOf(pad); i >= 0; i = s.indexOf(pad, i + 1)) p += 40;
  };
  for (let a = 0; a < n; a++) { linha((i) => m[a][i]); linha((i) => m[i][a]); }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) escuros++;
    if (x + 1 < n && y + 1 < n && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
  }
  return p + Math.floor(Math.abs(escuros * 100 / (n * n) - 50) / 5) * 10;
}

/* A matriz do QR: matriz[y][x] é true quando o módulo é escuro. */
export function qrMatrix(texto) {
  const bytes = [...new TextEncoder().encode(String(texto))];
  let v = 1; while (v <= 10 && capacidade(v) < bytes.length) v++;
  if (v > 10) throw new Error("texto grande demais para o QR");
  const n = 17 + 4 * v, dados = palavras(bytes, v);
  const m = Array.from({ length: n }, () => new Array(n).fill(false)), fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (x, y, escuro) => { m[y][x] = escuro; fn[y][x] = true; };

  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
    if (x >= 0 && x < n && y >= 0 && y < n) set(x, y, d !== 2 && d !== 4);
  }
  const al = ALINHAMENTO[v];
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formato = (mascara) => {                                                  // nível M = 0b00
    const d = mascara; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const bits = ((d << 10) | r) ^ 0x5412, b = (i) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, b(i));
    set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, b(i));
    set(8, n - 8, true);
  };
  formato(0);                                                                     // reserva a área
  if (v >= 7) {
    let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const bits = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const a = n - 11 + (i % 3), b = Math.floor(i / 3), e = ((bits >>> i) & 1) !== 0; set(a, b, e); set(b, a, e); }
  }
  for (let i = 0, direita = n - 1; direita >= 1; direita -= 2) {
    if (direita === 6) direita = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = direita - j, y = ((direita + 1) & 2) === 0 ? n - 1 - vert : vert;
      if (!fn[y][x] && i < dados.length * 8) { m[y][x] = ((dados[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
    }
  }
  let melhor = null, pior = Infinity;
  for (let k = 0; k < 8; k++) {
    const c = m.map((l) => l.slice());
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y][x] && MASCARAS[k](x, y)) c[y][x] = !c[y][x];
    const antes = m.map((l) => l.slice()); for (let y = 0; y < n; y++) m[y] = c[y].slice();
    formato(k); const p = penalidade(m);
    if (p < pior) { pior = p; melhor = m.map((l) => l.slice()); }
    for (let y = 0; y < n; y++) m[y] = antes[y];
  }
  return melhor;
}

/* O QR como SVG (fundo branco e zona silenciosa de 4 módulos: precisa ser branco mesmo no tema escuro). */
export function qrSvg(texto, rotulo = "QR code") {
  const m = qrMatrix(texto), n = m.length, t = n + 8; let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  const esc = String(rotulo).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" role="img" aria-label="${esc}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

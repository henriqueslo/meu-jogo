import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../site/", import.meta.url));
const read = (p) => readFileSync(join(SITE, p), "utf8");
const pages = readdirSync(SITE).filter((f) => f.endsWith(".html"));

test("nenhuma página carrega CSS/JS/fonte de terceiros (links <a> para fora são permitidos)", () => {
  for (const p of pages) {
    const html = read(p);
    assert.ok(!/<link[^>]+href=["']https?:\/\//i.test(html), `${p}: <link> externo`);
    assert.ok(!/<script[^>]+src=["']https?:\/\//i.test(html), `${p}: <script> externo`);
    assert.ok(!/<img[^>]+src=["']https?:\/\//i.test(html), `${p}: <img> externa`);
    assert.ok(!/@import\s+url\(["']?https?:/i.test(html), `${p}: @import externo`);
  }
  for (const css of readdirSync(join(SITE, "css")).concat(["pagina.css"])) {
    const txt = read(css === "pagina.css" ? css : "css/" + css);
    assert.ok(!/url\(["']?https?:\/\//i.test(txt) && !/@import/.test(txt), `${css}: recurso externo`);
  }
});

test("toda página usa as fontes locais", () => {
  for (const p of pages) assert.ok(read(p).includes('href="/css/fonts.css"'), p);
});

test("fonts.css: todos os arquivos existem, são woff2 válidos e leves", () => {
  const css = read("css/fonts.css");
  const files = [...css.matchAll(/url\(\/fonts\/([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(files.length >= 8);
  let total = 0;
  for (const f of new Set(files)) {
    const path = join(SITE, "fonts", f);
    assert.ok(existsSync(path), "falta " + f);
    assert.equal(readFileSync(path).subarray(0, 4).toString("latin1"), "wOF2", f + " não é woff2");
    total += statSync(path).size;
  }
  assert.ok(total < 300 * 1024, "fontes pesadas demais: " + total);
  for (const fam of ["Rajdhani", "JetBrains Mono"]) assert.ok(css.includes(`'${fam}'`), fam);
  assert.ok(existsSync(join(SITE, "fonts/LICENSES.txt")) && /Open Font License/.test(read("fonts/LICENSES.txt")));
});

test("CSP não libera mais o Google Fonts e continua restritivo", () => {
  const h = read("_headers");
  const csp = h.split("\n").find((l) => l.includes("Content-Security-Policy"));
  assert.ok(!/googleapis|gstatic/.test(csp));
  assert.match(csp, /font-src 'self';/);
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.ok(!/unsafe-eval/.test(csp));
});

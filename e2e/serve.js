/* Servidor estático mínimo para os testes de interface (sem dependências).
 * Serve ./site com a MESMA Content-Security-Policy de produção (lida de site/_headers), para que
 * os testes também detectem violações de CSP. URLs limpas (/majors -> majors.html). */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../site/", import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };

const headers = await readFile(join(ROOT, "_headers"), "utf8");
const csp = headers.split("\n").find((l) => l.includes("Content-Security-Policy:"))?.replace(/^\s*Content-Security-Policy:\s*/, "").trim();

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    if (!extname(p)) p += ".html";
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store", ...(csp ? { "content-security-policy": csp } : {}) });
    res.end(body);
  } catch { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); }
}).listen(PORT, "127.0.0.1", () => console.log(`site em http://127.0.0.1:${PORT}`));

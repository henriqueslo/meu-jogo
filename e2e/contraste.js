/* Auditor de contraste (WCAG AA) que roda DENTRO da página: para cada texto visível calcula a razão entre a cor do texto e a
 * cor de fundo efetiva (camadas de fundo, com transparência e opacidade; degradês contam pela média das cores).
 * Mínimo 4,5:1 (3:1 para texto grande). Controles desligados e a etiqueta de raridade (degradê metálico) ficam de fora. */
export async function auditar(page, { min = 4.5 } = {}) {
  return page.evaluate((min) => {
    const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    const sobre = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const camada = (el) => {
      const cs = getComputedStyle(el), c = parse(cs.backgroundColor);
      if (c && c.a > 0) return c;
      if (cs.backgroundImage && cs.backgroundImage !== "none") {
        const cores = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter(Boolean);
        if (cores.length) { const n = cores.length; return { r: cores.reduce((s, x) => s + x.r, 0) / n, g: cores.reduce((s, x) => s + x.g, 0) / n, b: cores.reduce((s, x) => s + x.b, 0) / n, a: cores.reduce((s, x) => s + x.a, 0) / n }; }
      }
      return null;
    };
    const fundo = (el) => {
      const camadas = [];
      for (let e = el; e; e = e.parentElement) { const c = camada(e); if (c) { camadas.push(c); if (c.a >= 1) break; } }
      let acc = parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
      if (acc.a < 1) acc = sobre(acc, { r: 255, g: 255, b: 255, a: 1 });
      for (const c of camadas.reverse()) acc = sobre(c, acc);
      return acc;
    };
    const opacidade = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
    const falhas = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!el.getClientRects().length || el.closest(".badge, [disabled], [hidden]") || el.matches("script, style, svg *")) continue;
      const texto = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
      if (!texto) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || el.closest("button:disabled")) continue;
      const bg = fundo(el), fgc = parse(cs.color); if (!fgc) continue;
      const fg = sobre({ ...fgc, a: fgc.a * opacidade(el) }, bg);
      const px = parseFloat(cs.fontSize), grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      const r = razao(fg, bg);
      if (r < (grande ? Math.min(3, min) : min)) falhas.push({ el: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""), texto: texto.slice(0, 40), razao: Math.round(r * 100) / 100, fg: cs.color });
    }
    return falhas;
  }, min);
}

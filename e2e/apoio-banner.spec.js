/* Banner "APOIE O PROJETO ❤️" acima do rodapé: largura total, cores invertidas em relação ao tema. */
import { test, expect } from "@playwright/test";
import { auditar } from "./contraste.js";

const PAGINAS = ["/", "/sobre.html", "/privacidade.html", "/termos.html", "/majors.html", "/funcoes.html", "/formato-suico.html", "/ranking"];
const banner = (page) => page.getByRole("link", { name: /APOIE O PROJETO/ }).and(page.locator(".apoio-banner"));
const luz = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const cores = (page) => page.locator(".apoio-banner").evaluate((el) => { const c = getComputedStyle(el); return { fundo: c.backgroundColor, texto: c.color }; });

test("todas as páginas têm o banner, com o coração, acima do rodapé e levando a /apoie.html", async ({ page }) => {
  for (const p of PAGINAS) {
    await page.goto(p);
    const b = banner(page);
    await expect(b, p).toBeVisible();
    await expect(b, p).toContainText("APOIE O PROJETO");
    await expect(b, p).toContainText("❤️");
    await expect(b, p).toHaveAttribute("href", "/apoie.html");
    const bb = await b.boundingBox(), rodape = await page.locator("footer").boundingBox();
    expect(bb.y + bb.height, `${p}: banner acima do rodapé`).toBeLessThanOrEqual(rodape.y + 1);
  }
});

test("a própria página de apoio não repete o banner", async ({ page }) => {
  await page.goto("/apoie.html");
  await expect(page.locator(".apoio-banner")).toHaveCount(0);
});

for (const largura of [320, 375, 1280]) {
  test(`o banner pega a tela toda (${largura}px), tem alvo de toque ≥ 44px e não cria rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 800 });
    for (const p of ["/", "/sobre.html"]) {
      await page.goto(p);
      const bb = await banner(page).boundingBox();
      expect(bb.x, p).toBeLessThanOrEqual(0.5);
      expect(Math.round(bb.width), p).toBe(largura);
      expect(bb.height, p).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), p).toBeLessThanOrEqual(0);
    }
  });
}

test("tema escuro (padrão): banner BRANCO com texto escuro", async ({ page }) => {
  await page.goto("/");
  const c = await cores(page);
  expect(luz(c.fundo), c.fundo).toBeGreaterThan(0.85);
  expect(luz(c.texto), c.texto).toBeLessThan(0.15);
});

test("tema claro: banner PRETO com texto claro, e troca ao vivo pelo botão", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /modo claro/i }).click();
  const c = await cores(page);
  expect(luz(c.fundo), c.fundo).toBeLessThan(0.15);
  expect(luz(c.texto), c.texto).toBeGreaterThan(0.85);
  await page.getByRole("button", { name: /modo escuro/i }).click();
  expect(luz((await cores(page)).fundo)).toBeGreaterThan(0.85);
});

for (const tema of ["dark", "light"]) {
  test(`contraste AA no banner e nas páginas, modo ${tema === "light" ? "claro" : "escuro"}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("ml_theme", t), tema);
    for (const p of ["/", "/sobre.html"]) {
      await page.goto(p);
      const falhas = await auditar(page);
      expect(falhas, `${p}: ${falhas.map((f) => `${f.razao} ${f.el} "${f.texto}"`).join(" | ")}`).toEqual([]);
    }
  });
}

test("o banner funciona no teclado e leva à página", async ({ page }) => {
  await page.goto("/sobre.html");
  await banner(page).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/apoie\.html$/);
});

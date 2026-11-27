/* Fase C2 (docs/UX-AUDIT.md, U-10): a tela do time dá CONTEXTO para escolher o estilo.
 *   força do time vs. adversários · cada estilo em linguagem simples, com os números do motor ·
 *   sugestão conforme a força (o padrão continua Tático). */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";
import { SEEDS } from "./seeds.js";
import { STYLE_INFO } from "../site/js/engine.js";

test.use({ viewport: { width: 375, height: 812 } });

async function telaDoTime(page, seed) {
  const game = new GamePage(page);
  await game.useSeed(seed);
  await game.open(); await game.startFreePlay(); await game.draftAll();
  return game;
}
const forca = (page) => page.getByRole("region", { name: /Força do time/ });
const estilo = (page, nome) => page.getByRole("radio", { name: nome });

test("força do time: número = média dos 5 jogadores, comparada com os adversários", async ({ page }) => {
  await telaDoTime(page, SEEDS.forca.acima);
  await expect(forca(page)).toBeVisible();
  const notas = (await page.locator("#team-final .rating").allInnerTexts()).map(Number);
  expect(notas).toHaveLength(5);
  const media = Math.round(notas.reduce((a, b) => a + b, 0) / 5);
  await expect(forca(page).locator(".strength-num")).toHaveText(String(media));
  await expect(forca(page)).toContainText(/média dos adversários 84/);
  await expect(forca(page)).toContainText(/mais forte que 74% das lineups históricas/);
});

test("nível da força em palavras: acima / na média / abaixo", async ({ page }) => {
  for (const [nivel, texto] of [["acima", /Acima da média/], ["media", /Na média/], ["abaixo", /Abaixo da média/]]) {
    await telaDoTime(page, SEEDS.forca[nivel]);
    await expect(forca(page)).toContainText(texto);
  }
});

test("cada estilo é explicado em linguagem simples, com os números do motor", async ({ page }) => {
  await telaDoTime(page, SEEDS.forca.acima);
  const rush = estilo(page, /Rush/), tatico = estilo(page, /Tático/), aim = estilo(page, /Aim puro/);
  await expect(rush).toContainText(new RegExp(`\\+${STYLE_INFO.rush.bias * 2}%`));      // +2%
  await expect(rush).toContainText(/imprevis|zebra/i);
  await expect(aim).toContainText(new RegExp(`\\+${STYLE_INFO.aim.bias * 2}%`));        // +1%
  await expect(tatico).toContainText(/sem bônus/i);
  await expect(tatico).toContainText(/previs|consistente/i);
  // risco de zebra legível por leitor de tela
  await expect(rush.getByRole("img", { name: /Imprevisibilidade alta/ })).toBeVisible();
  await expect(aim.getByRole("img", { name: /Imprevisibilidade média/ })).toBeVisible();
  await expect(tatico.getByRole("img", { name: /Imprevisibilidade baixa/ })).toBeVisible();
});

test("sugestão: time forte → Tático; médio → Aim; fraco → Rush (uma só etiqueta, com o motivo)", async ({ page }) => {
  for (const [nivel, sugerido, motivo] of [["acima", /Tático/, /acima da média/], ["media", /Aim puro/, /na média/], ["abaixo", /Rush/, /abaixo da média/]]) {
    await telaDoTime(page, SEEDS.forca[nivel]);
    await expect(page.getByText("Sugerido", { exact: true })).toHaveCount(1);
    await expect(estilo(page, sugerido).getByText("Sugerido", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: motivo })).toBeVisible();
  }
});

test("o padrão continua Tático, mesmo quando a sugestão é outra; dá para trocar e a etiqueta fica", async ({ page }) => {
  await telaDoTime(page, SEEDS.forca.abaixo);                    // sugestão: Rush
  await expect(estilo(page, /Tático/)).toBeChecked();
  await expect(page.getByRole("button", { name: /Disputar o Major/ })).toBeEnabled();
  await estilo(page, /Rush/).click();
  await expect(estilo(page, /Rush/)).toBeChecked();
  await expect(estilo(page, /Tático/)).not.toBeChecked();
  await expect(estilo(page, /Rush/).getByText("Sugerido", { exact: true })).toBeVisible();   // continua marcado como sugerido
});

test("estilo escolhido é o que joga: Rush muda o torneio em relação ao Tático (mesma seed)", async ({ page }) => {
  const game = await telaDoTime(page, SEEDS.forca.acima);
  await estilo(page, /Rush/).click();
  await page.getByRole("button", { name: /Disputar o Major/ }).click();
  await page.getByRole("button", { name: /Simular até o fim/ }).click();
  const rush = await page.locator(".journey").innerText();
  await game.playAgain.click();

  await game.startFreePlay(); await game.draftAll();              // mesmo draft (seed fixa), agora Tático
  await page.getByRole("button", { name: /Disputar o Major/ }).click();
  await page.getByRole("button", { name: /Simular até o fim/ }).click();
  const tatico = await page.locator(".journey").innerText();
  expect(rush).not.toEqual(tatico);                               // o estilo realmente entra na simulação
});

test("tela do time: sem rolagem lateral, alvos ≥ 44px e texto ≥ 12px em 320, 375 e 414", async ({ page }) => {
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 800 });
    await telaDoTime(page, SEEDS.forca.abaixo);
    const m = await page.evaluate(() => {
      const vis = (e) => e.getClientRects().length > 0;
      const scope = document.querySelector(".screen.active");
      const small = [...scope.querySelectorAll("button, [role=radio]")].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.height < 44 || r.width < 44).map(({ e }) => (e.id || e.textContent.trim().slice(0, 20)));
      const tiny = [...new Set([...scope.querySelectorAll("*")].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
        .map((e) => `${e.className || e.tagName} ${getComputedStyle(e).fontSize}`))];
      return { small, tiny, overflowX: document.documentElement.scrollWidth - innerWidth };
    });
    expect.soft(m.overflowX, `${width}px: rolagem lateral`).toBeLessThanOrEqual(0);
    expect.soft(m.small, `${width}px: alvos pequenos`).toEqual([]);
    expect.soft(m.tiny, `${width}px: texto pequeno`).toEqual([]);
  }
});

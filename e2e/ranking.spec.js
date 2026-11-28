/* Página do ranking completo do Desafio diário (o "Ver mais" da home). */
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 } });

const linha = (i) => ({ rank: i + 1, team_name: `Time ${i + 1}`, style: "tatico", forca: 80 + (i % 10), wins: 3, losses: i % 3, tier: 3 - (i % 3), champion: true, perfeito: false, squad: [] });
const rows = (n) => Array.from({ length: n }, (_, i) => linha(i));

async function api(page, { day = "2026-11-26", data = rows(12), daily = true, board = true } = {}) {
  await page.route("**/api/v1/daily", (r) => (daily ? r.fulfill({ json: { day, seed: 123456, max_refreshes: 3 } }) : r.fulfill({ status: 500, json: {} })));
  await page.route("**/api/v1/daily/leaderboard**", (r) => (board ? r.fulfill({ json: { day, data } }) : r.fulfill({ status: 500, json: {} })));
}

test("lista o ranking do dia, em ordem, com a data", async ({ page }) => {
  await api(page, { data: rows(12) });
  await page.goto("/ranking");
  await expect(page.getByRole("heading", { level: 1, name: /Ranking/i })).toBeVisible();
  await expect(page.getByText(/2026-11-26|26\/11\/2026/)).toBeVisible();
  const itens = page.getByRole("list", { name: /Ranking/i }).getByRole("listitem");
  await expect(itens).toHaveCount(12);
  await expect(itens.first()).toContainText("Time 1");
  await expect(itens.last()).toContainText("Time 12");
});

test("pede à API até 50 posições", async ({ page }) => {
  let url = "";
  await page.route("**/api/v1/daily", (r) => r.fulfill({ json: { day: "2026-11-26", seed: 1 } }));
  await page.route("**/api/v1/daily/leaderboard**", (r) => { url = r.request().url(); r.fulfill({ json: { day: "2026-11-26", data: [] } }); });
  await page.goto("/ranking");
  await expect.poll(() => url).toMatch(/limit=50/);
});

test("ranking vazio: mensagem amigável", async ({ page }) => {
  await api(page, { data: [] });
  await page.goto("/ranking");
  await expect(page.getByText(/ainda ninguém|nenhum/i)).toBeVisible();
});

test("API fora do ar: avisa sem quebrar a página", async ({ page }) => {
  await api(page, { daily: false, board: false });
  await page.goto("/ranking");
  await expect(page.getByRole("heading", { level: 1, name: /Ranking/i })).toBeVisible();
  await expect(page.getByText(/não foi possível|indispon/i)).toBeVisible();
});

test("nomes de outros jogadores são texto (nada de HTML injetado)", async ({ page }) => {
  await api(page, { data: [{ ...linha(0), team_name: "<img src=x onerror=window.__x=1>" }] });
  await page.goto("/ranking");
  await expect(page.getByRole("listitem").first()).toContainText("<img");
  expect(await page.evaluate(() => window.__x)).toBeUndefined();
});

test("tem o logo para a home e um link 'Voltar ao jogo'", async ({ page }) => {
  await api(page);
  await page.goto("/ranking");
  await expect(page.getByRole("link", { name: /Minha LineUp/i })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: /Voltar ao jogo/i })).toHaveAttribute("href", "/");
});

test("sem rolagem lateral e texto legível em 320, 375 e 414", async ({ page }) => {
  await api(page, { data: rows(30) });
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/ranking");
    await expect(page.getByRole("listitem").first()).toBeVisible();
    const m = await page.evaluate(() => ({ overflowX: document.documentElement.scrollWidth - innerWidth,
      tiny: [...new Set([...document.querySelectorAll("main *")].filter((e) => e.getClientRects().length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.tagName))] }));
    expect.soft(m.overflowX, `${width}px`).toBeLessThanOrEqual(0);
    expect.soft(m.tiny, `${width}px: texto pequeno`).toEqual([]);
  }
});

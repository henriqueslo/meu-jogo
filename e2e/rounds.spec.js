/* Fase C3 (docs/UX-AUDIT.md, U-11): durante o torneio o jogador sempre sabe ONDE ESTÁ.
 *   - painel “Sua campanha” (placar, sequência 🟩🟥 e o que falta) em toda etapa;
 *   - só o jogo dele aparece inteiro; os outros ficam recolhidos;
 *   - “Simular até o fim” para quem já conhece o jogo. */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";
import { SEEDS } from "./seeds.js";

test.use({ viewport: { width: 375, height: 812 } });

const painel = (page) => page.getByRole("region", { name: /Sua campanha/ });
const sequencia = async (page) => ((await painel(page).innerText()).match(/[🟩🟥]/gu) ?? []).join("");

test("painel de campanha: placar, sequência e o que falta, rodada a rodada (campeão 3-0)", async ({ page }) => {
  const game = new GamePage(page);
  await game.playWithSeed(SEEDS.campeao);

  await expect(painel(page)).toBeVisible();
  await expect(painel(page)).toContainText("1-0");
  expect(await sequencia(page)).toBe("🟩");
  await expect(painel(page)).toContainText(/mais 2 vitórias/);          // 3 vitórias classificam
  await expect(painel(page)).toContainText(/mais 3 derrotas/);          // 3 derrotas eliminam

  await game.next.click();
  await expect(painel(page)).toContainText("2-0");
  expect(await sequencia(page)).toBe("🟩🟩");
  await expect(painel(page)).toContainText(/mais 1 vitória\b/);

  await game.next.click();
  await expect(painel(page)).toContainText("3-0");
  await expect(painel(page)).toContainText(/Classificado/);
});

test("painel de campanha: eliminado no suíço (0-3) vê 🟥🟥🟥 e o aviso, e o painel continua depois", async ({ page }) => {
  const game = new GamePage(page);
  await game.playWithSeed(SEEDS.eliminado_0_3);
  await game.next.click(); await game.next.click();
  await expect(painel(page)).toContainText("0-3");
  expect(await sequencia(page)).toBe("🟥🟥🟥");
  await expect(painel(page)).toContainText(/Eliminado na Primeira Fase/);
  await game.next.click();                                              // o torneio segue sem você
  await expect(painel(page)).toBeVisible();
  await expect(painel(page)).toContainText(/Eliminado na Primeira Fase/);
});

test("painel nos playoffs: mostra a fase e, ao cair, onde caiu", async ({ page }) => {
  const game = new GamePage(page);
  await game.playWithSeed(SEEDS.playoffs_e_perdeu);
  let sawPlayoffs = false;
  for (let i = 0; i < 12; i++) {
    if (await page.locator("#screen-results.active").count()) break;
    await expect(painel(page)).toBeVisible();
    const txt = await painel(page).innerText();
    if (/playoffs|quartas|semifinal|final/i.test(txt)) sawPlayoffs = true;
    await game.next.click();
  }
  expect(sawPlayoffs).toBe(true);
});

test("só o seu jogo aparece inteiro; os outros ficam recolhidos e abrem sob demanda", async ({ page }) => {
  const game = new GamePage(page);
  await game.playWithSeed(SEEDS.campeao);
  await expect(page.locator("#sim-content .card.mine")).toHaveCount(1);
  await expect(page.locator("#sim-content .card:not(.mine)")).toHaveCount(0);     // nenhum outro cartão grande
  const outros = page.locator("details.others");
  await expect(outros).toHaveCount(1);
  await expect(outros).not.toHaveAttribute("open", "");
  await expect(outros.locator("summary")).toContainText(/Ver os outros 7 jogos/);
  await outros.locator("summary").click();
  await expect(outros.locator("li")).toHaveCount(7);
  await expect(outros.locator("li").first()).toBeVisible();
});

test("sem jogo seu na etapa (já eliminado), os outros jogos já vêm abertos", async ({ page }) => {
  const game = new GamePage(page);
  await game.playWithSeed(SEEDS.eliminado_0_3);
  await game.next.click(); await game.next.click(); await game.next.click();   // rodadas 2, 3 e a seguinte, sem você
  await expect(page.locator("#sim-content .card.mine")).toHaveCount(0);
  await expect(page.locator("details.others")).toHaveAttribute("open", "");
});

test("'Simular até o fim' leva ao resultado, com o mesmo desfecho de jogar rodada a rodada", async ({ page }) => {
  const game = new GamePage(page);
  await game.playWithSeed(SEEDS.campeao);
  await page.getByRole("button", { name: /Simular até o fim/ }).click();
  await expect(page.locator("#screen-results.active")).toBeVisible();
  await expect(page.locator("#results-content")).toContainText(/CAMPE/i);
});

test("'Simular até o fim' não aparece na final (lá o botão é 'Ver resultado final')", async ({ page }) => {
  const game = new GamePage(page);
  await game.playWithSeed(SEEDS.perfeito);
  for (let i = 0; i < 12; i++) {
    if (await game.next.innerText().then((t) => /ver resultado final/i.test(t))) break;
    await game.next.click();
  }
  await expect(game.next).toContainText(/Ver resultado final/);
  await expect(page.getByRole("button", { name: /Simular até o fim/ })).toHaveCount(0);
});

test("a barra fixa mostra a ação principal e a secundária, ambas à vista", async ({ page }) => {
  const game = new GamePage(page);
  await game.playWithSeed(SEEDS.campeao);
  await expect(game.next).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: /Simular até o fim/ })).toBeInViewport({ ratio: 1 });
});

test("novos controles respeitam alvo de toque 44px e não geram rolagem lateral", async ({ page }) => {
  const game = new GamePage(page);
  await game.playWithSeed(SEEDS.campeao);
  const m = await page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const small = [...document.querySelectorAll(".screen.active button, .screen.active summary")].filter(vis)
      .map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.height < 44).map(({ e, r }) => `${e.id || e.textContent.trim().slice(0, 24)} ${Math.round(r.height)}px`);
    return { small, overflowX: document.documentElement.scrollWidth - innerWidth };
  });
  expect(m.small).toEqual([]);
  expect(m.overflowX).toBeLessThanOrEqual(0);
});

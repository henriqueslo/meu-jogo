/* Fase A da auditoria de UX (docs/UX-AUDIT.md): U-01 sem rolagem lateral, U-03 texto legível,
 * U-04 alvos de toque. Critérios de aceitação, em cada tela e em celulares de 320 a 414 px:
 *   - a página nunca rola de lado;
 *   - todo botão/campo tem pelo menos 44×44 px;
 *   - nenhum texto abaixo de 12 px. */
import { test, expect } from "@playwright/test";
import { GamePage, measureActiveScreen } from "./pages/game.js";

const VIEWPORTS = [{ width: 320, height: 640 }, { width: 375, height: 812 }, { width: 414, height: 896 }];

async function expectHealthy(page, where) {
  const m = await page.evaluate(measureActiveScreen);
  expect.soft(m.overflowX, `${where}: rolagem lateral de ${m.overflowX}px`).toBeLessThanOrEqual(0);
  expect.soft(m.small, `${where}: alvos de toque menores que 44px`).toEqual([]);
  expect.soft(m.tiny, `${where}: texto menor que 12px`).toEqual([]);
}

for (const viewport of VIEWPORTS) {
  test.describe(`celular ${viewport.width}px`, () => {
    test.use({ viewport });

    test("tela inicial com os modos online visíveis", async ({ page }) => {
      const game = new GamePage(page);
      await game.stubOnlineApi();
      await game.open();
      await expect(page.getByRole("button", { name: /Criar campeonato/ })).toBeVisible();   // modos online carregaram
      await expectHealthy(page, "início");
      await game.typeName();                                                          // com o nome digitado (botões habilitados)
      await expectHealthy(page, "início com nome");
    });

    test("partida completa, tela por tela", async ({ page }) => {
      const game = new GamePage(page);
      await game.open();
      await game.startFreePlay();
      await expectHealthy(page, "draft");
      await game.draftAll();
      await expectHealthy(page, "lineup pronta");
      await page.getByRole("radio", { name: /Tático/ }).click();
      await expectHealthy(page, "estilo escolhido");
      await page.getByRole("button", { name: /Disputar o Major/ }).click();
      await game.playToResults(async (i) => { await expectHealthy(page, `etapa ${i + 1}`); });
      await expectHealthy(page, "resultado");
    });
  });
}

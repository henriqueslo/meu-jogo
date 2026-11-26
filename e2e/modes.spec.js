/* Tela inicial: duelo 1×1, campeonato (2–8) e “entrar com código” são blocos SEPARADOS.
 * Antes, “Criar campeonato” e o campo de código ficavam empilhados sob o título “Duelo 1 × 1”. */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";

for (const viewport of [{ width: 375, height: 812 }, { width: 1024, height: 768 }]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport });

    test("cada modo tem o seu próprio bloco, com título e explicação", async ({ page }) => {
      const game = new GamePage(page);
      await game.stubOnlineApi();
      await game.open();

      const duelo = page.getByRole("group", { name: /Duelo 1/ });
      const campeonato = page.getByRole("group", { name: /Campeonato/ });
      const codigo = page.getByRole("group", { name: /Entrar com um código/i });

      await expect(duelo).toBeVisible();
      await expect(campeonato).toBeVisible();
      await expect(codigo).toBeVisible();

      // cada ação mora só no seu bloco
      await expect(duelo.getByRole("button", { name: /Criar duelo/ })).toBeVisible();
      await expect(duelo.getByRole("button", { name: /Criar campeonato/ })).toHaveCount(0);
      await expect(campeonato.getByRole("button", { name: /Criar campeonato/ })).toBeVisible();
      await expect(campeonato.getByRole("button", { name: /Criar duelo/ })).toHaveCount(0);
      await expect(codigo.getByLabel("Código da sala")).toBeVisible();
      await expect(codigo.getByRole("button", { name: /^Entrar/ })).toBeVisible();
      await expect(duelo.getByLabel("Código da sala")).toHaveCount(0);
      await expect(campeonato.getByLabel("Código da sala")).toHaveCount(0);

      // cada bloco explica o que é, em uma frase
      await expect(duelo).toContainText(/2 jogadores|dois jogadores/i);
      await expect(campeonato).toContainText(/2 a 8 jogadores/);
      await expect(codigo).toContainText(/duelo ou campeonato|duelo e campeonato/i);
    });

    test("os blocos não se misturam visualmente: caixas separadas, sem sobreposição", async ({ page }) => {
      const game = new GamePage(page);
      await game.stubOnlineApi();
      await game.open();
      const boxes = [];
      for (const name of [/Duelo 1/, /Campeonato/, /Entrar com um código/i]) {
        const b = await page.getByRole("group", { name }).boundingBox();
        expect(b, `bloco ${name}`).not.toBeNull();
        boxes.push(b);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `blocos ${i} e ${j} se sobrepõem`).toBe(false);
      }
      // sem rolagem lateral
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    });
  });
}

test("criar duelo e criar campeonato continuam funcionando, cada um no seu caminho", async ({ page }) => {
  const game = new GamePage(page);
  await game.stubOnlineApi();
  const calls = [];
  await page.route("**/api/v1/rooms", (r) => { calls.push("rooms"); r.fulfill({ status: 201, json: { code: "AAAAAA" } }); });
  await page.route("**/api/v1/cups", (r) => { calls.push("cups"); r.fulfill({ status: 201, json: { code: "BBBBBB" } }); });
  await page.routeWebSocket(/\/api\/v1\/(rooms|cups)\/[A-Z]+\/ws/, () => {});   // sem servidor: só queremos ver para onde vai
  await game.open();
  await game.typeName("Time Teste");
  await page.getByRole("group", { name: /Campeonato/ }).getByRole("button", { name: /Criar campeonato/ }).click();
  await expect(page.getByText(/Campeonato · sala BBBBBB/i)).toBeVisible();
  expect(calls).toEqual(["cups"]);
});

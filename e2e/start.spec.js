/* O nome do time é escolhido pela pessoa (sem nome padrão) e trava o jogo enquanto não existe.
 * A estrutura da home (blocos, Top 5, logo) está em home.spec.js. */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";

test.use({ viewport: { width: 375, height: 812 } });

const jogar = (page) => page.getByRole("button", { name: /^Jogar agora/ });

/* ----------------------------- nome: a pessoa escolhe (sem nome padrão) ----------------------------- */
test("o campo de nome começa vazio e explica que é a pessoa quem escolhe", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  await expect(game.nameInput).toHaveValue("");
  await expect(page.getByText(/escolha um nome/i).first()).toBeVisible();
});

test("sem nome o jogo não começa: explica, leva o foco ao campo e não abre o draft", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  await jogar(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /nome/i })).toBeVisible();
  await expect(game.nameInput).toBeFocused();
  await expect(page.getByText(/Escolha 1 de 5/)).toBeHidden();
});

test("nome só com espaços ou símbolos também trava", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  await game.nameInput.fill("   @@@  ");
  await jogar(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /nome/i })).toBeVisible();
  await expect(page.getByText(/Escolha 1 de 5/)).toBeHidden();
});

test("com o nome escolhido, um toque em Jogar agora abre o draft", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  await game.nameInput.fill("Falcons BR");
  await jogar(page).click();
  await expect(page.getByText(/Escolha 1 de 5/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ml_name"))).toBe("Falcons BR");
});

test("o último nome usado volta na próxima visita", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  await game.nameInput.fill("Furia Test");
  await jogar(page).click();
  await expect(page.getByText(/Escolha 1 de 5/)).toBeVisible();
  await page.reload();
  await expect(game.nameInput).toHaveValue("Furia Test");
});

/* ----------------------------- como jogar ----------------------------- */
test("a tela inicial inteira cabe sem rolar muito: 'Como jogar' começa perto da dobra", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(h).toBeLessThan(1100);                                // antes das regras recolhidas eram ~2500 px
});


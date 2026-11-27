/* Fase C1 (docs/UX-AUDIT.md, U-06): tela inicial enxuta.
 *   o primeiro toque já joga (nome sugerido) · ordem clara: Jogar → Desafio do dia → Jogar com amigos ·
 *   “Como jogar” em 3 passos, com as regras completas recolhidas. */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";

test.use({ viewport: { width: 375, height: 812 } });

const jogar = (page) => page.getByRole("button", { name: /^Jogar/ });
const desafio = (page) => page.getByRole("button", { name: /Desafio do dia/ });
const amigos = (page) => page.getByText("Jogar com amigos", { exact: true });
const regras = (page) => page.getByText(/prorrogação/);

/* ----------------------------- primeiro toque ----------------------------- */
test("o nome já vem sugerido: um toque em Jogar abre o draft, sem digitar nada", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  await expect(game.nameInput).not.toHaveValue("");
  await jogar(page).click();
  await expect(page.getByText(/Escolha 1 de 5/)).toBeVisible();
});

test("o nome sugerido é editável e o campo diz que é uma sugestão", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  await expect(page.getByText(/sugest/i).first()).toBeVisible();
  await game.nameInput.fill("Falcons BR");
  await jogar(page).click();
  await expect(page.getByText(/Escolha 1 de 5/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ml_name"))).toBe("Falcons BR");   // o nome editado é o que vale
});

test("apagar o nome continua explicando o que fazer (não fica botão morto)", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  await game.nameInput.fill("");
  await jogar(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /nome/i })).toBeVisible();
  await expect(game.nameInput).toBeFocused();
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

/* ----------------------------- ordem das ações ----------------------------- */
test("sem modos online: só 'Jogar' (nada de Desafio do dia nem de amigos)", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  await expect(jogar(page)).toBeVisible();
  await expect(desafio(page)).toBeHidden();
  await expect(amigos(page)).toBeHidden();
});

test("com modos online: Jogar → Desafio do dia → Jogar com amigos, e os dois primeiros cabem na primeira tela", async ({ page }) => {
  const game = new GamePage(page);
  await game.stubOnlineApi();
  await game.open();
  await expect(desafio(page)).toBeVisible();
  await expect(amigos(page)).toBeVisible();
  const y = async (l) => (await l.boundingBox()).y;
  const [yJogar, yDesafio, yAmigos] = [await y(jogar(page)), await y(desafio(page)), await y(amigos(page))];
  expect(yJogar).toBeLessThan(yDesafio);
  expect(yDesafio).toBeLessThan(yAmigos);
  await expect(jogar(page)).toBeInViewport({ ratio: 1 });
  await expect(desafio(page)).toBeInViewport({ ratio: 1 });
  await expect(jogar(page)).toHaveClass(/primary/);          // uma única ação primária
});

/* ----------------------------- como jogar ----------------------------- */
test("'Como jogar' são 3 passos curtos; as regras completas ficam recolhidas", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  const passos = page.getByRole("list", { name: /Como jogar/ }).getByRole("listitem");
  await expect(passos).toHaveCount(3);
  await expect(passos.nth(0)).toContainText(/5 jogadores|lineup/i);
  await expect(passos.nth(1)).toContainText(/estilo/i);
  await expect(passos.nth(2)).toContainText(/Major/);
  await expect(regras(page)).toBeHidden();
  await page.getByText(/Ver as regras completas/).click();
  await expect(regras(page)).toBeVisible();
  await expect(page.getByText(/Major Perfeito/).first()).toBeVisible();
});

test("a tela inicial inteira cabe sem rolar muito: 'Como jogar' começa perto da dobra", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(h).toBeLessThan(1100);                                // antes das regras recolhidas eram ~2500 px
});

/* ----------------------------- layout ----------------------------- */
test("tela inicial: sem rolagem lateral, alvos ≥ 44px e texto ≥ 12px em 320, 375 e 414", async ({ page }) => {
  const game = new GamePage(page);
  await game.stubOnlineApi();
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 800 });
    await game.open();
    await expect(desafio(page)).toBeVisible();
    const m = await page.evaluate(() => {
      const vis = (e) => e.getClientRects().length > 0;
      const scope = document.querySelector(".screen.active");
      const small = [...scope.querySelectorAll("button, summary, input")].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.height < 44).map(({ e, r }) => `${e.id || e.textContent.trim().slice(0, 22)} ${Math.round(r.height)}px`);
      const tiny = [...new Set([...scope.querySelectorAll("*")].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
        .map((e) => `${e.className || e.tagName} ${getComputedStyle(e).fontSize}`))];
      return { small, tiny, overflowX: document.documentElement.scrollWidth - innerWidth };
    });
    expect.soft(m.overflowX, `${width}px: rolagem lateral`).toBeLessThanOrEqual(0);
    expect.soft(m.small, `${width}px: alvos pequenos`).toEqual([]);
    expect.soft(m.tiny, `${width}px: texto pequeno`).toEqual([]);
  }
});

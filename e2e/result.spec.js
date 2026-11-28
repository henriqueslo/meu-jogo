/* Fase C4 (docs/UX-AUDIT.md, U-13 e U-14): o resultado conta a HISTÓRIA do torneio e convida a continuar.
 *   herói à altura do desfecho · jornada rodada a rodada · compartilhar como ação principal ·
 *   “tentar de novo com este time” (só no jogo livre) · convites para campeonato e Desafio diário. */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";
import { SEEDS } from "./seeds.js";

test.use({ viewport: { width: 375, height: 812 } });

async function ateOResultado(game, seed) {
  await game.playWithSeed(seed);
  await game.page.getByRole("button", { name: /Simular até o fim/ }).click();
  await expect(game.page.locator("#screen-results.active")).toBeVisible();
}
const heroi = (page) => page.getByRole("heading", { level: 2 }).first();
const jornada = (page) => page.getByRole("list", { name: /Sua jornada/ });

/* ----------------------------- herói ----------------------------- */
test("campeão invicto: herói 'MAJOR PERFEITO'", async ({ page }) => {
  await ateOResultado(new GamePage(page), SEEDS.perfeito);
  await expect(heroi(page)).toContainText(/MAJOR PERFEITO/);
});

test("campeão (perdeu algum mapa): herói 'CAMPEÃO DO MAJOR' com o recorde do suíço", async ({ page }) => {
  await ateOResultado(new GamePage(page), SEEDS.campeao);
  await expect(heroi(page)).toContainText(/CAMPEÃO DO MAJOR/);
  await expect(heroi(page)).not.toContainText(/PERFEITO/);
  await expect(page.locator(".result-hero")).toContainText(/3-0/);
});

test("eliminado no suíço por pouco: diz quanto faltou e não só 'eliminado'", async ({ page }) => {
  await ateOResultado(new GamePage(page), SEEDS.eliminado_2_3);
  await expect(heroi(page)).toContainText(/Eliminado na Primeira Fase/);
  await expect(page.locator(".result-hero")).toContainText(/a 1 vitória dos playoffs/);
});

test("eliminado sem vitórias: mensagem construtiva (sugere outro estilo/time)", async ({ page }) => {
  await ateOResultado(new GamePage(page), SEEDS.eliminado_0_3);
  await expect(heroi(page)).toContainText(/Eliminado na Primeira Fase/);
  await expect(page.locator(".result-hero")).toContainText(/outro estilo|outro time/i);
});

test("caiu nos playoffs: diz onde caiu e para quem perdeu (o último adversário da jornada)", async ({ page }) => {
  await ateOResultado(new GamePage(page), SEEDS.playoffs_e_perdeu);
  await expect(heroi(page)).toContainText(/Caiu nas quartas|Caiu na semifinal|Vice-campeão/);
  const ultimo = await jornada(page).getByRole("listitem").last().locator(".j-opp").innerText();
  await expect(page.locator(".result-hero")).toContainText(ultimo);
});

/* ----------------------------- jornada ----------------------------- */
test("jornada: uma linha por jogo do jogador, em ordem, com adversário, placar e V/D", async ({ page }) => {
  await ateOResultado(new GamePage(page), SEEDS.campeao);          // 3 do suíço + quartas + semi + final
  const itens = jornada(page).getByRole("listitem");
  await expect(itens).toHaveCount(6);
  await expect(itens.first()).toContainText(/Rodada 1/);
  await expect(itens.last()).toContainText(/Grande final/);
  for (const li of await itens.all()) {
    await expect(li.locator(".j-opp")).not.toHaveText("");
    await expect(li).toContainText(/\d×\d/);
    await expect(li.locator(".j-res")).toHaveText(/^(V|D)$/);
  }
});

test("jornada de quem caiu cedo tem só os jogos que jogou", async ({ page }) => {
  await ateOResultado(new GamePage(page), SEEDS.eliminado_0_3);
  await expect(jornada(page).getByRole("listitem")).toHaveCount(3);
});

/* ----------------------------- ações ----------------------------- */
test("compartilhar é a ação principal, e tudo fica à vista na barra fixa", async ({ page }) => {
  const game = new GamePage(page);
  await ateOResultado(game, SEEDS.campeao);
  await expect(game.share).toHaveClass(/primary/);
  await expect(game.share).toBeInViewport({ ratio: 1 });
  await expect(game.retry).toBeInViewport({ ratio: 1 });
  await expect(game.playAgain).toBeInViewport({ ratio: 1 });
});

test("'Tentar de novo com este time': mesmo elenco, nova simulação (desfecho diferente)", async ({ page }) => {
  const game = new GamePage(page);
  await game.useSeed(SEEDS.retry);                                  // 1º jogo: campeão · 2º torneio: eliminado
  await game.open(); await game.startFreePlay(); await game.draftAll();
  const elenco = await page.locator("#team-final .slot").allInnerTexts();
  await page.getByRole("button", { name: /Disputar o Major/ }).click();
  await page.getByRole("button", { name: /Simular até o fim/ }).click();
  await expect(heroi(page)).toContainText(/CAMPEÃO DO MAJOR/);

  await game.retry.click();
  await expect(page.getByRole("heading", { name: /Sua LineUp está pronta/i })).toBeVisible();   // volta à tela do time
  expect(await page.locator("#team-final .slot").allInnerTexts()).toEqual(elenco);               // MESMO elenco
  await page.getByRole("button", { name: /Disputar o Major/ }).click();
  await page.getByRole("button", { name: /Simular até o fim/ }).click();
  await expect(heroi(page)).toContainText(/Eliminado na Primeira Fase/);                         // outra simulação
});

test("'Montar outro time' começa um draft novo", async ({ page }) => {
  const game = new GamePage(page);
  await ateOResultado(game, SEEDS.campeao);
  await game.playAgain.click();
  await expect(game.begin).toBeVisible();                           // volta à tela inicial
});

/* ----------------------------- convites (só com os modos online) ----------------------------- */
test("sem modos online (API fora do ar) não há convites", async ({ page }) => {
  const game = new GamePage(page);
  await ateOResultado(game, SEEDS.campeao);
  await expect(page.getByRole("region", { name: /E agora/ })).toHaveCount(0);
});

test("com modos online: 'E agora?' convida para campeonato e Desafio diário", async ({ page }) => {
  const game = new GamePage(page);
  await game.stubOnlineApi();
  await page.route("**/api/v1/cups", (r) => r.fulfill({ status: 201, json: { code: "ABC234" } }));
  await page.routeWebSocket(/\/api\/v1\/cups\/ABC234\/ws/, () => {});
  await ateOResultado(game, SEEDS.campeao);
  const agora = page.getByRole("region", { name: /E agora/ });
  await expect(agora).toBeVisible();
  await expect(agora.getByRole("button", { name: /Criar campeonato/ })).toBeVisible();
  await expect(agora.getByRole("button", { name: /Desafio diário/ })).toBeVisible();
  await agora.getByRole("button", { name: /Criar campeonato/ }).click();
  await expect(page.getByText(/Campeonato · sala ABC234/)).toBeVisible();
});

test("o convite para o Desafio diário leva ao draft do desafio", async ({ page }) => {
  const game = new GamePage(page);
  await game.stubOnlineApi();
  await ateOResultado(game, SEEDS.campeao);
  await page.getByRole("region", { name: /E agora/ }).getByRole("button", { name: /Desafio diário/ }).click();
  await expect(page.getByText(/Escolha 1 de 5/)).toBeVisible();
});

/* ----------------------------- Desafio diário: sem rejogar ----------------------------- */
test("no Desafio diário NÃO há 'tentar de novo' (cada um joga uma vez)", async ({ page }) => {
  const game = new GamePage(page);
  await game.stubOnlineApi();
  await game.open(); await game.typeName("Time Teste");
  await page.getByRole("button", { name: /Jogar o desafio/ }).click();
  await game.draftAll();
  await page.getByRole("button", { name: /Disputar o Major/ }).click();
  await page.getByRole("button", { name: /Simular até o fim/ }).click();
  await expect(page.locator("#screen-results.active")).toBeVisible();
  await expect(game.retry).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Enviar ao ranking/ })).toBeVisible();
});

/* ----------------------------- layout ----------------------------- */
test("resultado: sem rolagem lateral, alvos ≥ 44px e texto ≥ 12px", async ({ page }) => {
  const game = new GamePage(page);
  await game.stubOnlineApi();
  await page.route("**/api/v1/cups", (r) => r.fulfill({ status: 201, json: { code: "ABC234" } }));
  await ateOResultado(game, SEEDS.campeao);
  const m = await page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const scope = document.querySelector(".screen.active");
    const small = [...scope.querySelectorAll("button, summary")].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 44).map(({ e, r }) => `${e.id || e.textContent.trim().slice(0, 22)} ${Math.round(r.height)}px`);
    const tiny = [...new Set([...scope.querySelectorAll("*")].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
      .map((e) => `${e.className || e.tagName} ${getComputedStyle(e).fontSize}`))];
    return { small, tiny, overflowX: document.documentElement.scrollWidth - innerWidth };
  });
  expect(m.small).toEqual([]);
  expect(m.tiny).toEqual([]);
  expect(m.overflowX).toBeLessThanOrEqual(0);
});

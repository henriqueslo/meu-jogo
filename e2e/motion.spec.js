/* Fase D3: movimento nos momentos que importam, pensado para o celular (375 px). Com "reduzir movimento"
 * ligado nada se mexe, mas o estado (destaque, aviso de tempo) continua visível. */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";
import { SEEDS } from "./seeds.js";
import { abrirSala, leilao, REVELACAO, comprado } from "./mp.js";
import { auditar } from "./contraste.js";

test.use({ viewport: { width: 375, height: 812 } });

const anim = (loc) => loc.evaluate((el) => getComputedStyle(el).animationName);
const delay = (loc) => loc.evaluate((el) => parseFloat(getComputedStyle(el).animationDelay));

test.describe("com animação ligada", () => {
  test.use({ reducedMotion: "no-preference" });

  test("draft: a ficha que acabou de entrar no elenco 'salta'; a anterior fica quieta", async ({ page }) => {
    const g = new GamePage(page); await g.useSeed(SEEDS.campeao); await g.open(); await g.startFreePlay();
    await g.offers.first().click();
    const novos = page.locator("#slots .slot.fresh");
    await expect(novos).toHaveCount(1);
    expect(await anim(novos.first())).toBe("slotPop");
    await g.offers.first().click();
    await expect(page.locator("#slots .slot.fresh")).toHaveCount(1);
    await expect(page.locator("#slots .slot.filled")).toHaveCount(2);
    expect(await page.locator("#slots .slot.filled:not(.fresh)").count()).toBe(1);
  });

  test("draft: desfazer não destaca ninguém", async ({ page }) => {
    const g = new GamePage(page); await g.useSeed(SEEDS.campeao); await g.open(); await g.startFreePlay();
    await g.offers.first().click(); await g.offers.first().click();
    await g.undo.click();
    await expect(page.locator("#slots .slot.fresh")).toHaveCount(0);
  });

  test("draft: as lineups oferecidas entram em sequência (escalonadas), sem demorar", async ({ page }) => {
    const g = new GamePage(page); await g.open(); await g.startFreePlay();
    const cartoes = page.locator("#lineup-offers .lineup-card");
    await expect(cartoes).toHaveCount(3);
    expect(await anim(cartoes.nth(0))).toBe("cardIn");
    const d = [await delay(cartoes.nth(0)), await delay(cartoes.nth(1)), await delay(cartoes.nth(2))];
    expect(d[0]).toBeLessThan(d[1]); expect(d[1]).toBeLessThan(d[2]);
    expect(d[2]).toBeLessThanOrEqual(0.2);
  });

  test("resultado: o título aparece com destaque e o placar de cada partida entra com um 'pop'", async ({ page }) => {
    const g = new GamePage(page); await g.playWithSeed(SEEDS.campeao);
    expect(await anim(page.locator("#sim-content .score").first())).toBe("scoreIn");
    await page.getByRole("button", { name: /Simular até o fim/ }).click();
    expect(await anim(page.locator(".result-hero"))).toBe("heroIn");
  });

  test("sem rolagem lateral enquanto as animações rodam (375 px)", async ({ page }) => {
    const g = new GamePage(page); await g.open(); await g.startFreePlay();
    for (let i = 0; i < 5; i++) { await g.offers.first().click(); expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0); }
  });

  test("leilão: o jogador novo entra deslizando", async ({ page }) => {
    await abrirSala(page, { kind: "auctions", view: leilao() });
    expect(await anim(page.locator(".lot-card"))).toBe("lotIn");
  });

  test("leilão: depois de enviar o lance a tela NÃO repete a entrada do jogador", async ({ page }) => {
    await abrirSala(page, { kind: "auctions", view: leilao({ submitted: true, bid: 30, canBid: false, why: "submitted" }) });
    expect(await anim(page.locator(".lot-card"))).toBe("none");
  });

  test("leilão: com mais de 5 s o relógio fica normal", async ({ page }) => {
    await abrirSala(page, { kind: "auctions", view: leilao({ msLeft: 12000 }) });
    await expect(page.locator("#auction-timer")).not.toHaveClass(/urgent/);
    await expect(page.locator(".timer-bar")).not.toHaveClass(/urgent/);
  });

  test("leilão: nos últimos 5 s o relógio fica vermelho e pulsa", async ({ page }) => {
    await abrirSala(page, { kind: "auctions", view: leilao({ msLeft: 4000 }) });
    const t = page.locator("#auction-timer");
    await expect(t).toHaveClass(/urgent/);
    expect(await anim(t)).toBe("tick");
    await expect(page.locator(".timer-bar")).toHaveClass(/urgent/);
  });

  test("leilão: na revelação o relógio não pulsa", async ({ page }) => {
    await abrirSala(page, { kind: "auctions", view: leilao({ step: "reveal", msLeft: 3000, last: REVELACAO, canBid: false }) });
    await expect(page.locator("#auction-timer")).not.toHaveClass(/urgent/);
  });

  test("leilão: na revelação, as linhas entram em sequência e a vencedora ganha destaque", async ({ page }) => {
    await abrirSala(page, { kind: "auctions", view: leilao({ step: "reveal", last: REVELACAO, canBid: false }) });
    const linhas = page.locator(".reveal-bids li");
    expect(await linhas.count()).toBeGreaterThanOrEqual(2);
    expect(await anim(linhas.first())).toBe("cardIn");
    expect(await delay(linhas.first())).toBeLessThan(await delay(linhas.nth(1)));
    expect(await anim(page.locator(".reveal-bids li.win b"))).toBe("winPop");
  });
});

test.describe("com 'reduzir movimento' ligado", () => {
  test.use({ reducedMotion: "reduce" });

  test("draft: nada se anima, mas o slot novo continua marcado", async ({ page }) => {
    const g = new GamePage(page); await g.useSeed(SEEDS.campeao); await g.open(); await g.startFreePlay();
    await g.offers.first().click();
    await expect(page.locator("#slots .slot.fresh")).toHaveCount(1);
    for (const sel of ["#slots .slot.fresh", "#lineup-offers .lineup-card"]) expect(await anim(page.locator(sel).first()), sel).toBe("none");
  });

  test("leilão: o relógio em alerta não pulsa, mas continua com cor própria", async ({ page }) => {
    await abrirSala(page, { kind: "auctions", view: leilao({ msLeft: 3000 }) });
    const t = page.locator("#auction-timer");
    await expect(t).toHaveClass(/urgent/);
    expect(await anim(t)).toBe("none");
    expect(await anim(page.locator(".lot-card"))).toBe("none");
    const cor = await t.evaluate((el) => getComputedStyle(el).color), normal = await page.locator(".auction-count").evaluate((el) => getComputedStyle(el).color);
    expect(cor).not.toBe(normal);
  });
});

for (const tema of ["dark", "light"]) {
  test(`contraste AA do relógio em alerta e da ficha em destaque, modo ${tema === "light" ? "claro" : "escuro"}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("ml_theme", t), tema);
    await abrirSala(page, { kind: "auctions", view: leilao({ msLeft: 3000, squad: { IGL: comprado("Fulano", 40) }, coins: 60 }) });
    await expect(page.locator("#auction-timer.urgent")).toBeVisible();
    const falhas = await auditar(page);
    expect(falhas, falhas.map((f) => `${f.razao} ${f.el} "${f.texto}"`).join(" | ")).toEqual([]);
  });
}

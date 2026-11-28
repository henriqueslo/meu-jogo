/* Fase D1 (docs/UX-AUDIT.md): o desktop aproveita a largura (o campeonato: ver desktop-mp.spec.js). Em telas largas (≥1024px) o conteúdo deixa de ser uma
 * única coluna de 640px: início em 2 colunas, draft com o elenco ao lado, campanha ao lado dos jogos, resultado em 2
 * colunas. O celular não muda (coberto pelos outros specs). */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";
import { SEEDS } from "./seeds.js";

const box = async (loc) => { const b = await loc.first().boundingBox(); if (!b) throw new Error("elemento sem caixa (invisível?)"); return { ...b, right: b.x + b.width, bottom: b.y + b.height }; };
const medir = (page) => page.evaluate(() => {
  const vis = (e) => e.getClientRects().length > 0;
  const scope = document.querySelector(".screen.active");
  const small = [...scope.querySelectorAll("button, summary, input, [role=radio]")].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.height < 44).map(({ e, r }) => `${e.id || e.textContent.trim().slice(0, 22)} ${Math.round(r.height)}px`);
  const tiny = [...new Set([...scope.querySelectorAll("*")].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
    .map((e) => `${e.className || e.tagName} ${getComputedStyle(e).fontSize}`))];
  return { small, tiny, overflowX: document.documentElement.scrollWidth - innerWidth };
});

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  test.describe(`desktop ${viewport.width}px`, () => {
    test.use({ viewport });

    test("início sem os modos online: a coluna única fica centrada", async ({ page }) => {
      const g = new GamePage(page);
      await g.open();
      const jogar = await box(g.begin);
      expect(Math.abs(jogar.x + jogar.width / 2 - viewport.width / 2)).toBeLessThan(40);
    });

    test("início: 'Como jogar' em 3 colunas, sem empilhar", async ({ page }) => {
      const g = new GamePage(page);
      await g.open();
      const passos = page.getByRole("list", { name: /Como jogar/ }).getByRole("listitem");
      const [a, b, c] = [await box(passos.nth(0)), await box(passos.nth(1)), await box(passos.nth(2))];
      expect(b.x).toBeGreaterThan(a.right - 1);
      expect(c.x).toBeGreaterThan(b.right - 1);
      expect(Math.abs(a.y - c.y)).toBeLessThan(4);
    });

    test("draft: o elenco fica numa lateral e as ofertas ocupam a área principal", async ({ page }) => {
      const g = new GamePage(page);
      await g.useSeed(SEEDS.campeao); await g.open(); await g.startFreePlay();
      await g.offers.first().click();
      const lateral = await box(page.locator("#slots")), ofertas = await box(page.locator("#lineup-offers"));
      expect(ofertas.x, "ofertas à direita do elenco").toBeGreaterThanOrEqual(lateral.right);
      expect(ofertas.width).toBeGreaterThan(lateral.width * 1.8);
      await expect(page.locator("#lineup-offers .player-chip").first()).toBeInViewport({ ratio: 1 });
    });

    test("draft: as 3 ofertas aparecem sem rolar a página", async ({ page }) => {
      test.skip(viewport.height < 800, "só na altura de 800px");
      const g = new GamePage(page);
      await g.useSeed(SEEDS.campeao); await g.open(); await g.startFreePlay();
      const ofertas = await box(page.locator("#lineup-offers"));
      expect(ofertas.bottom).toBeLessThanOrEqual(viewport.height);
    });

    test("tela do time: elenco de um lado; força, estilos e botão do outro", async ({ page }) => {
      const g = new GamePage(page);
      await g.useSeed(SEEDS.campeao); await g.open(); await g.startFreePlay(); await g.draftAll();
      const elenco = await box(page.locator("#team-final")), estilos = await box(page.locator("#style-opts")), forca = await box(page.locator("#team-strength"));
      expect(estilos.x).toBeGreaterThanOrEqual(elenco.right);
      expect(forca.x).toBeGreaterThanOrEqual(elenco.right);
      await expect(page.getByRole("button", { name: /Disputar o Major/ })).toBeInViewport({ ratio: 1 });
    });

    test("rodada: 'Sua campanha' na lateral e o seu jogo ao lado", async ({ page }) => {
      const g = new GamePage(page);
      await g.playWithSeed(SEEDS.campeao);
      const campanha = await box(page.locator(".campaign")), jogo = await box(page.locator(".card.mine"));
      expect(jogo.x, "jogo à direita da campanha").toBeGreaterThanOrEqual(campanha.right);
      await expect(page.getByRole("button", { name: /Próxima rodada/ })).toBeInViewport({ ratio: 1 });
    });

    test("resultado: jornada de um lado, campeão/MVP/texto do outro, e cabe em pouca rolagem", async ({ page }) => {
      const g = new GamePage(page);
      await g.playWithSeed(SEEDS.campeao);
      await page.getByRole("button", { name: /Simular até o fim/ }).click();
      await expect(page.locator("#screen-results.active")).toBeVisible();
      const jornada = await box(page.locator(".journey")), texto = await box(page.locator("#share-box")), hero = await box(page.locator(".result-hero"));
      expect(texto.x, "texto para compartilhar à direita da jornada").toBeGreaterThanOrEqual(jornada.right);
      expect(hero.width, "herói em largura total").toBeGreaterThan(jornada.width * 1.6);
      const altura = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(altura, "antes eram ~1550px numa coluna só").toBeLessThan(1100);
    });

    test("barra de ações: botões com largura razoável e centrados (não 1000px de botão)", async ({ page }) => {
      const g = new GamePage(page);
      await g.playWithSeed(SEEDS.campeao);
      const principal = await box(page.getByRole("button", { name: /Próxima rodada/ }));
      expect(principal.width).toBeLessThanOrEqual(460);
      const botoes = await page.locator(".screen.active .action-bar > button:visible").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right]; }));
      const centro = (Math.min(...botoes.map((b) => b[0])) + Math.max(...botoes.map((b) => b[1]))) / 2;
      expect(Math.abs(centro - viewport.width / 2), "o grupo de botões fica centrado").toBeLessThan(40);
    });

    test("cabeçalho alinhado com o início do conteúdo", async ({ page }) => {
      const g = new GamePage(page);
      await g.stubOnlineApi(); await g.open();                       // com os modos online o início é de 2 colunas, e o conteúdo começa à esquerda
      const logo = await box(page.locator("header h1")), conteudo = await box(g.nameInput);
      expect(Math.abs(logo.x - conteudo.x)).toBeLessThanOrEqual(2);
    });

    test("sem rolagem lateral, alvos ≥ 44px e texto ≥ 12px nas telas do jogo", async ({ page }) => {
      const g = new GamePage(page);
      await g.stubOnlineApi(); await g.useSeed(SEEDS.campeao); await g.open();
      const passos = [];
      passos.push(["início", await medir(page)]);
      await g.startFreePlay(); passos.push(["draft", await medir(page)]);
      await g.draftAll(); passos.push(["time", await medir(page)]);
      await page.getByRole("button", { name: /Disputar o Major/ }).click(); passos.push(["rodada", await medir(page)]);
      await page.getByRole("button", { name: /Simular até o fim/ }).click(); passos.push(["resultado", await medir(page)]);
      for (const [nome, m] of passos) {
        expect.soft(m.overflowX, `${nome}: rolagem lateral`).toBeLessThanOrEqual(0);
        expect.soft(m.small, `${nome}: alvos pequenos`).toEqual([]);
        expect.soft(m.tiny, `${nome}: texto pequeno`).toEqual([]);
      }
    });
  });
}

test.describe("telas muito largas", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });
  test("o conteúdo tem largura máxima e fica centrado", async ({ page }) => {
    const g = new GamePage(page);
    await g.stubOnlineApi(); await g.open();
    const main = await box(page.locator("main"));
    expect(main.width).toBeLessThanOrEqual(1120);
    expect(Math.abs(main.x + main.width / 2 - 960)).toBeLessThan(2);
  });
});

test.describe("celular não muda", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("início e draft continuam em coluna única (nada lado a lado)", async ({ page }) => {
    const g = new GamePage(page);
    await g.stubOnlineApi(); await g.useSeed(SEEDS.campeao); await g.open();
    const jogar = await box(g.begin), amigos = await box(page.locator("#multi-block"));
    expect(amigos.y).toBeGreaterThan(jogar.bottom - 1);
    await g.startFreePlay(); await g.offers.first().click();
    const lateral = await box(page.locator("#slots")), ofertas = await box(page.locator("#lineup-offers"));
    expect(ofertas.y).toBeGreaterThanOrEqual(lateral.bottom - 1);
  });
});

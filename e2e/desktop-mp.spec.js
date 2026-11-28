/* Fase D2 (docs/UX-AUDIT.md): o campeonato também aproveita a largura no desktop (≥1024px).
 *   campeonato: draft com o elenco ao lado, rodadas com campanha e classificação na lateral, resultado em 2 colunas
 *   salas de espera (código e convite) seguem estreitas. No celular nada muda (a ordem é a de antes). */
import { test, expect } from "@playwright/test";
import { abrirSala, campeonato } from "./mp.js";

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
const bate = (page) => page.getByRole("region", { name: /Sua campanha/ });

const CUP_VICE = { phase: "done", script: ["V", "V", "D", "V", "qf:V", "sf:V", "final:DF"], status: "out:Final", wins: 3, losses: 1 };

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  test.describe(`desktop ${viewport.width}px`, () => {
    test.use({ viewport });

    /* ---------------------------- campeonato ---------------------------- */
    test("campeonato, draft: o elenco e os jogadores numa lateral; as ofertas na área principal", async ({ page }) => {
      await abrirSala(page, { view: campeonato({ phase: "draft", draftDone: false, picks: 2 }) });
      const lateral = await box(page.locator("#screen-cup .draft-side")), ofertas = await box(page.locator("#cup-offers"));
      expect(ofertas.x).toBeGreaterThanOrEqual(lateral.right);
      expect(ofertas.width).toBeGreaterThan(lateral.width * 1.8);
    });

    test("campeonato, rodada: campanha na lateral; o seu jogo e a classificação ao lado, um sob o outro", async ({ page }) => {
      await abrirSala(page, { view: campeonato({ script: ["V"] }) });
      const campanha = await box(bate(page)), jogo = await box(page.locator(".card.mine")), classif = await box(page.locator(".cr-stand"));
      expect(jogo.x, "jogo à direita da campanha").toBeGreaterThanOrEqual(campanha.right);
      expect(classif.x, "classificação também à direita da campanha").toBeGreaterThanOrEqual(campanha.right);
      expect(classif.y, "classificação abaixo do jogo").toBeGreaterThanOrEqual(jogo.bottom);
      await expect(page.getByRole("button", { name: /Próxima etapa/ })).toBeInViewport({ ratio: 1 });
    });

    test("campeonato, rodada: em telas largas a classificação vira duas colunas e a rodada cabe numa tela", async ({ page }) => {
      test.skip(viewport.width < 1200, "duas colunas só a partir de 1200px");
      await abrirSala(page, { view: campeonato({ script: ["V"] }) });
      const linhas = page.locator(".cr-stand .row");
      await expect(linhas).toHaveCount(16);
      const [primeira, nona] = [await box(linhas.nth(0)), await box(linhas.nth(8))];
      expect(nona.x, "a 9ª linha começa a 2ª coluna").toBeGreaterThan(primeira.x + 150);
      const fim = await box(page.locator(".cr-stand"));
      expect(fim.bottom, "classificação inteira dentro da primeira tela").toBeLessThanOrEqual(viewport.height);
    });

    test("campeonato, resultado: campeão e MVP ficam juntos (sem buraco entre eles)", async ({ page }) => {
      await abrirSala(page, { view: campeonato(CUP_VICE) });
      const campeao = await box(page.locator(".cd-champion")), mvp = await box(page.locator(".cd-mvp"));
      expect(mvp.y - campeao.bottom).toBeLessThan(40);
    });

    test("campeonato, resultado: jornada de um lado, campeão e MVP do outro, herói em largura total", async ({ page }) => {
      await abrirSala(page, { view: campeonato(CUP_VICE) });
      const jornada = await box(page.getByRole("list", { name: /Sua jornada/ })), campeao = await box(page.locator(".cd-champion")), hero = await box(page.locator(".result-hero"));
      expect(campeao.x, "campeão à direita da jornada").toBeGreaterThanOrEqual(jornada.right);
      expect(hero.width).toBeGreaterThan(jornada.width * 1.6);
      await expect(page.getByRole("button", { name: /Compartilhar/ })).toBeInViewport({ ratio: 1 });
    });

    test("campeonato, sala de espera: card estreito e centrado", async ({ page }) => {
      await abrirSala(page, { view: { ...campeonato({ phase: "draft" }), phase: "lobby" } });
      const card = await box(page.locator("#cup-content .card").first());
      expect(card.width).toBeLessThanOrEqual(620);
      expect(Math.abs(card.x + card.width / 2 - viewport.width / 2)).toBeLessThan(20);
    });

    test("convite: continua estreito e centrado", async ({ page }) => {
      await page.route("**/api/v1/cups/ABC234", (r) => r.fulfill({ json: { exists: true } }));
      await page.goto("/?campeonato=ABC234");
      const t = await box(page.locator("#invite-form"));
      expect(t.width).toBeLessThanOrEqual(720);
      expect(Math.abs(t.x + t.width / 2 - viewport.width / 2)).toBeLessThan(20);
    });

    test("sem rolagem lateral, alvos ≥ 44px e texto ≥ 12px nas telas do campeonato", async ({ browser }) => {
      const casos = [
        ["cup-draft", campeonato({ phase: "draft", draftDone: false, picks: 2 })],
        ["cup-estilo", campeonato({ phase: "draft", draftDone: true })],
        ["cup-rodada", campeonato({ script: ["V"] })],
        ["cup-resultado", campeonato(CUP_VICE)],
      ];
      for (const [nome, view] of casos) {
        const ctx = await browser.newContext({ viewport });
        const page = await ctx.newPage();
        await abrirSala(page, { view });
        await expect(page.locator(".screen.active")).toBeVisible();
        const m = await medir(page);
        expect.soft(m.overflowX, `${nome}: rolagem lateral`).toBeLessThanOrEqual(0);
        expect.soft(m.small, `${nome}: alvos pequenos`).toEqual([]);
        expect.soft(m.tiny, `${nome}: texto pequeno`).toEqual([]);
        await ctx.close();
      }
    });
  });
}

test.describe("celular: a ordem das telas não mudou", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("campeonato, rodada: campanha, depois o jogo, depois a classificação", async ({ page }) => {
    await abrirSala(page, { view: campeonato({ script: ["V"] }) });
    const campanha = await box(bate(page)), jogo = await box(page.locator(".card.mine")), classif = await box(page.locator(".cr-stand"));
    expect(jogo.y).toBeGreaterThanOrEqual(campanha.bottom - 1);
    expect(classif.y).toBeGreaterThanOrEqual(jogo.bottom - 1);
  });

  test("campeonato, resultado: jornada antes do campeão", async ({ page }) => {
    await abrirSala(page, { view: campeonato(CUP_VICE) });
    const jornada = await box(page.getByRole("list", { name: /Sua jornada/ })), campeao = await box(page.locator(".cd-champion"));
    expect(campeao.y).toBeGreaterThanOrEqual(jornada.bottom - 1);
  });

  test("draft do campeonato: elenco e ofertas empilhados", async ({ page }) => {
    await abrirSala(page, { view: campeonato({ phase: "draft", draftDone: false, picks: 2 }) });
    const lateral = await box(page.locator("#screen-cup .draft-side")), ofertas = await box(page.locator("#cup-offers"));
    expect(ofertas.y).toBeGreaterThanOrEqual(lateral.bottom - 1);
  });
});

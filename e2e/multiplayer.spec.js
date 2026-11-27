/* Paridade do duelo 1×1 e do campeonato com o jogo solo (docs/UX-AUDIT.md):
 *   estilo com contexto (força, efeitos, sugestão) · rodadas com a campanha à vista ·
 *   resultado com herói e jornada · compartilhar · ações na barra fixa. */
import { test, expect } from "@playwright/test";
import { abrirSala, duelo, campeonato } from "./mp.js";

test.use({ viewport: { width: 375, height: 812 } });

const heroi = (page) => page.locator(".result-hero h2");
const compartilhar = (page) => page.getByRole("button", { name: /Compartilhar/ });
const estilo = (page, nome) => page.getByRole("radio", { name: nome });
const compartilhado = (page) => page.evaluate(() => window.__shared);

/* O botão fixo não pode aparecer antes das opções: a 1ª carta de estilo tem de caber inteira acima da barra, sem rolar. */
async function cartaAcimaDaBarra(page, nome) {
  const carta = await estilo(page, nome).boundingBox();
  const barra = await page.locator(".screen.active .action-bar").boundingBox();
  expect(carta.y + carta.height, "a carta de estilo fica atrás da barra de ações").toBeLessThanOrEqual(barra.y);
}

/* ================================ DUELO ================================ */
test.describe("duelo 1×1", () => {
  test("escolha do estilo: força do time, efeitos de cada estilo e uma sugestão, com Tático já marcado", async ({ page }) => {
    await abrirSala(page, { view: duelo({ phase: "draft", draftDone: true, forca: 95 }) });
    await expect(page.getByRole("region", { name: /Força do time/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /Força do time/ })).toContainText(/Acima da média/);
    await expect(estilo(page, /Rush/)).toContainText(/\+2%/);
    await expect(estilo(page, /Aim puro/)).toContainText(/\+1%/);
    await expect(estilo(page, /Tático/)).toContainText(/sem bônus/i);
    await expect(estilo(page, /Tático/)).toBeChecked();                                   // padrão, como no solo
    await expect(page.getByText("Sugerido", { exact: true })).toHaveCount(1);
    await expect(estilo(page, /Tático/).getByText("Sugerido", { exact: true })).toBeVisible();   // força alta → Tático
    await expect(page.getByRole("button", { name: /Confirmar estilo/ })).toBeInViewport({ ratio: 1 });
    await cartaAcimaDaBarra(page, /Rush/);
  });

  test("o estilo só vale ao confirmar: escolher não envia; confirmar envia o escolhido", async ({ page }) => {
    const enviadas = [];
    await abrirSala(page, { view: duelo({ phase: "draft", draftDone: true }), enviadas });
    await estilo(page, /Rush/).click();
    await expect(estilo(page, /Rush/)).toBeChecked();
    expect(enviadas.filter((m) => m.t === "style")).toEqual([]);
    await page.getByRole("button", { name: /Confirmar estilo/ }).click();
    await expect.poll(() => enviadas.filter((m) => m.t === "style")).toEqual([{ t: "style", style: "rush" }]);
  });

  test("sem mexer, confirmar envia o Tático", async ({ page }) => {
    const enviadas = [];
    await abrirSala(page, { view: duelo({ phase: "draft", draftDone: true }), enviadas });
    await page.getByRole("button", { name: /Confirmar estilo/ }).click();
    await expect.poll(() => enviadas.filter((m) => m.t === "style")).toEqual([{ t: "style", style: "tatico" }]);
  });

  test("vitória: herói com o placar da série e o rival", async ({ page }) => {
    await abrirSala(page, { view: duelo({ won: true }) });
    await expect(heroi(page)).toContainText(/VITÓRIA/);
    await expect(page.locator(".result-hero")).toContainText(/Rival FC/);
    await expect(page.locator(".result-hero")).toContainText(/2×1/);
  });

  test("derrota: herói construtivo (convida à revanche)", async ({ page }) => {
    await abrirSala(page, { view: duelo({ won: false }) });
    await expect(heroi(page)).toContainText(/Derrota/);
    await expect(page.locator(".result-hero")).toContainText(/Rival FC/);
    await expect(page.locator(".result-hero")).toContainText(/revanche/i);
  });

  test("resultado: Compartilhar é a ação principal e tudo fica à vista na barra fixa", async ({ page }) => {
    await abrirSala(page, { view: duelo({ won: true }) });
    await expect(compartilhar(page)).toHaveClass(/primary/);
    await expect(compartilhar(page)).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: /Revanche/ })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: /Sair do duelo/ })).toBeInViewport({ ratio: 1 });
  });

  test("compartilhar o duelo: texto com o resultado, o rival e o endereço do jogo", async ({ page }) => {
    await abrirSala(page, { view: duelo({ won: true }) });
    await compartilhar(page).click();
    await expect.poll(() => compartilhado(page)).not.toBeNull();
    const { text } = await compartilhado(page);
    expect(text).toMatch(/Rival FC/);
    expect(text).toMatch(/2×1|2-1/);
    expect(text).toMatch(/Jog1/);                                                         // a lineup vai junto
    expect(text).toMatch(/minhalineup\.com/);
  });

  test("a revanche continua funcionando", async ({ page }) => {
    const enviadas = [];
    await abrirSala(page, { view: duelo({ won: false }), enviadas });
    await page.getByRole("button", { name: /Revanche/ }).click();
    await expect.poll(() => enviadas.filter((m) => m.t === "rematch").length).toBe(1);
  });

  test("telas do duelo: sem rolagem lateral, alvos ≥ 44px e texto ≥ 12px em 320, 375 e 414", async ({ browser }) => {
    for (const width of [320, 375, 414]) {
      for (const view of [duelo({ phase: "draft", draftDone: true }), duelo({ won: true })]) {
        const ctx = await browser.newContext({ viewport: { width, height: 800 } });      // visitante novo a cada caso
        const page = await ctx.newPage();
        await abrirSala(page, { view });
        await expect(page.locator("#screen-duel.active")).toBeVisible();
        await expect(page.getByRole("button", { name: /Confirmar estilo|Compartilhar/ })).toBeVisible();
        const m = await medir(page);
        expect.soft(m.overflowX, `${width}px: rolagem lateral`).toBeLessThanOrEqual(0);
        expect.soft(m.small, `${width}px: alvos pequenos`).toEqual([]);
        expect.soft(m.tiny, `${width}px: texto pequeno`).toEqual([]);
        await ctx.close();
      }
    }
  });
});

/* ============================== CAMPEONATO ============================== */
test.describe("campeonato", () => {
  test("escolha do estilo: o mesmo contexto do solo (força, efeitos, sugestão, Tático marcado)", async ({ page }) => {
    await abrirSala(page, { kind: "cups", view: campeonato({ phase: "draft", draftDone: true, forca: 70 }) });
    await expect(page.getByRole("region", { name: /Força do time/ })).toContainText(/Abaixo da média/);
    await expect(estilo(page, /Tático/)).toBeChecked();
    await expect(estilo(page, /Rush/).getByText("Sugerido", { exact: true })).toBeVisible();     // força baixa → Rush
    await expect(page.getByRole("button", { name: /Confirmar estilo/ })).toBeInViewport({ ratio: 1 });
    await cartaAcimaDaBarra(page, /Rush/);
  });

  test("confirmar envia o estilo escolhido", async ({ page }) => {
    const enviadas = [];
    await abrirSala(page, { kind: "cups", view: campeonato({ phase: "draft", draftDone: true }), enviadas });
    await estilo(page, /Aim puro/).click();
    await page.getByRole("button", { name: /Confirmar estilo/ }).click();
    await expect.poll(() => enviadas.filter((m) => m.t === "style")).toEqual([{ t: "style", style: "aim" }]);
  });

  test("rodada: painel 'Sua campanha', só o seu jogo aberto e os outros recolhidos", async ({ page }) => {
    await abrirSala(page, { kind: "cups", view: campeonato({ script: ["V"], wins: 1, losses: 0 }) });
    const campanha = page.getByRole("region", { name: /Sua campanha/ });
    await expect(campanha).toBeVisible();
    await expect(campanha).toContainText("1-0");
    await expect(campanha).toContainText(/Classifica com mais 2 vitórias/);
    await expect(page.locator(".card.mine")).toHaveCount(1);
    await expect(page.locator(".card.mine")).toContainText(/Bot 1/);
    const outros = page.locator("details.others");
    await expect(outros).toHaveCount(1);
    await expect(outros.locator("summary")).toContainText(/Ver os outros 7 jogos/);
    await expect(outros.locator("li").first()).toBeHidden();
    await outros.locator("summary").click();
    await expect(outros.locator("li")).toHaveCount(7);
  });

  test("rodada: 'Próxima etapa' fica na barra fixa, sempre à vista", async ({ page }) => {
    await abrirSala(page, { kind: "cups", view: campeonato({ script: ["V"] }) });
    const avancar = page.getByRole("button", { name: /Próxima etapa/ });
    await expect(avancar).toHaveClass(/primary/);
    await expect(avancar).toBeInViewport({ ratio: 1 });
  });

  test("quem não é o dono vê o aviso em vez do botão", async ({ page }) => {
    await abrirSala(page, { kind: "cups", view: campeonato({ script: ["V"], host: false }) });
    await expect(page.getByRole("button", { name: /Próxima etapa/ })).toHaveCount(0);
    await expect(page.getByText(/dono avança/i)).toBeVisible();
  });

  test("resultado campeão invicto: 'MAJOR PERFEITO', jornada completa e compartilhar à vista", async ({ page }) => {
    await abrirSala(page, { kind: "cups", view: campeonato({
      phase: "done", script: ["V", "V", "V", "qf:V", "sf:V", "final:VF"], status: "champion", wins: 3, losses: 0, perfeito: true,
    }) });
    await expect(heroi(page)).toContainText(/MAJOR PERFEITO/);
    await expect(page.getByRole("list", { name: /Sua jornada/ }).getByRole("listitem")).toHaveCount(6);
    await expect(compartilhar(page)).toHaveClass(/primary/);
    await expect(compartilhar(page)).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: /Sair do campeonato/ })).toBeInViewport({ ratio: 1 });
  });

  test("resultado vice: diz para quem perdeu a final", async ({ page }) => {
    await abrirSala(page, { kind: "cups", view: campeonato({
      phase: "done", script: ["V", "V", "D", "V", "qf:V", "sf:V", "final:DF"], status: "out:Final", wins: 3, losses: 1,
    }) });
    await expect(heroi(page)).toContainText(/Vice-campeão/);
    const ultimo = await page.getByRole("list", { name: /Sua jornada/ }).getByRole("listitem").last().locator(".j-opp").innerText();
    await expect(page.locator(".result-hero")).toContainText(ultimo);
  });

  test("resultado eliminado no suíço: diz quanto faltou", async ({ page }) => {
    await abrirSala(page, { kind: "cups", view: campeonato({
      phase: "done", script: ["V", "V", "D", "D", "D"], status: "eliminated", wins: 2, losses: 3,
    }) });
    await expect(heroi(page)).toContainText(/Eliminado na Primeira Fase/);
    await expect(page.locator(".result-hero")).toContainText(/a 1 vitória dos playoffs/);
    await expect(page.getByRole("list", { name: /Sua jornada/ }).getByRole("listitem")).toHaveCount(5);
  });

  test("compartilhar o campeonato: texto com o resultado e o endereço do jogo", async ({ page }) => {
    await abrirSala(page, { kind: "cups", view: campeonato({
      phase: "done", script: ["V", "V", "V", "qf:V", "sf:V", "final:V"], status: "champion", wins: 3, losses: 0,
    }) });
    await compartilhar(page).click();
    await expect.poll(() => compartilhado(page)).not.toBeNull();
    const { text } = await compartilhado(page);
    expect(text).toMatch(/campeonato/i);
    expect(text).toMatch(/Meu Time/);
    expect(text).toMatch(/Jog1/);
    expect(text).toMatch(/minhalineup\.com/);
  });

  test("telas do campeonato: sem rolagem lateral, alvos ≥ 44px e texto ≥ 12px em 320, 375 e 414", async ({ browser }) => {
    for (const width of [320, 375, 414]) {
      for (const view of [
        campeonato({ phase: "draft", draftDone: true }),
        campeonato({ script: ["V"] }),
        campeonato({ phase: "done", script: ["V", "V", "V", "qf:V", "sf:V", "final:VF"], status: "champion", wins: 3, losses: 0, perfeito: true }),
      ]) {
        const ctx = await browser.newContext({ viewport: { width, height: 800 } });      // visitante novo a cada caso
        const page = await ctx.newPage();
        await abrirSala(page, { kind: "cups", view });
        await expect(page.locator("#screen-cup.active")).toBeVisible();
        await expect(page.getByRole("button", { name: /Confirmar estilo|Próxima etapa|Compartilhar/ })).toBeVisible();
        const m = await medir(page);
        expect.soft(m.overflowX, `${width}px: rolagem lateral`).toBeLessThanOrEqual(0);
        expect.soft(m.small, `${width}px: alvos pequenos`).toEqual([]);
        expect.soft(m.tiny, `${width}px: texto pequeno`).toEqual([]);
        await ctx.close();
      }
    }
  });
});

function medir(page) {
  return page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const scope = document.querySelector(".screen.active");
    const small = [...scope.querySelectorAll("button, summary, [role=radio]")].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 44).map(({ e, r }) => `${e.id || e.textContent.trim().slice(0, 22)} ${Math.round(r.height)}px`);
    const tiny = [...new Set([...scope.querySelectorAll("*")].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
      .map((e) => `${e.className || e.tagName} ${getComputedStyle(e).fontSize}`))];
    return { small, tiny, overflowX: document.documentElement.scrollWidth - innerWidth };
  });
}

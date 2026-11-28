/* Home nova (esqueleto do usuário): logo clicável · nome obrigatório · bloco Single player (Modo rápido + Desafio diário) ·
 * Top 5 do ranking (só se houver) · bloco Multiplayer (Campeonato + Leilão, lado a lado) · entrar com código · como jogar. */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";
import { SEEDS } from "./seeds.js";

const box = async (loc) => { const b = await loc.first().boundingBox(); if (!b) throw new Error("elemento sem caixa (invisível?)"); return { ...b, right: b.x + b.width, bottom: b.y + b.height }; };
const medir = (page) => page.evaluate(() => {
  const vis = (e) => e.getClientRects().length > 0;
  const scope = document.querySelector(".screen.active");
  const small = [...scope.querySelectorAll("button, summary, input, a.btn-link")].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.height < 44).map(({ e, r }) => `${e.id || e.textContent.trim().slice(0, 22)} ${Math.round(r.height)}px`);
  const tiny = [...new Set([...scope.querySelectorAll("*")].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
    .map((e) => `${e.className || e.tagName} ${getComputedStyle(e).fontSize}`))];
  return { small, tiny, overflowX: document.documentElement.scrollWidth - innerWidth };
});

const linha = (i) => ({ rank: i + 1, team_name: `Time ${i + 1}`, style: "tatico", forca: 80 + i, wins: 3, losses: 0, tier: 3, champion: true, perfeito: false, squad: [] });
const BOARD7 = Array.from({ length: 7 }, (_, i) => linha(i));

const modoRapido = (page) => page.getByRole("group", { name: /Modo rápido/ });
const desafio = (page) => page.getByRole("group", { name: /Desafio diário/ });
const campeonato = (page) => page.getByRole("group", { name: /Campeonato/ });
const leilao = (page) => page.getByRole("group", { name: /Leilão/ });
const codigo = (page) => page.getByRole("group", { name: /Entrar com um código/i });
const ranking = (page) => page.getByRole("region", { name: /Ranking do desafio diário/ });
const jogarAgora = (page) => page.getByRole("button", { name: /^Jogar agora/ });

test.describe("celular 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /* ------------------------------ logo ------------------------------ */
  test("o logo é um link para a home", async ({ page }) => {
    const g = new GamePage(page); await g.open();
    const logo = page.getByRole("link", { name: /Minha LineUp/i });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("href", "/");
  });

  test("logo no meio de um jogo pergunta antes de sair; cancelar mantém o jogo", async ({ page }) => {
    const g = new GamePage(page);
    await g.useSeed(SEEDS.campeao); await g.open(); await g.startFreePlay();
    const mensagens = [];
    page.once("dialog", (d) => { mensagens.push(d.message()); d.dismiss(); });
    await page.getByRole("link", { name: /Minha LineUp/i }).click();
    expect(mensagens[0]).toMatch(/perde|jogo/i);
    await expect(page.getByText(/Escolha 1 de 5/)).toBeVisible();
  });

  test("logo no meio de um jogo: confirmar volta à home, com o nome ainda preenchido", async ({ page }) => {
    const g = new GamePage(page);
    await g.useSeed(SEEDS.campeao); await g.open(); await g.startFreePlay("Falcons BR");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("link", { name: /Minha LineUp/i }).click();
    await expect(jogarAgora(page)).toBeVisible();
    await expect(g.nameInput).toHaveValue("Falcons BR");
  });

  test("logo na tela de resultado volta à home sem perguntar (o jogo já acabou)", async ({ page }) => {
    const g = new GamePage(page);
    await g.playWithSeed(SEEDS.campeao);
    await page.getByRole("button", { name: /Simular até o fim/ }).click();
    await expect(page.locator("#screen-results.active")).toBeVisible();
    let perguntou = false; page.on("dialog", (d) => { perguntou = true; d.dismiss(); });
    await page.getByRole("link", { name: /Minha LineUp/i }).click();
    await expect(jogarAgora(page)).toBeVisible();
    expect(perguntou).toBe(false);
  });

  /* ------------------------------ nome ------------------------------ */
  test("o nome continua obrigatório: sem nome, 'Jogar agora' explica e não abre o draft", async ({ page }) => {
    const g = new GamePage(page); await g.open();
    await expect(g.nameInput).toHaveValue("");
    await jogarAgora(page).click();
    await expect(page.getByRole("alert").filter({ hasText: /nome/i })).toBeVisible();
    await expect(g.nameInput).toBeFocused();
    await expect(page.getByText(/Escolha 1 de 5/)).toBeHidden();
  });

  /* ------------------------------ Single player ------------------------------ */
  test("sem a API: só o Modo rápido; sem Desafio, sem ranking e sem Multiplayer", async ({ page }) => {
    const g = new GamePage(page); await g.open();
    await expect(page.getByRole("heading", { name: /Single player/i })).toBeVisible();
    await expect(modoRapido(page)).toBeVisible();
    await expect(desafio(page)).toBeHidden();
    await expect(ranking(page)).toBeHidden();
    await expect(page.getByRole("heading", { name: /Multiplayer/i })).toBeHidden();
  });

  test("com a API: Modo rápido e Desafio diário lado a lado, cada um com resumo e botão", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi(); await g.open();
    const [a, b] = [await box(modoRapido(page)), await box(desafio(page))];
    expect(b.x, "Desafio à direita do Modo rápido").toBeGreaterThanOrEqual(a.right);
    expect(Math.abs(a.y - b.y)).toBeLessThan(4);
    await expect(modoRapido(page).getByRole("button", { name: /Jogar agora/ })).toBeVisible();
    await expect(desafio(page).getByRole("button", { name: /Jogar o desafio/ })).toBeVisible();
    for (const c of [modoRapido(page), desafio(page)]) await expect(c.locator("p")).not.toHaveText("");     // resumo
  });

  test("Modo rápido começa o jogo livre; Desafio diário começa o desafio", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi(); await g.open();
    await g.typeName("Time Teste");
    await jogarAgora(page).click();
    await expect(page.getByText(/Escolha 1 de 5/)).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("link", { name: /Minha LineUp/i }).click();
    await desafio(page).getByRole("button", { name: /Jogar o desafio/ }).click();
    await expect(page.getByText(/Escolha 1 de 5/)).toBeVisible();
  });

  test("desafio já feito hoje: o botão fica desligado e diz que volta amanhã", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi();
    await page.addInitScript(() => localStorage.setItem("ml_played", "2026-11-26"));
    await g.open();
    await expect(desafio(page).getByRole("button")).toBeDisabled();
    await expect(desafio(page)).toContainText(/volta amanhã/i);
  });

  /* ------------------------------ Top 5 ------------------------------ */
  test("Top 5 do ranking: só 5 itens, compacto, com 'Ver mais' para a página completa", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi({ board: BOARD7 }); await g.open();
    await expect(ranking(page)).toBeVisible();
    await expect(ranking(page).getByRole("listitem")).toHaveCount(5);
    await expect(ranking(page).getByRole("listitem").first()).toContainText("Time 1");
    const mais = ranking(page).getByRole("link", { name: /Ver mais/ });
    await expect(mais).toHaveAttribute("href", "/ranking");
    expect((await box(ranking(page))).height, "não deve ocupar muito espaço").toBeLessThan(300);
  });

  test("sem ninguém no ranking, o Top 5 nem aparece", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi({ board: [] }); await g.open();
    await expect(modoRapido(page)).toBeVisible();
    await expect(ranking(page)).toBeHidden();
  });

  test("voltar à home atualiza o Top 5 (por exemplo, depois de enviar o desafio)", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi({ board: [] }); await g.open();
    await expect(ranking(page)).toBeHidden();                                    // ninguém no ranking quando a página abriu
    await page.route("**/api/v1/daily/leaderboard**", (r) => r.fulfill({ json: { day: "2026-11-26", data: BOARD7 } }));   // entrou gente
    await page.getByRole("link", { name: /Minha LineUp/i }).click();
    await expect(ranking(page).getByRole("listitem")).toHaveCount(5);
  });

  test("'Ver mais' abre a página do ranking completo", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi({ board: BOARD7 }); await g.open();
    await ranking(page).getByRole("link", { name: /Ver mais/ }).click();
    await expect(page).toHaveURL(/\/ranking$/);
    await expect(page.getByRole("heading", { level: 1, name: /Ranking/i })).toBeVisible();
  });

  /* ------------------------------ Multiplayer ------------------------------ */
  test("Multiplayer: Campeonato e Leilão lado a lado; 'Entrar com código' embaixo", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi(); await g.open();
    await expect(page.getByRole("heading", { name: /Multiplayer/i })).toBeVisible();
    const [c, l, j] = [await box(campeonato(page)), await box(leilao(page)), await box(codigo(page))];
    expect(l.x, "Leilão à direita do Campeonato").toBeGreaterThanOrEqual(c.right);
    expect(Math.abs(c.y - l.y)).toBeLessThan(4);
    expect(j.y, "entrar com código abaixo dos dois").toBeGreaterThanOrEqual(Math.max(c.bottom, l.bottom) - 1);
    await expect(campeonato(page).getByRole("button", { name: /Criar campeonato/ })).toBeVisible();
    await expect(codigo(page).getByLabel("Código da sala")).toBeVisible();
    await expect(codigo(page).getByRole("button", { name: /^Entrar/ })).toBeVisible();
  });

  test("não existe mais o duelo 1×1", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi(); await g.open();
    await expect(page.getByText(/1\s*[×x]\s*1/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Criar duelo/ })).toHaveCount(0);
  });

  test("Leilão: cartão com resumo e o botão 'Criar leilão' ativo", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi(); await g.open();
    await expect(leilao(page)).toContainText(/lance fechado/i);
    await expect(leilao(page).getByRole("button", { name: /Criar leilão/ })).toBeEnabled();
  });

  test("Criar campeonato sem nome explica o motivo (o nome é obrigatório)", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi(); await g.open();
    await campeonato(page).getByRole("button", { name: /Criar campeonato/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: /nome/i })).toBeVisible();
    await expect(g.nameInput).toBeFocused();
  });

  /* ------------------------------ ordem e como jogar ------------------------------ */
  test("ordem da página: nome → Single player → Top 5 → Multiplayer → Como jogar", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi({ board: BOARD7 }); await g.open();
    const ys = [];
    for (const l of [g.nameInput, modoRapido(page), ranking(page), campeonato(page), page.getByRole("list", { name: /Como jogar/ })]) ys.push((await box(l)).y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  test("'Como jogar' continua como era: 3 passos e as regras completas recolhidas", async ({ page }) => {
    const g = new GamePage(page); await g.open();
    await expect(page.getByRole("list", { name: /Como jogar/ }).getByRole("listitem")).toHaveCount(3);
    await expect(page.getByText(/prorrogação/)).toBeHidden();
    await page.getByText(/Ver as regras completas/).click();
    await expect(page.getByText(/prorrogação/)).toBeVisible();
  });

  test("home: sem rolagem lateral, alvos ≥ 44px e texto ≥ 12px em 320, 375 e 414", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi({ board: BOARD7 });
    for (const width of [320, 375, 414]) {
      await page.setViewportSize({ width, height: 800 });
      await g.open();
      await expect(desafio(page)).toBeVisible();
      const m = await medir(page);
      expect.soft(m.overflowX, `${width}px: rolagem lateral`).toBeLessThanOrEqual(0);
      expect.soft(m.small, `${width}px: alvos pequenos`).toEqual([]);
      expect.soft(m.tiny, `${width}px: texto pequeno`).toEqual([]);
    }
  });

  test("em 320px os cartões empilham (cada um com largura útil)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    const g = new GamePage(page); await g.stubOnlineApi(); await g.open();
    const [a, b] = [await box(modoRapido(page)), await box(desafio(page))];
    expect(b.y).toBeGreaterThanOrEqual(a.bottom - 1);
    expect(a.width).toBeGreaterThan(240);
  });
});

test.describe("desktop 1280px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Single player à esquerda e Multiplayer à direita; Top 5 sob o Single", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi({ board: BOARD7 }); await g.open();
    const [sp, mp, rk] = [await box(page.getByRole("region", { name: /Single player/ })), await box(page.getByRole("region", { name: /Multiplayer/ })), await box(ranking(page))];
    expect(mp.x, "Multiplayer à direita").toBeGreaterThanOrEqual(sp.right);
    expect(rk.y, "Top 5 abaixo do Single").toBeGreaterThanOrEqual(sp.bottom - 1);
    expect(rk.x).toBeLessThan(mp.x);
  });

  test("sem os modos online, a coluna única fica centrada", async ({ page }) => {
    const g = new GamePage(page); await g.open();
    const c = await box(modoRapido(page));
    expect(Math.abs(c.x + c.width / 2 - 640)).toBeLessThan(40);
  });

  test("'Como jogar' em 3 colunas", async ({ page }) => {
    const g = new GamePage(page); await g.open();
    const passos = page.getByRole("list", { name: /Como jogar/ }).getByRole("listitem");
    const [a, b, c] = [await box(passos.nth(0)), await box(passos.nth(1)), await box(passos.nth(2))];
    expect(b.x).toBeGreaterThan(a.right - 1); expect(c.x).toBeGreaterThan(b.right - 1);
  });

  test("o logo alinha com o início do conteúdo", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi(); await g.open();
    const logo = await box(page.locator("header h1")), nome = await box(g.nameInput);
    expect(Math.abs(logo.x - nome.x)).toBeLessThanOrEqual(2);
  });

  test("home: sem rolagem lateral, alvos ≥ 44px e texto ≥ 12px", async ({ page }) => {
    const g = new GamePage(page); await g.stubOnlineApi({ board: BOARD7 }); await g.open();
    const m = await medir(page);
    expect(m.overflowX).toBeLessThanOrEqual(0); expect(m.small).toEqual([]); expect(m.tiny).toEqual([]);
  });
});

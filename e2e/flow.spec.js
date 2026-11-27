/* Fase B da auditoria de UX (docs/UX-AUDIT.md): o fluxo em si.
 *   U-02 ação principal sempre à vista · U-05 botões que explicam · U-07 entrar com um código só
 *   U-08 desfazer no draft · U-09 chip desabilitado diz por quê · U-12 transição só nos momentos-chave */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";

test.use({ viewport: { width: 375, height: 812 } });

/* ----------------------------- U-02: ação principal à vista ----------------------------- */
test("rodadas: o botão de avançar fica sempre visível, sem rolar a página", async ({ page }) => {
  const game = new GamePage(page);
  await game.open(); await game.startFreePlay(); await game.draftAll();
  await page.getByRole("button", { name: /Disputar o Major/ }).click();
  for (let i = 0; i < 12; i++) {
    if (await page.locator("#screen-results.active").count()) break;
    await expect(game.next, `etapa ${i + 1}: botão fora da tela`).toBeInViewport({ ratio: 1 });
    await game.next.click();
  }
});

test("resultado: compartilhar e jogar de novo ficam à vista", async ({ page }) => {
  const game = new GamePage(page);
  await game.open(); await game.startFreePlay(); await game.draftAll();
  await page.getByRole("button", { name: /Disputar o Major/ }).click();
  await game.playToResults();
  await expect(game.share).toBeInViewport({ ratio: 1 });
  await expect(game.playAgain).toBeInViewport({ ratio: 1 });
});

/* ----------------------------- U-05: botões que explicam ----------------------------- */
test("nome vazio: o botão principal NÃO fica morto — explica e leva o foco ao campo", async ({ page }) => {
  const game = new GamePage(page);
  await game.open();
  await game.nameInput.fill("");                                    // o nome vem sugerido (C1): apagar volta ao caso de erro
  await expect(game.begin).toBeEnabled();
  await game.begin.click();
  await expect(page.getByRole("alert").filter({ hasText: /Dê um nome ao seu time/ })).toBeVisible();
  await expect(game.nameInput).toBeFocused();
  await game.nameInput.fill("Meu Time");
  await game.begin.click();
  await expect(page.getByText(/Escolha 1 de 5/)).toBeVisible();     // seguiu para o draft
});

test("estilo: 'Tático' já vem selecionado e o botão de disputar já está ativo", async ({ page }) => {
  const game = new GamePage(page);
  await game.open(); await game.startFreePlay(); await game.draftAll();
  await expect(page.getByRole("radio", { name: /Tático/ })).toBeChecked();
  await expect(page.getByRole("button", { name: /Disputar o Major/ })).toBeEnabled();
});

/* ----------------------------- U-08: desfazer ----------------------------- */
test("draft: 'Desfazer última escolha' devolve o jogador e as MESMAS ofertas", async ({ page }) => {
  const game = new GamePage(page);
  await game.open(); await game.startFreePlay();
  const before = await page.locator("#lineup-offers .lname").allInnerTexts();
  await expect(game.undo).toHaveCount(0);                              // nada para desfazer ainda
  await game.offers.first().click();
  await expect(page.locator(".draft-slots .slot.filled")).toHaveCount(1);
  await game.undo.click();
  await expect(page.locator(".draft-slots .slot.filled")).toHaveCount(0);
  expect(await page.locator("#lineup-offers .lname").allInnerTexts()).toEqual(before);
  await game.draftAll();                                               // e o jogo segue normalmente
});

test("depois de completar o elenco, ainda dá para desfazer a última escolha", async ({ page }) => {
  const game = new GamePage(page);
  await game.open(); await game.startFreePlay(); await game.draftAll();
  await game.undo.click();
  await expect(page.getByText(/Escolha 5 de 5/)).toBeVisible();
  await expect(page.locator(".draft-slots .slot.filled")).toHaveCount(4);
  await game.offers.first().click();
  await expect(page.getByRole("heading", { name: /Sua LineUp está pronta/i })).toBeVisible();
});

/* ----------------------------- U-09: chip desabilitado explica por quê ----------------------------- */
test("jogador indisponível diz o motivo (papel já preenchido ou já escalado)", async ({ page }) => {
  const game = new GamePage(page);
  await game.open(); await game.startFreePlay();
  await game.offers.first().click();
  const disabled = page.locator("#lineup-offers button[disabled]");
  await expect(disabled.first()).toHaveAttribute("title", /já (preenchido|escalado)/i);
  await expect(page.getByText(/apagados.*(papel|escalado)/i)).toBeVisible();   // legenda visível, não só tooltip
});

/* ----------------------------- U-07: entrar com um código só ----------------------------- */
test("entrar com código: um único botão; o servidor diz se é duelo ou campeonato", async ({ page }) => {
  const game = new GamePage(page);
  await game.stubOnlineApi();
  await page.route("**/api/v1/rooms/ABC234", (r) => r.fulfill({ status: 404, json: { type: "x", title: "Not found", status: 404 } }));
  await page.route("**/api/v1/cups/ABC234", (r) => r.fulfill({ json: { exists: true, phase: "lobby" } }));
  await page.routeWebSocket("**/api/v1/cups/ABC234/ws", (ws) => {
    ws.onMessage((m) => {
      const hello = JSON.parse(String(m));
      if (hello.t !== "hello") return;
      ws.send(JSON.stringify({ t: "welcome", v: 1, slot: 1, token: "a".repeat(32), code: "ABC234" }));
      ws.send(JSON.stringify({ t: "state", v: 1, kind: "cup", phase: "lobby", code: "ABC234", max_players: 8, min_players: 2,
        you: { slot: 1, name: hello.name, host: false, canControl: false, offers: [], refreshesLeft: 3, squad: {}, draftDone: false, style: null },
        players: [{ name: "Dono", host: true, connected: true, picks: 0, ready: false }, { name: hello.name, host: false, connected: true, picks: 0, ready: false }],
        teams: null, events: [], result: null }));
    });
  });
  await game.open();
  await expect(page.getByRole("button", { name: "Duelo", exact: true })).toHaveCount(0);       // acabaram os dois botões
  await expect(page.getByRole("button", { name: "Campeonato", exact: true })).toHaveCount(0);
  await game.typeName("Convidado");
  await page.getByLabel("Código da sala").fill("abc234");
  await page.getByRole("button", { name: /^Entrar/ }).click();
  await expect(page.getByText(/Campeonato · sala ABC234/i)).toBeVisible();
});

test("entrar com código inexistente: mensagem clara, sem travar", async ({ page }) => {
  const game = new GamePage(page);
  await game.stubOnlineApi();
  await page.route("**/api/v1/rooms/ZZZZZZ", (r) => r.fulfill({ status: 404, json: {} }));
  await page.route("**/api/v1/cups/ZZZZZZ", (r) => r.fulfill({ status: 404, json: {} }));
  await game.open(); await game.typeName("Convidado");
  await page.getByLabel("Código da sala").fill("ZZZZZZ");
  await page.getByRole("button", { name: /^Entrar/ }).click();
  await expect(page.getByText(/não encontramos.*sala|sala.*não existe/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Entrar/ })).toBeEnabled();
});

/* ----------------------------- U-12: transição só nos momentos-chave ----------------------------- */
test.describe("transições de fase (com animação ligada)", () => {
  test.use({ reducedMotion: "no-preference" });
  const overlayShown = (page) => page.evaluate(() => document.getElementById("phase-overlay").classList.contains("show"));

  test("rodadas do suíço NÃO travam a tela; o mata-mata tem transição curta e pulável", async ({ page }) => {
    const game = new GamePage(page);
    await game.open(); await game.startFreePlay(); await game.draftAll();
    await page.getByRole("button", { name: /Disputar o Major/ }).click();
    let sawPlayoffOverlay = false;
    for (let i = 0; i < 12; i++) {
      const stage = (await page.locator("#sim-content .stage-label").first().innerText()).toLowerCase();
      if (stage.includes("primeira fase")) expect(await overlayShown(page), `overlay no suíço (${stage})`).toBe(false);
      else if (!sawPlayoffOverlay && (await overlayShown(page))) {
        sawPlayoffOverlay = true;
        await page.locator("#phase-overlay").click();                           // tocar pula
        await expect(page.locator("#phase-overlay")).toBeHidden();
      }
      if (await page.locator("#screen-results.active").count()) break;
      await game.next.click();
    }
    expect(sawPlayoffOverlay, "o mata-mata deveria ter transição").toBe(true);
  });
});

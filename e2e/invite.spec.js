/* Convite por link (?duelo=CÓDIGO / ?campeonato=CÓDIGO): a pessoa cai direto na página da sala,
 * não na home (onde o botão laranja inicia uma partida solo sem querer). O nome é obrigatório. */
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 } });

const jogarSolo = (page) => page.getByRole("button", { name: /^Jogar · montar minha lineup/ });
const entrar = (page) => page.getByRole("button", { name: /^Entrar no/ });
const nome = (page) => page.getByLabel(/Seu nome de time/);

async function salaExiste(page, kind = "rooms") {
  await page.route(`**/api/v1/${kind}/ABC234`, (r) => r.fulfill({ json: { exists: true, phase: "lobby" } }));
  await page.routeWebSocket(new RegExp(`/api/v1/${kind}/ABC234/ws`), (ws) => {
    ws.onMessage((m) => {                                   // o servidor de mentira responde ao "hello" como o de verdade
      const hello = JSON.parse(String(m));
      if (hello.t === "hello") ws.send(JSON.stringify({ t: "welcome", v: 1, slot: 1, token: "a".repeat(32), code: "ABC234" }));
    });
  });
}

test("link de duelo abre a página do convite, sem a home e sem o botão de jogo solo", async ({ page }) => {
  await salaExiste(page);
  await page.goto("/?duelo=ABC234");
  await expect(page.getByRole("heading", { level: 2, name: /convidado.*duelo/i })).toBeVisible();
  await expect(page.getByText("ABC234")).toBeVisible();
  await expect(jogarSolo(page)).toBeHidden();
  await expect(page.getByRole("list", { name: /Como jogar/ })).toBeHidden();
});

test("link de campeonato abre a página do convite do campeonato", async ({ page }) => {
  await salaExiste(page, "cups");
  await page.goto("/?campeonato=ABC234");
  await expect(page.getByRole("heading", { level: 2, name: /convidado.*campeonato/i })).toBeVisible();
  await expect(entrar(page)).toContainText(/campeonato/i);
  await expect(jogarSolo(page)).toBeHidden();
});

test("funciona mesmo sem a API do Desafio do dia (o convite não depende dela)", async ({ page }) => {
  await salaExiste(page);                                   // /api/v1/daily não é simulada: falha
  await page.goto("/?duelo=ABC234");
  await expect(page.getByRole("heading", { level: 2, name: /convidado/i })).toBeVisible();
});

test("o nome é obrigatório: sem nome o convite explica e não entra", async ({ page }) => {
  await salaExiste(page);
  await page.goto("/?duelo=ABC234");
  await expect(nome(page)).toHaveValue("");                 // nada de nome padrão
  await entrar(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /nome/i })).toBeVisible();
  await expect(nome(page)).toBeFocused();
  await expect(page.getByText(/Duelo · sala ABC234/)).toBeHidden();
});

test("com nome: entra direto na sala do duelo", async ({ page }) => {
  await salaExiste(page);
  await page.goto("/?duelo=ABC234");
  await nome(page).fill("Convidado");
  await entrar(page).click();
  await expect(page.getByText(/Duelo · sala ABC234/)).toBeVisible();
});

test("com nome: entra direto na sala do campeonato", async ({ page }) => {
  await salaExiste(page, "cups");
  await page.goto("/?campeonato=ABC234");
  await nome(page).fill("Convidado");
  await entrar(page).click();
  await expect(page.getByText(/Campeonato · sala ABC234/)).toBeVisible();
});

test("nome impróprio é recusado com a explicação de sempre", async ({ page }) => {
  await salaExiste(page);
  await page.goto("/?duelo=ABC234");
  await nome(page).fill("fuck");
  await entrar(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /nome/i })).toBeVisible();
  await expect(page.getByText(/Duelo · sala ABC234/)).toBeHidden();
});

test("o último nome usado já vem preenchido (foi escolhido pela pessoa)", async ({ page }) => {
  await salaExiste(page);
  await page.addInitScript(() => localStorage.setItem("ml_name", "Furia Test"));
  await page.goto("/?duelo=ABC234");
  await expect(nome(page)).toHaveValue("Furia Test");
});

test("sala que já não existe: explica e oferece ir ao início", async ({ page }) => {
  await page.route("**/api/v1/rooms/ABC234", (r) => r.fulfill({ status: 404, json: {} }));
  await page.goto("/?duelo=ABC234");
  await expect(page.getByText(/já foi encerrada/i)).toBeVisible();
  await expect(entrar(page)).toBeHidden();
  await page.getByRole("button", { name: /Ir para o início/ }).click();
  await expect(jogarSolo(page)).toBeVisible();
});

test("quem só quer jogar sozinho tem uma saída discreta para o início", async ({ page }) => {
  await salaExiste(page);
  await page.goto("/?duelo=ABC234");
  await page.getByRole("button", { name: /Ir para o início/ }).click();
  await expect(jogarSolo(page)).toBeVisible();
});

test("código inválido no link: cai na home normal", async ({ page }) => {
  await page.goto("/?duelo=xx");
  await expect(jogarSolo(page)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /convidado/i })).toHaveCount(0);
});

test("recarregar dentro da sala (link ainda na barra) volta para a sala, não para o convite", async ({ page }) => {
  await salaExiste(page);
  await page.goto("/?duelo=ABC234");
  await nome(page).fill("Convidado");
  await entrar(page).click();
  await expect(page.getByText(/Duelo · sala ABC234/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Duelo · sala ABC234/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /convidado/i })).toHaveCount(0);
});

test("convite: sem rolagem lateral, alvos ≥ 44px e texto ≥ 12px em 320, 375 e 414", async ({ page }) => {
  await salaExiste(page);
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/?duelo=ABC234");
    await expect(entrar(page)).toBeVisible();
    const m = await page.evaluate(() => {
      const vis = (e) => e.getClientRects().length > 0;
      const scope = document.querySelector(".screen.active");
      const small = [...scope.querySelectorAll("button, input")].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() }))
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

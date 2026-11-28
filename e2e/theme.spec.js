/* Modo claro: o escuro continua o padrão; o botão ☀️/🌙 troca, lembra a escolha (ml_theme) e vale em todas as páginas;
 * nada de piscar ao carregar; e o contraste (WCAG AA) vale em TODAS as telas do modo claro. */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";
import { SEEDS } from "./seeds.js";
import { abrirSala, leilao, campeonato, REVELACAO, comprado, elencoLeilao } from "./mp.js";
import { auditar } from "./contraste.js";

test.use({ viewport: { width: 375, height: 812 } });

const botao = (page) => page.getByRole("button", { name: /modo (claro|escuro)/i });
const tema = (page) => page.evaluate(() => document.documentElement.dataset.theme);
const fundo = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const claro = async (page) => { await page.addInitScript(() => localStorage.setItem("ml_theme", "light")); };
const luz = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

const linha = (i) => ({ rank: i + 1, team_name: `Time ${i + 1}`, style: "tatico", forca: 80 + i, wins: 3, losses: i % 2, tier: 3 - (i % 3), champion: true, perfeito: false, squad: [] });
const BOARD = Array.from({ length: 7 }, (_, i) => linha(i));

/* ------------------------------ o botão e a escolha ------------------------------ */
test("o escuro continua o padrão (quem nunca mexeu vê exatamente o que via)", async ({ page }) => {
  await page.goto("/");
  expect(await tema(page)).toBe("dark");
  expect(luz(await fundo(page))).toBeLessThan(0.15);
  await expect(botao(page)).toHaveAccessibleName(/modo claro/i);
  await expect(botao(page)).toHaveAttribute("aria-pressed", "false");
});

test("o botão liga o modo claro, troca o nome e o estado, e o fundo fica claro", async ({ page }) => {
  await page.goto("/");
  await botao(page).click();
  expect(await tema(page)).toBe("light");
  expect(luz(await fundo(page))).toBeGreaterThan(0.85);
  await expect(botao(page)).toHaveAccessibleName(/modo escuro/i);
  await expect(botao(page)).toHaveAttribute("aria-pressed", "true");
  await botao(page).click();                                                    // e volta
  expect(await tema(page)).toBe("dark");
});

test("a escolha é lembrada ao recarregar (ml_theme) e vale em outras páginas do site", async ({ page }) => {
  await page.goto("/");
  await botao(page).click();
  expect(await page.evaluate(() => localStorage.getItem("ml_theme"))).toBe("light");
  await page.reload();
  expect(await tema(page)).toBe("light");
  await page.goto("/privacidade.html");
  expect(await tema(page)).toBe("light");
  expect(luz(await fundo(page))).toBeGreaterThan(0.85);
  await page.goto("/ranking");
  expect(await tema(page)).toBe("light");
});

test("um valor guardado inválido volta ao escuro, sem quebrar nada", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ml_theme", "<script>x</script>"));
  await page.goto("/");
  expect(await tema(page)).toBe("dark");
});

test("sem piscar: o tema já está aplicado quando a página começa a aparecer", async ({ page }) => {
  await claro(page);
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { window.__fundo0 = getComputedStyle(document.body).backgroundColor; window.__tema0 = document.documentElement.dataset.theme; }));
  await page.goto("/");
  expect(await page.evaluate(() => window.__tema0)).toBe("light");
  expect(luz(await page.evaluate(() => window.__fundo0))).toBeGreaterThan(0.85);
});

test("o botão cabe no cabeçalho em 320, 375 e 1280 px: alvo ≥ 44px e sem cobrir o logo", async ({ page }) => {
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const b = await botao(page).boundingBox(), l = await page.getByRole("link", { name: /Minha LineUp/i }).boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x + b.width, `${width}px: botão dentro da tela`).toBeLessThanOrEqual(width);
    expect(b.x, `${width}px: botão não cobre o logo`).toBeGreaterThanOrEqual(l.x + l.width - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  }
});

test("o botão funciona no teclado (Enter e Espaço)", async ({ page }) => {
  await page.goto("/");
  await botao(page).focus();
  await page.keyboard.press("Enter"); expect(await tema(page)).toBe("light");
  await page.keyboard.press("Space"); expect(await tema(page)).toBe("dark");
});

/* ------------------------------ contraste no modo claro ------------------------------ */
async function exige(page, onde) {
  const falhas = await auditar(page);
  expect(falhas, `${onde}: texto abaixo de 4,5:1 no modo claro\n${falhas.map((f) => `  ${f.razao}  ${f.el}  "${f.texto}"  ${f.fg}`).join("\n")}`).toEqual([]);
}

test("contraste AA no modo claro: home (com Top 5 e Multiplayer), draft, time, rodada e resultado", async ({ page }) => {
  await claro(page);
  const g = new GamePage(page); await g.stubOnlineApi({ board: BOARD }); await g.useSeed(SEEDS.campeao);
  await g.open(); await exige(page, "home");
  await g.startFreePlay("Falcons BR"); await exige(page, "draft");
  await g.draftAll(); await exige(page, "tela do time");
  await page.getByRole("button", { name: /Disputar o Major/ }).click(); await exige(page, "rodada");
  await page.getByRole("button", { name: /Simular até o fim/ }).click(); await exige(page, "resultado");
});

test("contraste AA no modo claro: ranking e páginas informativas", async ({ page }) => {
  await claro(page);
  await page.route("**/api/v1/daily", (r) => r.fulfill({ json: { day: "2026-11-28", seed: 1 } }));
  await page.route("**/api/v1/daily/leaderboard**", (r) => r.fulfill({ json: { day: "2026-11-28", data: BOARD } }));
  await page.goto("/ranking"); await expect(page.getByRole("listitem").first()).toBeVisible(); await exige(page, "ranking");
  for (const p of ["/sobre.html", "/privacidade.html", "/termos.html", "/majors.html", "/funcoes.html", "/formato-suico.html"]) { await page.goto(p); await exige(page, p); }
});

test("contraste AA no modo claro: campeonato (lobby, draft, rodada, resultado)", async ({ browser }) => {
  for (const [nome, view] of [
    ["draft", campeonato({ phase: "draft", draftDone: false, picks: 2 })], ["estilo", campeonato({ phase: "draft", draftDone: true })],
    ["rodada", campeonato({ script: ["V"] })],
    ["resultado", campeonato({ phase: "done", script: ["V", "V", "D", "V", "qf:V", "sf:V", "final:DF"], status: "out:Final", wins: 3, losses: 1 })],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await ctx.addInitScript(() => localStorage.setItem("ml_theme", "light"));
    const page = await ctx.newPage();
    await abrirSala(page, { view });
    await exige(page, `campeonato ${nome}`);
    await ctx.close();
  }
});

test("contraste AA no modo claro: leilão (lobby, lance, enviado, revelação com empate, estilo)", async ({ browser }) => {
  const empate = { ...REVELACAO, tie: "speed" };
  for (const [nome, view] of [
    ["lobby", leilao({ phase: "lobby" })], ["lance", leilao({ squad: { IGL: comprado("Fulano", 40) }, coins: 60, last: REVELACAO })],
    ["enviado", leilao({ submitted: true, bid: 30, canBid: false, why: "submitted" })],
    ["sem-papel", leilao({ canBid: false, why: "role-filled", squad: { AWP: comprado("Fulano", 40) } })],
    ["revelacao", leilao({ step: "reveal", last: empate, canBid: false })],
    ["estilo", leilao({ phase: "style", squad: elencoLeilao(), fills: [{ slot: 0, role: "IGL", nick: "Fulano", forca: 80, team: "X" }] })],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await ctx.addInitScript(() => localStorage.setItem("ml_theme", "light"));
    const page = await ctx.newPage();
    await abrirSala(page, { kind: "auctions", view });
    await exige(page, `leilão ${nome}`);
    await ctx.close();
  }
});

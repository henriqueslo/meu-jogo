/* Página "Apoie o projeto": Pix estático (QR + copia e cola) gerado no navegador, sem terceiros. */
import { test, expect } from "@playwright/test";
import { auditar } from "./contraste.js";

test.use({ viewport: { width: 375, height: 812 } });

const CHAVE = "2376bee9-7825-4e2f-9ab2-7dd83bd5e946";
const config = (page, obj) => page.route("**/js/apoio-config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `export const APOIO = ${JSON.stringify(obj)};` }));
const semRolagem = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test("mostra o título, o QR code, a chave e o aviso de doação voluntária", async ({ page }) => {
  await page.goto("/apoie.html");
  await expect(page.getByRole("heading", { level: 1, name: /Apoie o projeto/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code do Pix/i })).toBeVisible();
  await expect(page.getByText(CHAVE)).toBeVisible();
  await expect(page.getByText(/sem contrapartida/i).first()).toBeVisible();
  await expect(page.getByText(/sem reembolso/i).first()).toBeVisible();
  await expect(page.getByText(/confira o nome do titular/i)).toBeVisible();
});

test("o QR tem fundo branco (o leitor precisa) mesmo no tema escuro, e o tamanho cabe na tela", async ({ page }) => {
  for (const largura of [320, 375, 1280]) {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto("/apoie.html");
    const qr = page.getByRole("img", { name: /QR code do Pix/i });
    const caixa = await qr.boundingBox();
    expect(caixa.width, `${largura}px`).toBeGreaterThanOrEqual(200);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura);
    expect(await semRolagem(page), `${largura}px: sem rolagem lateral`).toBeLessThanOrEqual(0);
  }
  expect(await page.locator("#pix-qr svg rect").first().getAttribute("fill")).toBe("#fff");
});

test("Copiar Pix: coloca o 'copia e cola' (BR Code com a chave e o CRC) na área de transferência", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/apoie.html");
  await page.getByRole("button", { name: /Copiar Pix copia e cola/i }).click();
  await expect(page.getByRole("status")).toContainText(/copiado/i);
  const copiado = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiado).toMatch(/^000201/);
  expect(copiado).toContain("br.gov.bcb.pix0136" + CHAVE);
  expect(copiado).toMatch(/6304[0-9A-F]{4}$/);
  expect(await page.locator("#pix-code").inputValue()).toBe(copiado);
});

test("Copiar só a chave", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/apoie.html");
  await page.getByRole("button", { name: /Copiar só a chave/i }).click();
  await expect(page.getByRole("status")).toContainText(/copiad/i);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CHAVE);
});

test("sem permissão para a área de transferência, o texto fica selecionado e a pessoa é avisada", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: undefined }));
  await page.goto("/apoie.html");
  await page.getByRole("button", { name: /Copiar Pix copia e cola/i }).click();
  await expect(page.getByRole("status")).toContainText(/copiado|selecionado|copie/i);
});

test("sem chave configurada: avisa que o apoio não está disponível e não mostra QR nem botões de copiar", async ({ page }) => {
  await config(page, { pixKey: "", nome: "X", cidade: "Y", plataforma: "" });
  await page.goto("/apoie.html");
  await expect(page.getByText(/ainda não está disponível/i)).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Copiar/i })).toHaveCount(0);
});

test("chave inválida na configuração também não vira QR", async ({ page }) => {
  await config(page, { pixKey: "meu-cpf-123", nome: "X", cidade: "Y", plataforma: "" });
  await page.goto("/apoie.html");
  await expect(page.getByText(/ainda não está disponível/i)).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code/i })).toHaveCount(0);
});

test("link de plataforma: só aparece se for https, abre em outra aba com noopener noreferrer", async ({ page }) => {
  await config(page, { pixKey: CHAVE, nome: "Minha LineUp", cidade: "Brasil", plataforma: "https://ko-fi.com/exemplo" });
  await page.goto("/apoie.html");
  const link = page.getByRole("link", { name: /outra forma de apoiar|plataforma/i });
  await expect(link).toHaveAttribute("href", "https://ko-fi.com/exemplo");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(link).toHaveAttribute("rel", /noreferrer/);

  for (const ruim of ["javascript:alert(1)", "http://ko-fi.com/x", "//ko-fi.com/x", "data:text/html,x"]) {
    const p2 = await page.context().newPage();
    await config(p2, { pixKey: CHAVE, nome: "Minha LineUp", cidade: "Brasil", plataforma: ruim });
    await p2.goto("/apoie.html");
    await expect(p2.getByRole("link", { name: /outra forma de apoiar|plataforma/i }), ruim).toHaveCount(0);
    await p2.close();
  }
});

test("a página não faz nenhum pedido para fora do site", async ({ page, baseURL }) => {
  const fora = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http") && u.origin !== new URL(baseURL).origin) fora.push(r.url()); });
  await page.goto("/apoie.html");
  await expect(page.getByRole("img", { name: /QR code do Pix/i })).toBeVisible();
  expect(fora).toEqual([]);
});

test("o rodapé da home e de cada página leva a 'Apoie o projeto'", async ({ page }) => {
  for (const p of ["/", "/sobre.html", "/privacidade.html", "/termos.html", "/majors.html", "/funcoes.html", "/formato-suico.html", "/ranking"]) {
    await page.goto(p);
    await page.getByRole("contentinfo").getByRole("link", { name: "Apoie o projeto" }).click();
    await expect(page, p).toHaveURL(/\/apoie\.html$/);
  }
});

for (const tema of ["dark", "light"]) {
  test(`contraste AA no modo ${tema === "light" ? "claro" : "escuro"}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("ml_theme", t), tema);
    await page.goto("/apoie.html");
    await expect(page.getByRole("img", { name: /QR code do Pix/i })).toBeVisible();
    const falhas = await auditar(page);
    expect(falhas, falhas.map((f) => `${f.razao} ${f.el} "${f.texto}"`).join("\n")).toEqual([]);
  });
}

/* Leilão multiplayer (cliente): convite, lobby, lance fechado, revelação, estilo e o torneio (o mesmo do campeonato).
 * O servidor é simulado (e2e/mp.js): o cliente é só um espelho do estado que ele manda. */
import { test, expect } from "@playwright/test";
import { GamePage } from "./pages/game.js";
import { abrirSala, leilao, REVELACAO, comprado, elencoLeilao, campeonato, textoCompartilhado } from "./mp.js";

test.use({ viewport: { width: 375, height: 812 } });

const sala = (page, view, o = {}) => abrirSala(page, { kind: "auctions", view, ...o });
const box = async (loc) => { const b = await loc.first().boundingBox(); if (!b) throw new Error("elemento sem caixa (invisível?)"); return { ...b, right: b.x + b.width, bottom: b.y + b.height }; };
const campo = (page) => page.getByLabel(/Seu lance/);
const darLance = (page) => page.getByRole("button", { name: /Dar lance/ });
const passar = (page) => page.getByRole("button", { name: /^Passar/ });
const cartao = (page) => page.getByRole("region", { name: /Jogador em leilão/ });
const quadro = (page) => page.getByRole("list", { name: /Jogadores/ });
const elenco = (page) => page.getByRole("list", { name: /Seu elenco/ });
const medir = (page) => page.evaluate(() => {
  const vis = (e) => e.getClientRects().length > 0;
  const scope = document.querySelector(".screen.active");
  const small = [...scope.querySelectorAll("button, summary, input, [role=radio]")].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.height < 44).map(({ e, r }) => `${e.id || e.textContent.trim().slice(0, 22)} ${Math.round(r.height)}px`);
  const tiny = [...new Set([...scope.querySelectorAll("*")].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
    .map((e) => `${e.className || e.tagName} ${getComputedStyle(e).fontSize}`))];
  return { small, tiny, overflowX: document.documentElement.scrollWidth - innerWidth };
});

/* ------------------------------ home, convite e lobby ------------------------------ */
test("home: 'Criar leilão' cria a sala e entra nela (o nome é obrigatório)", async ({ page }) => {
  const g = new GamePage(page); await g.stubOnlineApi();
  await page.route("**/api/v1/auctions", (r) => r.fulfill({ status: 201, json: { code: "ABC234" } }));
  await page.routeWebSocket("**/api/v1/auctions/ABC234/ws", () => {});
  await g.open();
  const criar = page.getByRole("group", { name: /Leilão/ }).getByRole("button", { name: /Criar leilão/ });
  await expect(criar).toBeEnabled();
  await criar.click();
  await expect(page.getByRole("alert").filter({ hasText: /nome/i })).toBeVisible();
  await g.typeName("Furia Test");
  await criar.click();
  await expect(page.getByText(/Leilão · sala ABC234/)).toBeVisible();
});

test("o link ?leilao= abre o convite do leilão, direto na página da sala", async ({ page }) => {
  await page.route("**/api/v1/auctions/ABC234", (r) => r.fulfill({ json: { exists: true, phase: "lobby" } }));
  await page.routeWebSocket("**/api/v1/auctions/ABC234/ws", () => {});
  await page.goto("/?leilao=ABC234");
  await expect(page.getByRole("heading", { level: 2, name: /convidado.*leilão/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Jogar agora/ })).toBeHidden();
  await page.getByLabel(/Seu nome de time/).fill("Convidado");
  await page.getByRole("button", { name: /^Entrar no leilão/ }).click();
  await expect(page.getByText(/Leilão · sala ABC234/)).toBeVisible();
});

test("entrar com um código vale também para a sala de leilão (o servidor diz o tipo)", async ({ page }) => {
  const g = new GamePage(page); await g.stubOnlineApi();
  await page.route("**/api/v1/cups/ABC234", (r) => r.fulfill({ status: 404, json: {} }));
  await page.route("**/api/v1/auctions/ABC234", (r) => r.fulfill({ json: { exists: true, phase: "lobby" } }));
  await page.routeWebSocket("**/api/v1/auctions/ABC234/ws", () => {});
  await g.open(); await g.typeName("Convidado");
  await page.getByLabel("Código da sala").fill("abc234");
  await page.getByRole("button", { name: /^Entrar/ }).click();
  await expect(page.getByText(/Leilão · sala ABC234/)).toBeVisible();
});

test("lobby: código, link, regras resumidas e 'Iniciar leilão' só com 2 jogadores ou mais", async ({ page }) => {
  await sala(page, leilao({ phase: "lobby", jogadores: 1 }));
  await expect(page.locator("#cup-content").getByText("ABC234").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Copiar link/ })).toHaveAttribute("data-link", /\?leilao=ABC234/);
  await expect(page.locator("#cup-content").getByText(/100 moedas/)).toBeVisible();
  await expect(page.locator("#cup-content").getByText(/lance fechado/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Iniciar leilão/ })).toBeDisabled();
  await expect(page.getByText(/pelo menos 2/)).toBeVisible();
});

test("lobby: o dono inicia (envia 'start'); quem não é dono espera", async ({ page }) => {
  const enviadas = [];
  await sala(page, leilao({ phase: "lobby", jogadores: 3 }), { enviadas });
  await page.getByRole("button", { name: /Iniciar leilão/ }).click();
  await expect.poll(() => enviadas.filter((m) => m.t === "start").length).toBe(1);
});

test("lobby de quem não é o dono: sem botão de iniciar, com aviso", async ({ page }) => {
  await sala(page, leilao({ phase: "lobby", jogadores: 3, host: false }));
  await expect(page.getByRole("button", { name: /Iniciar leilão/ })).toHaveCount(0);
  await expect(page.getByText(/Aguardando o dono iniciar/)).toBeVisible();
});

/* ------------------------------ o leilão ------------------------------ */
test("lance aberto: o jogador (nick, papel, rating, time e ano), o andamento e o tempo", async ({ page }) => {
  await sala(page, leilao());
  const c = cartao(page);
  await expect(c.getByRole("heading", { level: 3, name: "s1mple" })).toBeVisible();
  await expect(c).toContainText("AWP"); await expect(c).toContainText("99");
  await expect(c).toContainText("Natus Vincere"); await expect(c).toContainText("2021");
  await expect(page.getByText(/Leilão 12 de 50/)).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(/^1[45]s$/);
});

test("o tempo desce sozinho (contagem regressiva no cliente)", async ({ page }) => {
  await sala(page, leilao({ msLeft: 6000 }));
  await expect.poll(async () => parseInt((await page.getByRole("timer").innerText()), 10), { timeout: 5000 }).toBeLessThanOrEqual(4);
});

test("mostra as moedas, as vagas e o elenco já conquistado", async ({ page }) => {
  await sala(page, leilao({ coins: 60, squad: { IGL: comprado("Fulano", 40) } }));
  await expect(page.getByText(/60 moedas/)).toBeVisible();
  await expect(page.getByText(/1\/5 vagas/)).toBeVisible();
  const itens = elenco(page).getByRole("listitem");
  await expect(itens).toHaveCount(5);
  await expect(itens.filter({ hasText: "Fulano" })).toContainText("40");
});

test("quadro dos jogadores: moedas, vagas e quem já enviou o lance (sem o valor)", async ({ page }) => {
  await sala(page, leilao());
  const itens = quadro(page).getByRole("listitem");
  await expect(itens).toHaveCount(3);
  await expect(itens.filter({ hasText: "Rival FC" })).toContainText(/enviou/i);
  await expect(itens.filter({ hasText: "Terceiro FC" })).toContainText(/pensando/i);
  await expect(page.getByText("Rival FC")).not.toContainText(/\d+ moedas lance/);
});

test("quantos de cada papel ainda vão aparecer", async ({ page }) => {
  await sala(page, leilao());
  const t = page.getByText(/Ainda vão aparecer/);
  await expect(t).toContainText("AWP 3"); await expect(t).toContainText("Rifler 1");
});

test("dar lance: o botão só liga com um valor válido e envia o número escolhido", async ({ page }) => {
  const enviadas = [];
  await sala(page, leilao(), { enviadas });
  await expect(darLance(page)).toBeDisabled();
  await campo(page).fill("30");
  await expect(darLance(page)).toBeEnabled(); await expect(darLance(page)).toContainText("30");
  await darLance(page).click();
  await expect.poll(() => enviadas.filter((m) => m.t === "bid")).toEqual([{ t: "bid", amount: 30 }]);
});

test("atalhos: +5, +10 e +25 somam ao valor; 'Máx' põe o lance máximo", async ({ page }) => {
  await sala(page, leilao());
  await page.getByRole("button", { name: "+10" }).click(); await page.getByRole("button", { name: "+10" }).click();
  await expect(campo(page)).toHaveValue("20");
  await page.getByRole("button", { name: "+5" }).click(); await expect(campo(page)).toHaveValue("25");
  await page.getByRole("button", { name: "+25" }).click(); await expect(campo(page)).toHaveValue("50");
  await page.getByRole("button", { name: /^Máx/ }).click(); await expect(campo(page)).toHaveValue("96");
  await page.getByRole("button", { name: "+25" }).click();
  await expect(campo(page)).toHaveValue("96");                                   // nunca passa do máximo
});

test("lance acima do máximo: explica a reserva e não envia", async ({ page }) => {
  const enviadas = [];
  await sala(page, leilao(), { enviadas });
  await campo(page).fill("97");
  await expect(page.getByRole("alert").filter({ hasText: /máximo.*96/i })).toBeVisible();
  await expect(darLance(page)).toBeDisabled();
  await page.waitForTimeout(150);
  expect(enviadas.filter((m) => m.t === "bid")).toEqual([]);
});

test("lance com zero, negativo ou decimal não vale", async ({ page }) => {
  await sala(page, leilao());
  for (const v of ["0", "-3", "2.5"]) { await campo(page).fill(v); await expect(darLance(page)).toBeDisabled(); }
});

test("passar envia {t:'pass'}", async ({ page }) => {
  const enviadas = [];
  await sala(page, leilao(), { enviadas });
  await passar(page).click();
  await expect.poll(() => enviadas.filter((m) => m.t === "pass").length).toBe(1);
});

test("depois de enviar: mostra o lance enviado e desliga os controles", async ({ page }) => {
  await sala(page, leilao({ submitted: true, bid: 30, canBid: false, why: "submitted" }));
  await expect(page.getByText(/Lance enviado: 30/)).toBeVisible();
  await expect(darLance(page)).toHaveCount(0); await expect(passar(page)).toHaveCount(0);
});

test("depois de passar: diz que passou", async ({ page }) => {
  await sala(page, leilao({ submitted: true, bid: 0, canBid: false, why: "submitted" }));
  await expect(page.getByText(/Você passou/)).toBeVisible();
});

test("papel já preenchido: explica o motivo e não mostra os controles de lance", async ({ page }) => {
  await sala(page, leilao({ canBid: false, why: "role-filled", squad: { AWP: comprado("Fulano", 40) }, coins: 60 }));
  await expect(page.getByText(/Você já tem AWP/)).toBeVisible();
  await expect(darLance(page)).toHaveCount(0); await expect(campo(page)).toHaveCount(0);
});

test("o que a pessoa digita não se perde (nem o foco) quando chega uma atualização do servidor", async ({ page }) => {
  const { enviar } = await sala(page, leilao());
  await campo(page).click(); await campo(page).pressSequentially("42");
  const v = leilao(); v.players[2].submitted = true;                              // outro jogador enviou o lance
  enviar(v);
  await expect(quadro(page).getByRole("listitem").filter({ hasText: "Terceiro FC" })).toContainText(/enviou/i);
  await expect(campo(page)).toHaveValue("42");
  await expect(campo(page)).toBeFocused();
});

test("um novo leilão limpa o campo de lance", async ({ page }) => {
  const { enviar } = await sala(page, leilao());
  await campo(page).fill("42");
  enviar(leilao({ idx: 13, lot: { ...leilao().lot, nick: "ZywOo", id: "x|ZywOo" } }));
  await expect(cartao(page).getByRole("heading", { level: 3, name: "ZywOo" })).toBeVisible();
  await expect(campo(page)).toHaveValue("");
});

/* ------------------------------ revelação ------------------------------ */
test("revelação: quem levou, por quanto, e o lance de cada um", async ({ page }) => {
  await sala(page, leilao({ step: "reveal", msLeft: 4000, last: REVELACAO, canBid: false }));
  const r = page.getByRole("region", { name: /Revelação/ });
  await expect(r).toContainText(/Rival FC levou s1mple por 41/);
  await expect(r).toContainText("Meu Time"); await expect(r).toContainText("30"); await expect(r).toContainText(/passou/i);
  await expect(darLance(page)).toHaveCount(0);
  await expect(page.getByRole("timer")).toBeVisible();
});

test("revelação sem lances: o jogador é descartado", async ({ page }) => {
  await sala(page, leilao({ step: "reveal", msLeft: 4000, canBid: false, last: { ...REVELACAO, winner: null, price: 0, bids: REVELACAO.bids.map((b) => ({ ...b, amount: 0 })) } }));
  await expect(page.getByRole("region", { name: /Revelação/ })).toContainText(/ninguém levou|descartado/i);
});

test("revelação com empate: diz que levou quem deu o lance primeiro", async ({ page }) => {
  const empate = { ...REVELACAO, tie: "speed", bids: REVELACAO.bids.map((b) => (b.slot === 0 ? { ...b, amount: 41 } : b)) };
  await sala(page, leilao({ step: "reveal", msLeft: 4000, last: empate, canBid: false }));
  const r = page.getByRole("region", { name: /Revelação/ });
  await expect(r).toContainText(/Rival FC levou s1mple por 41/);
  await expect(r).toContainText(/Empate em 41.*Rival FC.*lance primeiro/i);
});

test("revelação com empate no mesmo instante: diz que foi sorteio", async ({ page }) => {
  await sala(page, leilao({ step: "reveal", msLeft: 4000, last: { ...REVELACAO, tie: "draw" }, canBid: false }));
  await expect(page.getByRole("region", { name: /Revelação/ })).toContainText(/mesmo instante.*sorteio/i);
});

test("sem empate a revelação não fala em desempate", async ({ page }) => {
  await sala(page, leilao({ step: "reveal", msLeft: 4000, last: { ...REVELACAO, tie: null }, canBid: false }));
  await expect(page.getByRole("region", { name: /Revelação/ })).not.toContainText(/empate/i);
});

test("a regra do desempate aparece no lobby, antes de começar", async ({ page }) => {
  await sala(page, leilao({ phase: "lobby", jogadores: 2 }));
  await expect(page.locator("#cup-content").getByText(/empate.*lance primeiro/i)).toBeVisible();
});

test("no leilão seguinte, um resumo curto do leilão anterior continua à vista", async ({ page }) => {
  await sala(page, leilao({ last: REVELACAO }));
  await expect(page.getByText(/Último: Rival FC levou s1mple por 41/)).toBeVisible();
});

/* ------------------------------ estilo e torneio ------------------------------ */
test("fim do leilão: força do time, vagas completadas de graça e a escolha do estilo", async ({ page }) => {
  const enviadas = [];
  await sala(page, leilao({ phase: "style", squad: elencoLeilao(95), fills: [{ slot: 0, role: "IGL", nick: "Fulano", forca: 80, team: "Time X" }] }), { enviadas });
  await expect(page.getByRole("region", { name: /Força do time/ })).toBeVisible();
  await expect(page.getByText(/completad[ao]s? de graça/i)).toBeVisible();
  await expect(page.getByRole("radio", { name: /Tático/ })).toBeChecked();
  await page.getByRole("radio", { name: /Rush/ }).click();
  await page.getByRole("button", { name: /Confirmar estilo/ }).click();
  await expect.poll(() => enviadas.filter((m) => m.t === "style")).toEqual([{ t: "style", style: "rush" }]);
});

test("depois do estilo o torneio é o mesmo do campeonato: campanha, rodada e 'Próxima etapa'", async ({ page }) => {
  await sala(page, { ...campeonato({ script: ["V"] }), kind: "auction" });
  await expect(page.getByText(/Leilão · sala ABC234/)).toBeVisible();
  await expect(page.getByRole("region", { name: /Sua campanha/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Próxima etapa/ })).toBeVisible();
});

test("resultado do leilão: herói, jornada e compartilhar com texto de leilão", async ({ page }) => {
  await sala(page, { ...campeonato({ phase: "done", script: ["V", "V", "V", "qf:V", "sf:V", "final:VF"], status: "champion", wins: 3, losses: 0, perfeito: true }), kind: "auction" });
  await expect(page.locator(".result-hero h2")).toContainText(/MAJOR PERFEITO/);
  await expect(page.getByRole("list", { name: /Sua jornada/ }).getByRole("listitem")).toHaveCount(6);
  const { text } = await textoCompartilhado(page);
  expect(text).toMatch(/leilão/i); expect(text).not.toMatch(/campeonato/i); expect(text).toMatch(/minhalineup\.com/);
});

/* ------------------------------ sair ------------------------------ */
test("'Sair do leilão' em cada fase leva à home", async ({ browser }) => {
  for (const view of [leilao({ phase: "lobby" }), leilao(), leilao({ step: "reveal", last: REVELACAO, canBid: false }), leilao({ phase: "style", squad: elencoLeilao() })]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept());                                    // durante o leilão, sair pede confirmação
    await sala(page, view);
    await page.getByRole("button", { name: /Sair do leilão/ }).click();
    await expect(page.getByRole("button", { name: /^Jogar agora/ })).toBeVisible();
    await ctx.close();
  }
});

/* ------------------------------ layout ------------------------------ */
test("telas do leilão no celular: sem rolagem lateral, alvos ≥ 44px e texto ≥ 12px em 320, 375 e 414", async ({ browser }) => {
  const telas = [
    ["lobby", leilao({ phase: "lobby" })], ["lance", leilao({ squad: { IGL: comprado("Fulano", 40) }, coins: 60 })],
    ["enviado", leilao({ submitted: true, bid: 30, canBid: false, why: "submitted" })], ["sem-papel", leilao({ canBid: false, why: "role-filled", squad: { AWP: comprado("Fulano", 40) } })],
    ["revelacao", leilao({ step: "reveal", last: REVELACAO, canBid: false })], ["estilo", leilao({ phase: "style", squad: elencoLeilao() })],
  ];
  for (const width of [320, 375, 414]) for (const [nome, view] of telas) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    await sala(page, view);
    await expect(page.locator(".screen.active")).toBeVisible();
    const m = await medir(page);
    expect.soft(m.overflowX, `${nome} ${width}px: rolagem lateral`).toBeLessThanOrEqual(0);
    expect.soft(m.small, `${nome} ${width}px: alvos pequenos`).toEqual([]);
    expect.soft(m.tiny, `${nome} ${width}px: texto pequeno`).toEqual([]);
    await ctx.close();
  }
});

test("o campo e os botões de lance aparecem sem rolar a página (celular 375×812)", async ({ page }) => {
  await sala(page, leilao());
  for (const l of [campo(page), darLance(page).or(page.getByRole("button", { name: /Dar lance/ })), passar(page)]) await expect(l).toBeInViewport({ ratio: 1 });
});

test.describe("desktop 1280px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("o jogador e os controles de um lado; o quadro e o elenco do outro", async ({ page }) => {
    await sala(page, leilao({ squad: { IGL: comprado("Fulano", 40) }, coins: 60 }));
    const [lote, placar] = [await box(cartao(page)), await box(quadro(page))];
    expect(placar.x, "quadro à direita do jogador em leilão").toBeGreaterThanOrEqual(lote.right);
    const m = await medir(page);
    expect(m.overflowX).toBeLessThanOrEqual(0); expect(m.small).toEqual([]); expect(m.tiny).toEqual([]);
  });
});

/* ------------------------------ desistência: o leilão é cancelado e todos voltam à home ------------------------------ */
import { cancelado } from "./mp.js";
const aviso = (page) => page.getByRole("alert").filter({ hasText: /desistiu do Leilão/ });

test("outro jogador ficou offline: aparece o aviso e você volta à home, sem continuar o leilão", async ({ page }) => {
  const { enviar } = await sala(page, leilao());
  await expect(page.getByRole("region", { name: /Jogador em leilão/ })).toBeVisible();
  await enviar(cancelado({ slot: 2, name: "Time C", why: "offline", voce: 0 }));
  await expect(page.getByRole("button", { name: /^Jogar agora/ })).toBeVisible();
  await expect(aviso(page)).toBeVisible();
  await expect(aviso(page)).toContainText("Jogador desistiu do Leilão");
  await expect(aviso(page)).toContainText("Time C");
  await expect(page.locator("#screen-cup")).not.toHaveClass(/active/);
});

test("o aviso mostra o nome só como texto (sem HTML) e não deixa 'Voltar à sala' para uma sala cancelada", async ({ page }) => {
  const { enviar } = await sala(page, leilao());
  await enviar(cancelado({ name: "<img src=x onerror=alert(1)>", why: "quit" }));
  await expect(aviso(page)).toBeVisible();
  await expect(aviso(page).locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("ml_active"))).toBeNull();
  await expect(page.getByRole("button", { name: /Voltar à sala/ })).toHaveCount(0);
});

test("quem caiu e volta depois vê o aviso na primeira tela (e some o rastro da sala)", async ({ page }) => {
  const { enviar } = await sala(page, leilao());
  await enviar(cancelado({ slot: 0, name: "Meu Time", why: "offline", voce: 0 }));
  await expect(aviso(page)).toContainText(/Você/);
  await expect(page.getByRole("button", { name: /^Jogar agora/ })).toBeVisible();
});

test("o aviso some ao começar outra coisa (não fica preso na home)", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  const { enviar } = await sala(page, leilao());
  await enviar(cancelado());
  await expect(aviso(page)).toBeVisible();
  await page.getByLabel(/Nome do seu time/).fill("Outro");
  await page.getByRole("button", { name: /^Jogar agora/ }).click();
  await expect(page.getByRole("button", { name: /Atualizar Lineups/ })).toBeVisible();
  await page.locator("#logo-home").click();
  await expect(page.getByRole("button", { name: /^Jogar agora/ })).toBeVisible();
  await expect(aviso(page)).toHaveCount(0);
});

test("'Sair do leilão' durante o leilão pede confirmação, avisa que cancela para todos e manda 'quit'", async ({ page }) => {
  const enviadas = [], mensagens = [];
  page.on("dialog", (d) => { mensagens.push(d.message()); d.dismiss(); });
  await sala(page, leilao(), { enviadas });
  await page.getByRole("button", { name: /Sair do leilão/ }).click();
  expect(mensagens[0]).toMatch(/cancela.*todos/i);
  await expect(page.getByRole("region", { name: /Jogador em leilão/ })).toBeVisible();          // recusou: continua no leilão
  expect(enviadas.find((m) => m.t === "quit")).toBeUndefined();
  page.removeAllListeners("dialog"); page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Sair do leilão/ }).click();
  await expect(page.getByRole("button", { name: /^Jogar agora/ })).toBeVisible();
  await expect.poll(() => enviadas.find((m) => m.t === "quit")).toBeTruthy();
});

test("no lobby e depois do leilão, 'Sair' não pergunta nada (não cancela ninguém)", async ({ page }) => {
  let perguntou = false; page.on("dialog", (d) => { perguntou = true; d.dismiss(); });
  await sala(page, leilao({ phase: "lobby" }));
  await page.getByRole("button", { name: /Sair do leilão/ }).click();
  await expect(page.getByRole("button", { name: /^Jogar agora/ })).toBeVisible();
  expect(perguntou).toBe(false);
});

test("durante o leilão, quem está offline aparece com aviso de que o leilão pode ser cancelado", async ({ page }) => {
  const v = leilao(); v.players[2].connected = false;
  await sala(page, v);
  await expect(page.getByText(/offline/i).first()).toBeVisible();
  await expect(page.getByText(/será cancelado|cancela/i).first()).toBeVisible();
});

test("o 'Sair' em cada fase continua levando à home (agora confirmando só durante o leilão)", async ({ browser }) => {
  for (const view of [leilao({ phase: "lobby" }), leilao({ phase: "style", squad: elencoLeilao() })]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await sala(page, view);
    await page.getByRole("button", { name: /Sair do leilão/ }).click();
    await expect(page.getByRole("button", { name: /^Jogar agora/ })).toBeVisible();
    await ctx.close();
  }
});

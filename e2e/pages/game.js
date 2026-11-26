/* Page Object do jogo: encapsula como se chega a cada tela, para os testes lerem como o usuário joga. */
export class GamePage {
  constructor(page) {
    this.page = page;
    this.nameInput = page.getByLabel(/Nome do seu time/);
    this.begin = page.getByRole("button", { name: /Montar minha lineup/ });
    this.next = page.getByRole("button", { name: /→/ });                  // “Próxima rodada →”, “Semifinal →”…
    this.offers = page.locator("#lineup-offers button:not([disabled])");  // jogadores escolhíveis do draft
  }

  /* Simula o backend online (o botão de modos só aparece se /api/v1/daily responder). */
  async stubOnlineApi() {
    await this.page.route("**/api/v1/daily", (r) => r.fulfill({ json: { day: "2026-11-26", seed: 123456, max_refreshes: 3 } }));
    await this.page.route("**/api/v1/daily/leaderboard**", (r) => r.fulfill({ json: { day: "2026-11-26", data: [] } }));
  }

  async open() { await this.page.goto("/"); }

  async typeName(name = "Meu Time") { await this.nameInput.fill(name); }

  async startFreePlay(name) { await this.typeName(name); await this.begin.click(); }

  async draftAll() {
    for (let i = 0; i < 5; i++) await this.offers.first().click();
    await this.page.getByRole("heading", { name: /Sua LineUp está pronta/i }).waitFor();
  }

  async chooseStyle(label = /Tático/) {
    await this.page.getByRole("radio", { name: label }).click();
    await this.page.getByRole("button", { name: /Disputar o Major/ }).click();
  }

  /* Avança etapa por etapa até a tela de resultado, chamando `onStep` a cada tela nova. */
  async playToResults(onStep = async () => {}) {
    for (let i = 0; i < 15; i++) {
      await onStep(i);
      if (await this.page.locator("#screen-results.active").count()) return;
      await this.next.click();
    }
    await this.page.locator("#screen-results.active").waitFor();
  }
}

/* Mede a tela ativa. Roda dentro da página. */
export function measureActiveScreen() {
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  const label = (e) => (e.id ? "#" + e.id : (e.textContent || e.placeholder || e.tagName).trim().slice(0, 32));
  const scope = document.querySelector(".screen.active") ?? document.body;
  const targets = [...scope.querySelectorAll("button, input, [role=radio]")].filter(vis);
  const small = targets.map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.height < 44 || r.width < 44)
    .map(({ e, r }) => `${label(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  const tiny = [];
  for (const e of scope.querySelectorAll("*")) {
    if (!vis(e)) continue;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (own && fs < 12) tiny.push(`${label(e)} ${fs}px`);
  }
  return { overflowX: document.documentElement.scrollWidth - window.innerWidth, small, tiny: [...new Set(tiny)] };
}

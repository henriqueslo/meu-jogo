import { defineConfig } from "@playwright/test";

/* Testes de interface (UX). Ficam em e2e/ — fora de test/ de propósito, porque `node --test`
 * executa qualquer .js dentro de test/ e quebraria com os specs do Playwright. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.js",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",          // sem overlay de fase: testes rápidos e estáveis
    // PW_CHANNEL=msedge (ou chrome) usa o navegador JÁ instalado no computador, sem baixar nada.
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  },
  webServer: {
    command: "node e2e/serve.js",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});

/* Botão de tema (☀️ / 🌙). O tema em si é aplicado antes da página aparecer por theme-init.js; aqui só o botão. */
const KEY = "ml_theme";
const atual = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

function mostrar(btn, t) {
  const claro = t === "light";
  btn.textContent = claro ? "🌙" : "☀️";
  btn.setAttribute("aria-pressed", String(claro));
  btn.setAttribute("aria-label", claro ? "Mudar para o modo escuro" : "Mudar para o modo claro");
}

export function iniciarTema(btn) {
  if (!btn) return;
  mostrar(btn, atual());
  btn.addEventListener("click", () => {
    const novo = atual() === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem(KEY, novo); } catch { /* sem storage: vale só nesta visita */ }
    mostrar(btn, novo);
  });
}

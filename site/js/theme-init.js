/* Aplica o tema ANTES de a página aparecer (sem piscar). Carregado no <head> de todas as páginas.
 * A escolha da pessoa fica em localStorage (ml_theme = "light" | "dark"); sem escolha, ou com valor inválido, o escuro. */
(function () {
  var t = null;
  try { t = localStorage.getItem("ml_theme"); } catch (e) { /* sem storage: escuro */ }
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
})();

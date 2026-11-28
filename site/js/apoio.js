/* Página "Apoie o projeto": monta o QR e o "copia e cola" do Pix a partir de apoio-config.js. Tudo no navegador:
 * nenhum pedido de rede, nada guardado no aparelho de quem visita. */
import { APOIO } from "./apoio-config.js";
import { brCode, chavePixValida } from "./pix.js";
import { qrSvg } from "./qr.js";

const $ = (id) => document.getElementById(id);

/* Só endereço https completo vira link (nada de javascript:, data:, http: ou //). */
function linkSeguro(url) {
  try { const u = new URL(String(url)); return u.protocol === "https:" && /^https:\/\//i.test(String(url)) ? u.href : null; } catch { return null; }
}

function avisa(msg) { $("pix-status").textContent = msg; }

/* Copia pelo navegador; se não der (sem permissão, aparelho antigo), deixa o texto selecionado para copiar à mão. */
async function copiar(texto, selecionavel) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("sem clipboard");
    await navigator.clipboard.writeText(texto);
    avisa("Copiado! Cole no app do seu banco.");
  } catch {
    selecionavel.focus(); selecionavel.select?.();
    let ok = false; try { ok = document.execCommand("copy"); } catch { /* sem suporte */ }
    avisa(ok ? "Copiado! Cole no app do seu banco." : "Texto selecionado: use “Copiar” do seu aparelho.");
  }
}

function iniciar() {
  if (!chavePixValida(APOIO.pixKey)) { $("apoio-indisponivel").hidden = false; return; }
  const codigo = brCode({ chave: APOIO.pixKey, nome: APOIO.nome, cidade: APOIO.cidade });
  $("pix-qr").innerHTML = qrSvg(codigo, "QR code do Pix para apoiar o projeto");
  const area = $("pix-code"), chave = $("pix-chave"); area.value = codigo; chave.textContent = APOIO.pixKey.toLowerCase();
  $("copiar-codigo").addEventListener("click", () => copiar(codigo, area));
  $("copiar-chave").addEventListener("click", () => {
    const campo = document.createElement("textarea"); campo.value = chave.textContent; campo.readOnly = true; campo.style.cssText = "position:fixed;opacity:0;left:-9999px";
    document.body.appendChild(campo); copiar(chave.textContent, campo).finally(() => campo.remove());
  });
  const plataforma = linkSeguro(APOIO.plataforma);
  if (plataforma) { $("plataforma-link").href = plataforma; $("apoio-plataforma").hidden = false; }
  $("apoio-conteudo").hidden = false;
}

iniciar();

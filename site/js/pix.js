/* PIX estático (BR Code, padrão do Banco Central): monta o texto do "copia e cola" e do QR a partir da chave.
 * Tudo local, sem API e sem serviço de terceiros. Sem valor e sem identificador: quem doa escolhe quanto, e o
 * mesmo QR serve para sempre. A chave aleatória (UUID) é pública por natureza (qualquer pagador a enxerga). */

const EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Campo do formato TLV: id (2) + tamanho (2 dígitos) + valor. */
export const tlv = (id, valor) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;

/* CRC-16/CCITT-FALSE (poly 0x1021, início 0xFFFF), em 4 hexadecimais maiúsculos. */
export function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/* Só a chave aleatória é aceita aqui: não deixamos CPF, e-mail ou telefone no código público. */
export const chavePixValida = (c) => typeof c === "string" && EVP.test(c);

/* Nome e cidade do BR Code: maiúsculas, sem acento nem símbolo, no máximo `max` caracteres. */
const limpo = (s, max) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
  .replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();

export function brCode({ chave, nome, cidade }) {
  if (!chavePixValida(chave)) throw new Error("chave Pix inválida (use a chave aleatória)");
  const corpo = tlv("00", "01") + tlv("01", "11")                                   // 11 = QR reutilizável
    + tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", chave.toLowerCase()))
    + tlv("52", "0000") + tlv("53", "986") + tlv("58", "BR")
    + tlv("59", limpo(nome, 25) || "APOIO") + tlv("60", limpo(cidade, 15) || "BRASIL")
    + tlv("62", tlv("05", "***")) + "6304";
  return corpo + crc16(corpo);
}

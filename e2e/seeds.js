/* Sementes que levam a desfechos conhecidos quando o jogador escolhe SEMPRE o primeiro jogador
 * disponível e o estilo Tático (o que os testes fazem). Assim os testes de interface não dependem
 * de sorte. test/seeds.test.js confere que continuam valendo; se o motor mudar, ele avisa. */
export const SEEDS = {
  eliminado_2_3: 3,        // fase suíça 2-3, eliminado
  eliminado_0_3: 26,       // 3 derrotas seguidas
  playoffs_e_perdeu: 1,    // classifica (3-2) e cai nos playoffs
  campeao: 2,              // 3-0 e campeão (perdendo algum mapa)
  perfeito: 111,           // 3-0, campeão invicto
};

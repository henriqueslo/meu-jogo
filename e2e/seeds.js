/* Sementes que levam a desfechos conhecidos quando o jogador escolhe SEMPRE o primeiro jogador
 * disponível e o estilo Tático (o que os testes fazem). Assim os testes de interface não dependem
 * de sorte. test/seeds.test.js confere que continuam valendo; se o motor mudar, ele avisa. */
export const SEEDS = {
  eliminado_2_3: 3,        // fase suíça 2-3, eliminado
  eliminado_0_3: 26,       // 3 derrotas seguidas
  playoffs_e_perdeu: 1,    // classifica (3-2) e cai nos playoffs
  campeao: 2,              // 3-0 e campeão (perdendo algum mapa)
  perfeito: 111,           // 3-0, campeão invicto
  // "Tentar de novo": o 1º jogo usa a seed 2 (draft + torneio, campeão); no retry a seed do TORNEIO passa a ser 1
  // com o MESMO time, e termina eliminado (1-3).
  retry: [2, 1],
  // Força do time montado (primeiro jogador disponível a cada escolha): forte, média e fraca frente às lineups históricas.
  forca: { acima: 1, media: 4, abaixo: 13 },
};

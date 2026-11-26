# Auditoria de UX — Minha LineUp

Data: 26/11/2026 · Método: fluxo completo percorrido no navegador (celular 375×812 e desktop 1024), medindo layout, alvos de toque, tipografia e contraste (não só olhando). Princípio: **experiência primeiro, beleza depois.**

## O que já funciona bem (preservar)
- Identidade forte (laranja T × azul CT), contraste alto (nome 13,9:1; papel 5,9:1).
- Sua partida vem **destacada no topo** de cada rodada.
- Botões semânticos (`<button>`), foco visível, `prefers-reduced-motion` respeitado, reentrada na sala.
- Fluxo curto e claro: nome → draft → estilo → torneio → resultado.

## Problemas, por impacto

### P0 — quebram ou escondem o fluxo
| ID | Onde | Problema (evidência medida) | Correção proposta |
|---|---|---|---|
| U-01 | Início (celular) | A linha “código + Duelo + Campeonato” estoura: `scrollWidth` 455 contra 375. A página **rola de lado e encolhe** todas as telas. Causa: campo com largura mínima de 211 px em linha que não quebra. | `min-width:0` no campo, quebra de linha, e um único botão “Entrar” |
| U-02 | Rodadas e resultado | O botão principal fica **~600 px abaixo da dobra** em toda rodada (y=1416 numa tela de 812; são 9 vezes). No resultado, Compartilhar (y≈918) e Jogar de novo (y≈968) também ficam fora da tela. | Barra de ação fixa no rodapé nas telas de fluxo |
| U-03 | Draft, estilo, resultado | Texto de **9 px**, **9,5 px** e **11,5 px** (rótulos, papéis, metadados). | Mínimo 12–13 px; ratings em destaque |
| U-04 | Geral | Botões principais com **42 px** de altura (mínimo recomendado: 44–48 px). | `min-height: 48px` |

### P1 — fricção e falta de clareza
| ID | Onde | Problema | Correção proposta |
|---|---|---|---|
| U-05 | Início e estilo | Botões principais **desabilitados sem explicar** por quê (“Montar lineup”, “Disputar o Major”). | Dica junto ao botão; estilo padrão pré-selecionado |
| U-06 | Início | 7 ações disputando atenção + regras longas; o nome é exigido antes de qualquer coisa. | 1 ação primária (“Jogar”); modos como cartões; nome sugerido; regras em 3 passos recolhíveis |
| U-07 | Entrar em sala | Exige escolher “Duelo” ou “Campeonato” para um código que o usuário não sabe de qual tipo é. | Um botão “Entrar”; o servidor responde o tipo (a consulta `GET /rooms/:code` já existe) |
| U-08 | Draft | **Sem desfazer**: um toque errado é definitivo; chips pequenos e próximos. | Aviso “Desfazer” por 5 s |
| U-09 | Draft | “Vaga 1 de 5” sugere ordem, mas os papéis são livres; chips ocupados aparecem **riscados sem explicação**. | Mostrar as 5 vagas por papel, destacar as que faltam, explicar “papel já preenchido” |
| U-10 | Estilo/resultado | **Força do time não aparece**; o estilo é escolhido sem contexto. | Nota geral do time + efeito de cada estilo em linguagem simples |
| U-11 | Rodadas | 8 partidas com o mesmo peso; depois do overlay o usuário perde “onde estou”. | Resumo fixo (“Você: 2-0 · basta 1 vitória”), outros jogos recolhidos, “simular até o fim” |
| U-12 | Transições | Overlay de fase trava a tela por **1,3 s a cada etapa** (9×); o toque para pular não é descoberto. | Só nos momentos-chave (playoffs, final), mais curto, dica de pular |
| U-13 | Resultado | Cartão discreto, **sem a história da campanha**; compartilhar e jogar de novo ficam no fim. | Pico emocional, campanha em sequência (🟩🟩🟥…), Compartilhar como ação primária |
| U-14 | Pós-jogo | Nenhum convite para os modos online no momento de maior engajamento. | “Desafiar um amigo” / “Desafio do dia” após o resultado |

### P2 — polimento
| ID | Onde | Problema | Correção proposta |
|---|---|---|---|
| U-15 | Desktop | Coluna fixa de 640 px; 3 ofertas empilhadas. | Grade de 3 colunas em ≥ 1024 px |
| U-16 | Feedback | Erros em texto vermelho solto; sem estado de carregamento ao criar sala. | Toasts, esqueletos, microanimações de escolha |
| U-17 | Acessibilidade | Atualizações de sala e rodada não são anunciadas a leitores de tela. | Regiões `aria-live` |
| U-18 | Modos online | Falha de rede e sala inexistente sem tratamento visual claro. | Estados de erro e vazio desenhados |

## Roteiro (UX → beleza)
1. ✅ **Fase A — consertar** (U-01…U-04, e U-09 em parte): **feita.** Sem rolagem lateral de 320 a 414 px, alvos de 48 px, texto mínimo de 12 px; elenco em linhas legíveis e o draft mostra só o que falta (“Faltam: AWP · IGL…”) em vez de 5 vagas vazias.
2. ✅ **Fase B — fluxo** (U-02, U-05, U-07, U-08, U-09, U-12): **feita.** Barra de ação fixa (“Próxima rodada”, “Compartilhar”, “Jogar de novo” sempre à vista); botões que explicam em vez de ficarem mortos; estilo Tático pré-selecionado; entrar em sala com **um** botão (o servidor diz se é duelo ou campeonato); “Desfazer última escolha” no draft (livre, desafio, duelo e campeonato); jogador apagado diz por quê; transição de fase só no mata-mata (900 ms, tocar pula).
3. **Fase C — jornada** (U-06, U-10, U-11, U-13, U-14): início enxuto, resumo de rodada, resultado com história e funil.
4. **Fase D — beleza** (U-15…U-18 e o visual): grade no desktop, movimento, cartões, tema.

Cada fase termina com testes de fluxo no navegador (Playwright): sem rolagem lateral em 375 px, alvos ≥ 44 px, fonte ≥ 12 px, ação principal visível sem rolar.

## Testes de interface (Playwright)
`e2e/layout.spec.js` percorre o jogo em celulares de **320, 375 e 414 px** e, em **cada tela**, exige: sem rolagem lateral, todo botão/campo ≥ 44×44 px e nenhum texto < 12 px. Ele foi escrito **antes** da correção e falhou reproduzindo a auditoria (ex.: rolagem de 135 px em 320 px); agora passa.

```bash
npm.cmd install                          # uma vez (instala @playwright/test)
npx.cmd playwright install chromium      # uma vez (baixa o navegador de teste)
npm.cmd run test:e2e                     # roda os testes de interface
```
Sem baixar nada: se já tem o Edge ou o Chrome, use `$env:PW_CHANNEL="msedge"` (ou `"chrome"`) antes de `npm.cmd run test:e2e`.

O servidor de teste (`e2e/serve.js`) usa a mesma CSP de produção. Os specs ficam em `e2e/` (não em `test/`, que o `node --test` executa). O CI roda `npm test` e `npm run test:e2e` em jobs separados. Duelo e campeonato (WebSocket) ainda não têm spec: foram verificados à mão e entram numa fase futura.

### Como a Fase B foi construída
- **Desfazer seguro:** o `Draft` (agora compartilhado entre navegador e servidor, em `site/js/engine.js`) é uma função de `(seed, ações)`. Desfazer = refazer tudo menos a última escolha; as ofertas voltam **idênticas** e o log do Desafio do dia continua válido para o servidor (`test/draft.test.js` prova, inclusive depois de desfazer e escolher outro jogador).
- **Multiplayer:** nova mensagem `undo` (só na fase de draft e antes de fixar o estilo); a visão do jogador traz `canUndo`.
- **Testes:** `e2e/flow.spec.js` (10 cenários, escritos antes e vermelhos) cobre barra fixa, validação no clique, estilo padrão, desfazer, motivo do jogador apagado, entrar com código único (WebSocket simulado pelo Playwright) e transições.

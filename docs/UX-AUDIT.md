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
3. ✅ **Fase C — jornada** (U-06, U-10, U-11, U-13, U-14): **feita.** Início enxuto (C1), estilo com contexto (C2), rodadas com a campanha à vista (C3), resultado com a história do torneio e convites (C4); depois, o duelo e o campeonato ganharam a mesma experiência e o compartilhar.
4. **Fase D — beleza:** **D1 e D2 (grade no desktop, solo e multiplayer) feitas**; **D3 (movimento) feita**; o tema (D4) já saiu no pacote beta (modo claro).
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

### Fase C3 — rodadas com a campanha à vista (U-11) ✅
- **Painel “Sua campanha”** em toda etapa: placar (2-1), sequência 🟩🟥 e uma frase do que falta (“classifica com mais 1 vitória · elimina com mais 2 derrotas”; nos playoffs, a fase ou onde caiu).
- **Só o seu jogo aparece inteiro**; os outros ficam em “Ver os outros 7 jogos” (abertos por padrão quando você não joga mais).
- **“Simular até o fim”** na barra fixa (some na final, onde o botão já leva ao resultado).
- A campanha fica registrada em `state.journey` (etapa, adversário, placar, mapas), que alimenta o resultado na C4.
- **Testes determinísticos:** `e2e/seeds.js` guarda sementes que levam a desfechos conhecidos (eliminado 0-3, 2-3, perdeu nos playoffs, campeão, perfeito) e `GamePage.useSeed()` as injeta; `test/seeds.test.js` avisa se o motor mudar e for preciso regenerá-las.

### Fase C4 — resultado com a história do torneio (U-13, U-14) ✅
- **Herói à altura do desfecho:** “Major perfeito”, “Campeão”, “Vice-campeão — perdeu a final para X”, “Caiu nas quartas/semifinal para X”, e no suíço **quanto faltou** (“ficou a 1 vitória dos playoffs”) com uma sugestão construtiva.
- **Sua jornada:** uma linha por jogo (etapa, adversário, placar, V/D), vinda de `state.journey` (C3).
- **Ações na barra fixa:** *Compartilhar* é a principal; **“Tentar de novo com este time”** (mesmo elenco, nova seed, volta à tela do time para trocar o estilo; **só no jogo livre**) e **“Montar outro time”** (novo draft).
- **“E agora?”** (só com os modos online disponíveis e nome aceito): *Desafiar um amigo* (cria o duelo direto) e *Desafio do dia*.
- **Testes:** `e2e/result.spec.js` (15 cenários, escritos antes) + `SEEDS.retry` (mesmo time, torneio diferente) guardado por teste de unidade.

### Fase C2 — estilo escolhido com contexto (U-10) ✅
- **Força do time:** a tela do time mostra a nota (média dos 5 jogadores) ao lado da média dos adversários e do percentil entre as lineups históricas (“mais forte que 74%…”), com o nível em palavras: acima, na média ou abaixo.
- **Cada estilo em linguagem simples**, com os números reais do motor (`STYLE_INFO`): bônus por round (Rush +2%, Aim +1%, Tático sem bônus) e imprevisibilidade (baixa/média/alta, lida por leitor de tela).
- **Sugestão com motivo:** time forte → Tático (menos zebra); fraco → Rush (a variância ajuda); médio → Aim. Uma só etiqueta “Sugerido” e uma frase explicando. **O padrão continua Tático**: sugerir não escolhe pelo jogador.
- **Testes:** `e2e/style.spec.js` (7 cenários, escritos antes) e `test/strength.test.js` (5), com `SEEDS.forca` para cada nível, guardadas por `test/seeds.test.js`. O motor não mudou: os resultados das simulações são os mesmos de antes.

### Fase C1 — tela inicial enxuta (U-06) ✅
- **Primeiro toque já joga:** o nome vem preenchido (o último usado, ou “Meu Time”), com a nota “Sugestão de nome: troque se quiser”. Tocar no campo seleciona o texto, então digitar já troca. Apagar o nome continua explicando o que fazer (nada de botão morto).
- **Ordem clara:** **Jogar · montar minha lineup** (única ação primária) → **Desafio do dia** (destaque dourado, só com a API no ar) → **Jogar com amigos** (duelo, campeonato, código). Os dois primeiros cabem na primeira tela do celular.
- **Como jogar em 3 passos** (montar 5 jogadores, escolher o estilo, disputar o Major); as **regras completas** ficam recolhidas em “Ver as regras completas”. Sem os modos online, a página inteira tem menos de 1100 px de altura (eram ~2500 px).
- **Privacidade:** o último nome fica só no navegador (`ml_name`, localStorage); a política (`site/privacidade.html`) e a checklist foram atualizadas, e o teste de consistência `ml_*` cobre a chave.
- **Testes:** `e2e/start.spec.js` (9 cenários, escritos antes); `flow.spec.js` ajustado para apagar o nome sugerido antes de testar o erro.

### Ajuste pós-C1 — convite direto e nome obrigatório ✅
Feedback de uso: quem recebia o link caía na home e o botão laranja iniciava uma partida solo sem querer; e o nome sugerido tirava a graça de criar o nome do time.
- **Convite por link:** `/?duelo=CÓDIGO` e `/?campeonato=CÓDIGO` abrem direto a **página do convite** (“Você foi convidado para um duelo 1×1 / campeonato”, sala e campo de nome), sem a home e sem o botão de jogo solo. Não depende da API do Desafio do dia. Sala já encerrada → mensagem clara e “Ir para o início”; quem só quer jogar sozinho tem a mesma saída. Ao entrar, o link é limpo da barra (não reabre o convite), e quem já estava naquela sala volta direto a ela.
- **Nome obrigatório e sem padrão:** o campo começa vazio (só vem preenchido o último nome que a própria pessoa usou, `ml_name`). Sem nome, nada começa: o aviso explica, o foco vai ao campo, e o mesmo vale no convite e nos modos online (com a moderação de sempre).
- **Testes:** `e2e/invite.spec.js` (13 cenários) e `e2e/start.spec.js` reescrito para o nome obrigatório, escritos antes e vermelhos.

### Paridade do duelo 1×1 e do campeonato com o jogo solo ✅
Feedback de uso: duelo e campeonato não tinham a mesma experiência do solo, e não havia como compartilhar o resultado.
- **Peças compartilhadas (`site/js/parts.js`):** força do time, cartas de estilo, painel de campanha, herói, jornada e textos de compartilhar são funções puras usadas pelos **três** modos (o solo foi refatorado para usá-las; nada mudou para ele). Testes em `test/parts.test.js`.
- **Estilo com contexto:** igual ao solo (força vs. média dos adversários, efeitos reais, sugestão, Tático já marcado). Escolher não envia: só **Confirmar estilo** envia, e a escolha sobrevive às atualizações do servidor. O elenco vira uma linha compacta nessa etapa, para as cartas aparecerem antes do botão fixo (teste garante que a 1ª carta fica acima da barra).
- **Duelo:** herói “VITÓRIA/Derrota” com placar e rival, mapas, e a barra fixa com **Compartilhar** (principal), Revanche e Sair.
- **Campeonato:** painel “Sua campanha” a cada etapa, só o seu jogo aberto (os outros em “Ver os outros N jogos”), “Próxima etapa” na barra fixa; resultado com herói (perfeito, campeão, vice, caiu nos playoffs, eliminado e quanto faltou), **Sua jornada** e Compartilhar. Quem não é o dono vê o aviso em vez do botão.
- **Compartilhar:** texto próprio por modo/desfecho (inclui o caso “vice-campeão”) e o card de imagem com o rótulo certo (“SÉRIE Bo3” no duelo). Sem mudança no servidor nem no protocolo.
- **Testes:** `e2e/multiplayer.spec.js` (19 cenários, escritos antes) com servidor de mentira em `e2e/mp.js`; além disso, um duelo e um campeonato completos foram jogados por dois navegadores contra o Worker local (herói, jornada, campanha, compartilhar e revanche conferidos).

### Fase D1 — o desktop aproveita a largura ✅
Antes, em 1280 px o jogo era uma coluna de 640 px no meio e quase metade da tela ficava vazia. Em telas ≥ 1024 px (o celular não muda):
- **Largura:** conteúdo até 1120 px, centrado; o logo alinha com o início do conteúdo.
- **Início:** “Jogar” e “Desafio do dia” à esquerda, “Jogar com amigos” à direita; “Como jogar” em 3 colunas. Sem os modos online, fica uma coluna só, centrada.
- **Draft:** o elenco numa lateral que acompanha a rolagem; as 3 ofertas cabem sem rolar a página (1280×800).
- **Tela do time:** elenco de um lado; força, estilos e botão do outro.
- **Rodadas:** “Sua campanha” na lateral (fixa ao rolar) e o seu jogo ao lado.
- **Resultado:** herói em largura total; jornada e lineup de um lado, campeão, MVP e texto para compartilhar do outro (de ~1550 px para ~1030 px de altura).
- **Barra de ações:** botões de largura razoável e centrados, em vez de um botão de 1000 px.
- **Ficou para a próxima etapa:** duelo, campeonato e convite seguem numa coluna centrada de 680 px (para não esticarem) até ganharem a sua grade.
- **Testes:** `e2e/desktop.spec.js` (13 cenários em 1024 e 1280 px, mais 1920 px e uma checagem de que o celular não mudou), escritos antes.

### Fase D2 — duelo, campeonato e convite no desktop ✅
Em telas ≥ 1024 px (o celular não muda; os blocos novos são contêineres comuns, então a ordem de leitura é a de antes):
- **Draft (duelo e campeonato):** o elenco numa lateral que acompanha a rolagem e as ofertas na área principal; no campeonato os jogadores da sala ficam na lateral. Na etapa do estilo, o elenco ao lado e as 3 cartas na área principal.
- **Duelo, resultado:** herói em largura total, **as duas lineups lado a lado** e os mapas embaixo, com Compartilhar, Revanche e Sair centrados.
- **Campeonato, rodada:** “Sua campanha” na lateral (fixa ao rolar); o seu jogo e a **classificação em duas colunas** ao lado, de modo que a rodada inteira cabe numa tela de 1280×800.
- **Campeonato, resultado:** herói em largura total; jornada de um lado, campeão e MVP do outro; jogadores humanos e classificação final embaixo.
- **Salas de espera e convite:** cards estreitos e centrados (não esticam).
- **Testes:** `e2e/desktop-mp.spec.js` (em 1024 e 1280 px, mais a ordem no celular) com o servidor de mentira estendido (`e2e/mp.js`: draft em andamento com ofertas reais). Duelo e campeonato foram também jogados por dois navegadores contra o Worker local, no desktop e no celular. O teste da D1 que fixava o duelo em 680 px foi removido: é o que a D2 muda de propósito.

### Home nova e fim do 1×1 ✅ (esqueleto do usuário)
- **Estrutura:** logo clicável (volta à home) · nome obrigatório · bloco **Single player** (Modo rápido + Desafio diário, lado a lado) · **Top 5** do ranking (só se houver gente, compacto, com “Ver mais”) · bloco **Multiplayer** (Campeonato + Leilão, lado a lado) · “Entrar com um código” · “Como jogar” (como era). Em 320 px os cartões empilham; no desktop, Single à esquerda e Multiplayer à direita.
- **Logo = home:** num jogo solo em andamento pergunta antes (perderia o jogo); numa sala só sai da tela e a home oferece “Voltar à sala”; no convite limpa o link.
- **Ranking completo:** `/ranking` (`site/ranking.html` + `site/js/ranking.js`) lista as 50 primeiras posições do dia; o Top 5 e a página ignoram o cache de 30 s da API (quem acabou de enviar se vê na hora) e o Top 5 é recarregado a cada volta à home.
- **Desafio do dia → Desafio diário** em toda a interface e nos textos legais.
- **Duelo 1×1 removido por completo** (cliente, servidor, rotas, métrica `room_created`, testes, textos de privacidade/termos e docs). `wrangler.toml` ganha a migration `v3` (`deleted_classes = ["Room"]`). Links antigos `?duelo=` caem na home. O código compartilhado do campeonato foi separado do `duel.js` (`GameError` vem do motor; `hex`/`str` foram para `worker/rooms.js`).
- **Leilão:** cartão “Em breve” (desligado); as regras decididas estão em `docs/MULTIPLAYER.md`. Tipos de sala e convites ficam em tabelas (`OPEN`, `INVITES`, `ROOM_KINDS`, `KINDS`), para o Leilão entrar sem reescrever o fluxo.
- **Testes:** `e2e/home.spec.js` (26), `e2e/ranking.spec.js` (7), `test/daily-client.test.js` (4); o jogo real foi jogado com dois navegadores contra o Worker local (campeonato, logo dentro da sala, voltar à sala, convite, compartilhar, Desafio → Top 5 → `/ranking`), no desktop e no celular.

### Leilão ✅
- **Cartão “Leilão”** na home (ativo) e convite `?leilao=CÓDIGO`; entrar com código vale para os dois tipos de sala.
- **Lobby** (2–5 jogadores) → **leilão**: o jogador em leilão (nick, papel, rating, time e ano), “Leilão N de T” com relógio e barra, atalhos de lance (+5, +10, +25, Máx), motivo quando o lance é inválido, quadro de jogadores (moedas, vagas, “enviou ✓”, nunca o valor), elenco próprio, quantos de cada papel ainda vão aparecer e o último leilão; **revelação** com o lance de cada um; depois **estilo** (mesma tela do solo, com a nota das vagas completadas de graça) e o **mesmo torneio** do campeonato, com resultado, jornada e compartilhar (texto de “leilão”).
- **Quem digita não perde nada:** enquanto o leilão está aberto, uma atualização do servidor só troca o quadro de jogadores; o campo de lance (e o foco/teclado) fica intacto.
- **Desktop:** o jogador e os controles de um lado, o quadro e o elenco do outro. **Celular:** os controles de lance ficam acima da dobra.
- **Compartilhar mais robusto (vale para todos os modos):** gerar a imagem do card (`canvas.toBlob`) chegou a levar ~6,7 s em alguns ambientes, o que podia fazer o compartilhar falhar (o navegador só aceita `navigator.share` logo depois do toque) e explicou a falha do CI. Agora a imagem é preparada quando o resultado aparece e, no toque, espera-se no máximo 1,5 s; se não estiver pronta, compartilha só o texto.
- **Testes:** `test/auction.test.js` (24), `test/room-alarm.test.js`, `e2e/auction.spec.js` (31) e o teste do “aparelho lento”. O servidor foi validado com o alarme real (prazos de 5 s e 15 s exatos, fechar cedo para quem caiu, reconexão com o token, privacidade) e um leilão inteiro foi jogado por dois navegadores (desktop e celular), com recarga da página no meio.

### Pacote do beta: desempate por velocidade, 15 s e modo claro ✅
- **Desempate no Leilão:** em lances iguais leva quem deu o lance **primeiro** (hora de chegada no servidor, guardada junto do lance e restaurável); só no mesmíssimo milissegundo há sorteio. A revelação explica (“Empate em 41: Rival FC levou por ter dado o lance primeiro”) e a regra aparece no lobby.
- **Tempo do lance:** já era de **15 s** (a revelação, 5 s); agora travado por teste (`BID_MS`, `REVEAL_MS`).
- **Modo claro:** botão ☀️/🌙 no cabeçalho (alvo de 44 px, com nome e estado para leitor de tela e funciona no teclado). O **escuro continua o padrão**; a escolha fica em `ml_theme` (documentada na política de privacidade) e vale em todas as páginas; um script mínimo no `<head>` (`js/theme-init.js`) aplica o tema antes de a página aparecer, sem piscar. O tema só troca variáveis de cor; os acentos (azul, laranja, dourado) ficam mais escuros no claro para o texto passar em contraste, e os preenchimentos de botões e etiquetas não mudam.
- **Contraste:** `e2e/contraste.js` mede a razão de contraste real de todo texto visível; o modo claro passa em AA (4,5:1; 3:1 para texto grande) na home, draft, time, rodada, resultado, ranking, páginas informativas, campeonato e leilão. Único ajuste necessário: o placar de quem perdeu.
- **Testes:** `e2e/theme.spec.js` (11), 5 testes novos de desempate em `test/auction.test.js`, 4 de revelação em `e2e/auction.spec.js`.
- **Para mudar o padrão para “seguir o tema do aparelho”:** em `js/theme-init.js`, trocar o valor padrão por `matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"`.

## Fase D3 — movimento (mobile primeiro)

Princípio: tudo foi pensado para o celular (375 px); o desktop só herda. Só `transform` e `opacity`, durações até 0,6 s, e **`prefers-reduced-motion` desliga tudo** (o estado continua visível: o slot novo fica marcado e o relógio em alerta mantém a cor própria).

| Onde | Movimento | Como |
|---|---|---|
| Botões e fichas | resposta ao **apertar** (`:active`); o "levantar" da ficha só com mouse (`@media (hover:hover)`), porque no toque ele ficava preso | CSS |
| Draft | a ficha recém-escolhida **salta** no elenco (não no desfazer); as 3 lineups oferecidas entram em sequência | `papelNovo()` + classe `fresh` |
| Rodadas | cartões em sequência; placar com "pop" | CSS |
| Resultado | título do resultado entra em destaque; campeão faz um pulinho | CSS |
| Leilão | jogador novo desliza (não repete ao enviar o lance); revelação em sequência com destaque no vencedor; **últimos 5 s do lance: relógio e barra vermelhos e pulsando** (não na revelação) | classe `urgent` |

Testes: `test/motion.test.js` (regras do CSS: só transform/opacity, infinita só no alerta, durações, :hover só com mouse) e `e2e/motion.spec.js` (animação ligada e desligada, 375 px sem rolagem lateral, contraste AA do alerta nos dois temas).

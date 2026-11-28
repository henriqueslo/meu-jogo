# Plano da etapa multiplayer

## Por que a refatoração veio antes
`site/js/engine.js` agora é **puro e determinístico** (sem DOM, sem globais, sem `Math.random`). A mesma função roda no navegador e num Cloudflare Worker (você já usa Cloudflare). Com `seed + escolhas` o servidor reproduz qualquer torneio — isso é a base de ranking, replay e anti‑cheat.

```
site/js/data.js    lineups/papéis/mapas (compartilhado)
site/js/engine.js  regras: draft, simulação, suíço, playoffs, resolveSquad, summarize
site/js/ui.js      só DOM (escape obrigatório)
site/js/share.js   card de compartilhamento
```

> **Status:** Desafio diário e campeonato (2–8 jogadores) implementados — ver `docs/API.md`. O duelo 1×1 foi removido. **Leilão implementado** (regras abaixo; protocolo em `docs/API.md`).

## Modos sugeridos (do mais barato ao mais rico)

1. **Desafio diário com ranking (assíncrono)** — todos recebem a mesma seed do dia. Cliente envia `{teamName, picks:{role:{lineupId,nick}}, style, refreshesUsed}`; o Worker valida com `resolveSquad`, roda `createTournament`+`playToEnd` com a seed do dia e grava `summarize()` no **D1**. O cliente nunca envia resultado. Rate limit por IP/dia. *Melhor primeiro passo: sem WebSocket, sem salas.*
2. **Leilão (síncrono, 2 a 5 jogadores)** — em vez de draft, os jogadores disputam cada craque no lance; depois, campeonato simulado (ver “Leilão” abaixo).
3. **Mini‑campeonato de 8–16 humanos** — suíço/playoffs com humanos no lugar das IAs (o motor já aceita times arbitrários).

## Arquitetura (modos 2 e 3)

- **Cloudflare Worker** (HTTP + upgrade WebSocket) → **Durable Object por sala** (estado e ordem de eventos autoritativos; hibernação de WebSocket para custo baixo).
- Estado da sala só no DO; **D1** para ranking/perfis; **KV** opcional para seed diária.
- Protocolo JSON com `type` e `v` (versão), ex.: `join`, `pick`, `refresh`, `style`, `ready` → servidor emite `offers`, `phase`, `results`. Cada mensagem validada por schema (tamanho máx., tipos, allowlist de papéis/estilos).
- O servidor **gera a seed** (CSPRNG) e envia as ofertas; o cliente só escolhe `lineupId+nick`. Contagem de atualizações (3/vaga) é imposta no servidor.
- Reconexão: token de sessão por jogador (aleatório, httpOnly cookie ou no `join`), reenvio do estado completo ao reconectar, heartbeat ping/pong, timeout de turno com auto‑pick.

## Segurança específica do multiplayer

- **Origin check** no upgrade WebSocket (`Origin` ∈ `minhalineup.com`); CSP `connect-src 'self' wss://<worker>`.
- **Rate limit** por conexão e por IP (mensagens/seg, salas criadas/hora); limite de payload (~2 KB) e de conexões por sala.
- **Nome de time/jogador:** `sanitizeTeamName` no servidor (já pronto) + `esc()` no render (já aplicado). Nunca confiar no filtro do cliente; considerar lista de palavrões.
- **Códigos de sala** com ≥ 6 caracteres aleatórios (CSPRNG), expiração (ex.: 1 h).
- **Sem contas** no início: identidade = id anônimo assinado (HMAC) para ranking; se adicionar login, usar OAuth (nunca guardar senha).
- Nunca confiar em `forca`, placar ou fase vindos do cliente — o servidor só aceita *intenções*.
- **LGPD/AdSense:** atualizar a Política de Privacidade (hoje diz que nada é guardado), adicionar aviso/CMP de consentimento antes de anúncios personalizados e informar retenção do ranking.

## Quando existir `functions`/Worker
Adicionar em `wrangler.toml`: `main = "worker/index.ts"`, binding do Durable Object e do D1; importar `../site/js/engine.js` direto (é ESM puro, sem dependências). Reaproveitar `test/` rodando o mesmo motor sob o runtime do Workers (`@cloudflare/vitest-pool-workers`) se quiser testes de integração.

## Checklist antes de abrir ao público
- [ ] Teste de carga de WebSocket (conexões simultâneas por sala/instância)
- [ ] Teste de desync: re-simular no servidor e comparar com o que o cliente exibiu
- [ ] Privacidade/termos atualizados, CMP ativo
- [ ] Monitoramento: nº de salas, erros, latência; alertas de pico

## Leilão (implementado)

Substituiu o antigo duelo 1×1 como segundo modo do bloco Multiplayer (cartão “Leilão” na home; convite `?leilao=CÓDIGO`). A lógica é pura e determinística em `worker/auction.js` (tempo injetado, testada em `test/auction.test.js`, inclusive com partidas inteiras de robôs); o relógio roda no alarme do Durable Object.

**Estrutura**
- 2 a 5 jogadores humanos (sem bots no leilão). Cada um começa com **100 moedas** e precisa fechar um time de 5: AWP, IGL, Entry, Support e Rifler.
- Um jogador histórico por vez na tela (nick, papel, país, time/ano, rating da época).
- **Lance fechado e simultâneo (“no escuro”):** cada jogador escolhe um valor ou **passa** (ninguém é obrigado a dar lance); os lances só são revelados juntos e quem pagar mais leva. Depois da revelação todos veem quanto cada um pagou.
- **Tempo por jogador:** ~15 s, definido pelo servidor; quem não responde conta como “passou”. Se todos já enviaram, a revelação é imediata.
- **Todos passam / ninguém dá lance:** o jogador é descartado e vem o próximo.

**Regras para o jogo não travar**
- **Reserva:** o lance máximo é o saldo menos 1 moeda por vaga ainda vazia (depois desta), para ninguém ficar sem dinheiro para completar o time.
- **Papel já preenchido:** não dá para dar lance (o botão explica o motivo).
- **Desempate:** menos jogadores já conquistados; persistindo o empate, sorteio com semente do servidor.
- **Quantidade de leilões:** 10 por jogador (5 jogadores = 50), com o mesmo número de cada papel (oferta = o dobro da demanda, para haver margem para passar).
- **Vaga que sobrar:** recebe, de graça, o melhor descartado daquele papel; os times mais fracos escolhem primeiro.

**Depois do leilão:** escolha de estilo (mesma tela de hoje), campeonato simulado completado com times históricos até 16 (reaproveita a lógica do campeonato) e resultado com herói, jornada e compartilhar (texto próprio de leilão).

**Servidor autoritativo:** o cliente só envia intenções (lance, passar); o servidor valida saldo, reserva, papel e prazo. Saldo e preço nunca vêm do cliente.

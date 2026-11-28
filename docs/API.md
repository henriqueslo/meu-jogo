# API v1 — Desafio do dia (Fase 1)

Base: mesma origem do site (`/api/v1`). JSON em UTF‑8. Erros em `application/problem+json` (RFC 7807). Versão no caminho; mudanças incompatíveis entram em `/api/v2` e a v1 segue ativa por pelo menos 90 dias.

## Modelo
`daily_entries(day, player_id, team_name, style, forca, wins, losses, tier, champion, perfeito, squad_json, ip_hash, created_at)` — chave `(day, player_id)`. Ver `worker/schema.sql`.
Dia = fuso `America/Sao_Paulo`. Seed do dia = `hash(DAILY_SECRET | dia)` (segredo só no servidor).

## Endpoints
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/v1/daily` | `{ day, seed, max_refreshes }` |
| POST | `/api/v1/daily/entries` | Envia a participação. Corpo: `{ player_id (uuid), team_name, style, draft:[{refreshes, lineupId, nick} ×5] }`. **201** `{ entry, rank }` |
| GET | `/api/v1/daily/leaderboard?day=YYYY-MM-DD&limit=1..50` | `{ day, data:[{rank, team_name, style, forca, wins, losses, tier, champion, perfeito, squad}] }` |

O cliente **não envia resultado**. O servidor reexecuta `verifyDraft` (mesma seed, mesmas atualizações, a escolha tinha de estar na tela) e depois `createTournament`+`playToEnd`.

Ranking: `tier` (4 perfeito · 3 campeão · 2 playoffs · 1 suíço) ↓, vitórias ↓, **menor força** ↑ (zebra vale mais), envio mais antigo.

## Erros (`type` = `https://minhalineup.com/errors/<slug>`)
| Status | slug | Quando |
|---|---|---|
| 400 | `invalid-json` | corpo não é JSON |
| 404 / 405 | `not-found` / `method-not-allowed` | rota/método |
| 409 | `already-submitted` | mesmo `player_id` já jogou hoje |
| 413 | `payload-too-large` | corpo > 4 KB |
| 415 | `unsupported-media-type` | sem `application/json` |
| 422 | `validation-error` / `invalid-draft` | campo inválido / draft não confere com o desafio |
| 429 | `rate-limited` | > 5 participações/dia por rede (`Retry-After`) |
| 500 | `internal` | erro interno (sem detalhes) |

## Segurança e privacidade
Sem contas; identidade = UUID aleatório do navegador. IP nunca é gravado (só hash SHA‑256 com sal diário). Consultas D1 sempre parametrizadas. Nomes: allowlist no servidor + escape no render. Respostas `no-store` (exceto leaderboard, 30 s).

## Colocar no ar
Ver `wrangler.toml` (criar D1, aplicar `schema.sql`, definir o segredo `DAILY_SECRET`, `wrangler deploy`). Sem a API, o Desafio diário, o Top 5 e o Multiplayer simplesmente não aparecem (o Modo rápido segue igual).

---

# Salas multiplayer: campeonato

2–8 jogadores humanos + lineups históricas (IA) até completar 16 times; suíço + playoffs como no jogo livre, simulados pelo servidor. (O duelo 1×1 foi removido: a migration `v3` apaga a classe `Room`.)

## HTTP
| Método | Caminho | Descrição |
|---|---|---|
| POST | `/api/v1/cups` | Cria a sala → **201** `{ code }` (6 chars sem `I L O 0 1`). Limite: **10 salas/hora por rede** (429 + `Retry-After`). |
| GET | `/api/v1/cups/{code}/ws` | Upgrade WebSocket. Exige `Origin` = host do site (403 `forbidden-origin`), código válido (404) e `Upgrade: websocket` (426). Sala inexistente recusa o handshake. |

## Protocolo WebSocket (JSON, `v:1`)
Limites: mensagem ≤ 2 KB (fecha com 4009), rajada > ~12 msgs/3 msgs·s⁻¹ (fecha com 4008), 1ª mensagem tem de ser `hello` (senão 4003). Conexão duplicada do mesmo jogador derruba a antiga (4000).

**Cliente → servidor** (só *intenções*; nunca ofertas, ratings ou resultado)
| `t` | Quem | Efeito |
|---|---|---|
| `hello` `{name, token?}` | todos | Entra na sala (máx. 8) ou reconecta com o token → `welcome` + `state` |
| `start` | dono (slot 0), ≥ 2 jogadores, no lobby | inicia o draft; depois disso ninguém novo entra (`cup-started`) |
| `refresh` | jogador | Atualiza as ofertas da vaga (máx. 3 por vaga) |
| `pick` `{lineupId, nick}` | jogador | Escolhe um jogador que **está nas ofertas** e é escalável |
| `undo` | jogador | Desfaz a última escolha (ver “Desfazer no draft”) |
| `style` `{style}` | jogador | `rush` \| `tatico` \| `aim` (definitivo) |
| `force` | dono — ou qualquer jogador **se o dono estiver offline** | completa o elenco de quem não terminou (1º jogador escalável) e define estilo Tático |
| `advance` | dono — ou qualquer jogador se o dono estiver offline | simula a próxima etapa (rodada suíça → chaveamento → quartas → semi → final) |

**Servidor → cliente**: `welcome {slot, token, code}` · `state` (a cada mudança, só com o que aquele jogador pode ver) · `error {code, detail}` (`room-full`, `invalid-name`, `name-blocked`, `name-taken`, `cup-started`, `not-host`, `not-enough`, `not-offered`, `not-eligible`, `no-refresh`, `draft-incomplete`, `style-locked`, `bad-phase`, `bad-message`, `bad-json`, `internal`).

`state` traz `phase` (`lobby` → `draft` → `running` → `done`), `you` (inclui `canControl`), `players[]` (conexão/progresso), `teams[]` (16 times: campanha e situação), `events[]` (todas as etapas já jogadas, com placares por mapa) e, no fim, `result` (campeão, humanos com campanha/situação/elenco, MVP). Os elencos dos rivais só aparecem em `result`.

## Estado e ciclo de vida
Uma sala = um Durable Object `CupRoom` (SQLite). Persistido: seed + ações do draft + estilos + nº de etapas; o torneio é reconstruído por replay determinístico (validado: reinício do servidor devolve o mesmo campeão e placares), então sobrevive à hibernação e a reinícios. A sala é apagada após 1 h sem atividade (alarm). O token de reconexão fica em `sessionStorage` da aba, nunca em URL. O estado fica sob a chave `game` do storage do Durable Object.

## Colocar no ar
`npx wrangler deploy` — aplica a migration `v3` (apaga a classe `Room` do duelo; salas de duelo abertas somem). Não há mudança de banco. O `GET /api/v1/rooms` e o `POST /api/v1/rooms` deixam de existir (404).

---

# Reentrada (voltar à sala)

`GET /api/v1/cups/{code}` → **200** `{ exists: true, phase }` ou **404** (`not-found`). Só diz se a sala existe; não expõe jogadores. Limite: 60 consultas/hora por rede (429), para impedir varredura de códigos.

Cliente (`site/js/session.js`, `net.js`):
- **F5:** o token e a flag `ml_in_room` ficam em `sessionStorage` → a página volta sozinha para a sala.
- **Aba fechada / navegador reiniciado:** a "sala ativa" `{kind, code, name, token, ts}` fica em `localStorage` por **55 min** (renovada a cada atividade); a tela inicial mostra “Voltar à sala / Descartar” depois de confirmar com a API que a sala ainda existe.
- Tudo lido do storage é validado (formato estrito) e exibido como texto puro; registros inválidos, expirados ou de salas inexistentes são apagados em silêncio.
- Sair da sala, sala encerrada (TTL 1 h), sala cheia/campeonato já iniciado ou nome recusado também apagam o registro.
- Abrir a mesma sala em outra aba derruba a conexão antiga (código 4000), sem duplicar o jogador.

---

# Moderação de nomes

Nomes passam por `sanitizeTeamName` (alfabeto latino) e `moderateName` (palavrões/ódio, links, contatos, nomes reservados). Quando bloqueado:
- `POST /api/v1/daily/entries` → **422** `validation-error` com `errors:[{field:"team_name"}]`;
- WebSocket (campeonato) → `error` com `code: "name-blocked"` (a sala não é afetada; o registro de reentrada é apagado).
O detalhe do motivo (qual termo) não é devolvido, para não ensinar a burlar a lista. Ver `docs/OPERACAO.md`.

---

# Saúde

`GET /api/v1/health` → **200** `{ ok: true, db: true, time }` ou **503** `{ ok: false, db: false, time }` (D1 fora). Cache de 30 s no caso de sucesso, `no-store` na falha. Não expõe versão, segredos nem contagens.

---

# Retenção e privacidade

Um Cron Trigger diário (`[triggers] crons` em `wrangler.toml`) chama `scheduled()` → `runPurge()` (`worker/retention.js`): apaga entradas do ranking com mais de **90 dias**, zera `ip_hash` de dias anteriores, apaga `metrics` com mais de 90 dias e `rate_limits` com mais de 2 h, e registra `purge_done` com as contagens. Salas de campeonato expiram sozinhas após 1 h sem atividade. A Política de Privacidade (`site/privacidade.html`) descreve exatamente isso; `test/privacy.test.js` mantém texto e código alinhados.

---

# Desfazer no draft (campeonato)

Nova mensagem do cliente: `{ "t": "undo" }`. Desfaz a última escolha (e as atualizações feitas depois dela); as ofertas voltam **iguais** às de antes. Permitida só na fase `draft` e **antes de o estilo ser fixado** (depois: erro `style-locked`; sem escolhas: `nothing-to-undo`). A visão do jogador (`you`) ganhou `canUndo: boolean`.

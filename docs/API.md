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
Ver `wrangler.toml` (criar D1, aplicar `schema.sql`, definir o segredo `DAILY_SECRET`, `wrangler deploy`). Sem a API, o botão do desafio simplesmente não aparece.

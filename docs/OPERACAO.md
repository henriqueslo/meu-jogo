# Operação — Minha LineUp

Guia de rotina para quem mantém o site. Rode os comandos no PowerShell, na pasta do projeto (use `npx.cmd`).

## Moderação de nomes

### Como funciona
- **Alfabeto:** só letras latinas (com acento), dígitos 0–9, espaço, `.` `_` `-`. Outros alfabetos são removidos (`sanitizeTeamName`, `site/js/engine.js`).
- **Filtro:** `site/js/moderation.js` bloqueia palavrões/ódio, links, contatos (9+ dígitos), nomes que se passam pela equipe (admin, oficial…) e nomes só de pontuação. Trata burlas comuns (acentos, letras repetidas, l33t, separadores `f.u.c.k`).
- **Onde vale:** desafio do dia (HTTP 422), duelo e campeonato (erro `name-blocked`). O **servidor sempre decide**; o navegador só dá o aviso antes. No **jogo livre** o nome nunca sai do dispositivo e não é filtrado.
- **Termos curtos/ambíguos** só valem como palavra inteira (evita bloquear “Assassinos”, “Enviado”, “Niger Delta”).

### Ajustar a lista
Edite as listas no topo de `site/js/moderation.js` (`WORDS`, `SUBSTRINGS`, `RESERVED`…), adicione um caso em `test/moderation.test.js`, rode `npm.cmd test`, abra PR e faça deploy. Nenhuma lista pega tudo: revise os nomes do ranking de vez em quando.

### Remover uma entrada ofensiva do ranking do dia
Salas de duelo e campeonato somem sozinhas em 1 h; só o ranking do dia fica gravado.

1. Listar as entradas recentes:
```bash
npx.cmd wrangler d1 execute minhalineup --remote --command "SELECT day, player_id, team_name, created_at FROM daily_entries ORDER BY created_at DESC LIMIT 30"
```
2. Remover pelo `player_id` (copie o valor exato da linha ofensiva) e o dia:
```bash
npx.cmd wrangler d1 execute minhalineup --remote --command "DELETE FROM daily_entries WHERE day = '2026-11-27' AND player_id = 'COLE-O-UUID-AQUI'"
```
3. Conferir:
```bash
npx.cmd wrangler d1 execute minhalineup --remote --command "SELECT COUNT(*) AS n FROM daily_entries WHERE day = '2026-11-27'"
```
O jogador removido não consegue reenviar no mesmo dia (o `player_id` fica sem entrada, então ele *pode* tentar de novo com o mesmo nome — que o filtro agora bloqueia, ou com outro nome aceitável).

### Entradas antigas (anteriores ao filtro)
Liste os nomes e revise à mão; remova o que precisar pelo passo 2:
```bash
npx.cmd wrangler d1 execute minhalineup --remote --command "SELECT day, player_id, team_name FROM daily_entries ORDER BY day DESC"
```

### Pedidos de remoção
A Política de Privacidade promete remoção de uma entrada pelo contato da página **Sobre**. Ao receber o pedido, peça o nome do time e o dia, localize pelo passo 1 e remova pelo passo 2.

---

## Monitoramento

### O que existe
| Camada | O que mostra | Onde ver |
|---|---|---|
| **Saúde** | `GET /api/v1/health` → `{"ok":true,"db":true}` (200) ou 503 se o D1 não responde | monitor de uptime externo |
| **Contadores diários** (tabela `metrics`, sem dados pessoais) | `room_created`, `cup_created`, `daily_entry`, `daily_rejected`, `daily_duplicate`, `rate_limited`, `ws_connected`, `ws_forbidden_origin`, `server_error` | consultas D1 abaixo |
| **Logs estruturados** (JSON, `[observability]` ligado) | `player_joined`, `game_done`, `ws_rate_limited`, `ws_too_big`, `http_5xx`, `error`, `metrics_failed` | painel Cloudflare (Workers & Pages → meu-jogo → Observability/Logs) ou `wrangler tail` |

Privacidade: o log e os contadores **nunca** guardam IP, token, `player_id`, nome de time ou corpo de requisição (`worker/log.js` remove esses campos mesmo que alguém passe sem querer). Abuso é registrado **uma vez por conexão**.

### Ligar (uma vez)
1. Aplicar o schema (cria a tabela `metrics`; seguro repetir) e publicar:
```bash
npx.cmd wrangler d1 execute minhalineup --remote --file=worker/schema.sql
```
```bash
npx.cmd wrangler deploy
```
2. Testar a saúde: `curl.exe https://minhalineup.com/api/v1/health` → `{"ok":true,"db":true,...}`.
3. **Alerta de queda (recomendado):** crie um monitor gratuito em um serviço de uptime (por exemplo UptimeRobot): tipo HTTP(s), URL `https://minhalineup.com/api/v1/health`, intervalo de 5 min, alerta por e-mail, e (se disponível) palavra-chave `"ok":true`.
4. **Alertas do Cloudflare:** no painel, *Notifications* permite avisos por e-mail para o Worker/conta (confira as opções disponíveis no seu plano). Os logs ficam no painel por alguns dias.

### Rotina (2 minutos por semana)
Uso e saúde dos últimos 7 dias:
```bash
npx.cmd wrangler d1 execute minhalineup --remote --command "SELECT day, name, n FROM metrics WHERE day >= date('now','-7 day') ORDER BY day DESC, name"
```
Como ler:
- `server_error` **> 0** → investigar (logs `http_5xx` / `error`).
- `rate_limited` ou `ws_forbidden_origin` subindo de repente → alguém testando/abusando; veja os logs.
- `daily_rejected` alto → muitos nomes bloqueados ou drafts inválidos (veja `docs/OPERACAO.md` → moderação).
- `room_created` / `cup_created` vs `game_done` (nos logs) → quantas partidas são concluídas.

Logs ao vivo (erros e abuso):
```bash
npx.cmd wrangler tail --format pretty --status error
```
```bash
npx.cmd wrangler tail --format pretty --search ws_rate_limited
```

Limpeza (guarde 90 dias):
```bash
npx.cmd wrangler d1 execute minhalineup --remote --command "DELETE FROM metrics WHERE day < date('now','-90 day')"
```

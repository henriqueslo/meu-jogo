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

# Auditoria de segurança e qualidade — Minha LineUp

Escopo: repositório `henriqueslo/meu-jogo` (site estático em `site/`, hospedado via Cloudflare `wrangler.toml`).
Método: leitura manual completa do código + verificação em navegador (CSP real, fluxo completo, 2000 torneios simulados). Sem ferramentas SAST disponíveis no ambiente (sem Node/Python); recomendado rodar `semgrep` e `gitleaks` no CI (ver fim).

## Resumo

Hoje o risco é **baixo**: não há backend, conta, banco nem segredo (o ID do AdSense é público por natureza). O risco real é **para o multiplayer**: o jogo inteiro é decidido no cliente, então qualquer ranking/partida online seria forjável. As correções abaixo eliminam o que já era explorável e deixam o motor pronto para ser executado no servidor.

| ID | Sev. | Achado | Status |
|----|------|--------|--------|
| F-01 | **Alta** (p/ multiplayer) | Resultado 100% client-side: `squad`, `forca`, RNG e resultado eram globais editáveis no console (`squad.AWP.forca=999`); ratings do jogador eram lidos de `data-*` do DOM. | Corrigido na base: elenco é reconstruído por `resolveSquad(lineupId, nick)` a partir dos dados do motor; o rating nunca vem do cliente. Autoridade real exige servidor (ver `MULTIPLAYER.md`). |
| F-02 | Média | CSP com `script-src 'unsafe-inline'` anulava a proteção contra XSS (necessário por causa de `onclick=` e `<script>` inline). | Corrigido: JS/CSS externos, `script-src 'self'`, sem handlers inline. |
| F-03 | Média | Sanitização de nome por *blacklist* (`/[<>&"'`]/`) só em `buildUserTeam`; nomes iam crus para `innerHTML` em ~6 pontos (`statusUsuario`, cards, MVP, share). Seguro hoje (self‑XSS), mas viraria **XSS armazenado** com ranking/salas. | Corrigido: allowlist de entrada (`sanitizeTeamName`) **e** escape de saída (`esc()`) em todo `innerHTML`; share-box usa `textContent`. |
| F-04 | Média | Sem proteção anti‑clickjacking (`frame-ancestors`/`X-Frame-Options`), sem `base-uri`, `object-src`, `form-action`; CSP permitia `img-src https:` e `connect-src` de anúncios sem uso. | Corrigido em `site/_headers` (+ HSTS, COOP). |
| F-05 | Baixa | Seed de `Date.now()+Math.random()` (32 bits, previsível). Irrelevante em single-player; inaceitável para ranking. | Cliente usa `crypto.getRandomValues`; servidor deve gerar a seed (ver doc). |
| F-06 | Baixa | `site/teste` (arquivo solto) publicado; sem `.gitignore`, README, testes ou CI. | Removido; `.gitignore`, `package.json`, testes e workflow adicionados. |
| F-07 | Baixa | Anúncios/AdSense: CSP antigo liberava domínios do Google, mas nenhuma página carrega `adsbygoogle`. Política de privacidade afirma "não guarda nada no navegador". | Domínios removidos do CSP (superfície menor). Ao ativar AdSense/CMP e ao lançar multiplayer, reabrir só o necessário e **atualizar a Política de Privacidade** (LGPD). |
| F-08 | Info | `style-src 'unsafe-inline'` permanece (há muitos `style=""` em templates). Risco residual baixo (sem execução de script). | Aberto — migrar para classes CSS quando conveniente. |
| F-09 | Info | Fontes do Google Fonts carregadas de terceiro (IP do visitante exposto). | Aberto — auto‑hospedar Rajdhani/JetBrains Mono (também melhora LCP). |

## Bugs de jogo encontrados (não são de segurança)

- **Softlock no draft (B-01):** lineups reais não têm os 5 papéis (24 das 46 têm dois Riflers ou faltam AWP/Support). Na última vaga, as 3 ofertas podiam não ter nenhum jogador escalável e, após 3 atualizações, o jogador ficava preso. Corrigido: `pickRandomLineups` garante ≥1 jogador escalável por leva.
- **Jogador duplicado (B-02):** era possível escalar o mesmo jogador em dois papéis (ex.: FalleN IGL de uma lineup e FalleN AWP de outra). Corrigido (UI desabilita; `resolveSquad` rejeita).
- **Nomes de adversários repetidos (B-03):** até 5 lineups do mesmo time (ex.: Natus Vincere) podiam estar no mesmo torneio com o mesmo nome. Agora aparece o ano (`Natus Vincere 2021`).
- Código morto em `runPlayoffRound` removido; acessibilidade: chips viraram `<button>`, estilos de jogo viraram `radiogroup` com teclado.

## Verificação executada

- 2000 torneios completos em navegador: sempre 8 classificados/8 eliminados, campeão ∈ classificados, placares de mapa válidos (13‑x…, 16‑x, 19‑x), sem softlock no draft; 300 torneios repetidos com a mesma seed → resultado idêntico.
- Fluxo real da UI com nome `<img src=x onerror=alert(1)>Falcons` sob o CSP novo: nenhuma violação de CSP, nenhum erro JS, nenhum elemento injetado.
- `test/engine.test.js` (node:test) contém as mesmas verificações; **não pôde ser executado aqui (sem Node)** — roda no CI (`npm test`).

## Próximos passos recomendados

1. Rodar `npm test` localmente/CI e corrigir qualquer divergência.
2. Adicionar ao CI: `semgrep --config=auto`, `gitleaks detect`.
3. Auto‑hospedar fontes; migrar `style=""` para classes e remover `'unsafe-inline'` de `style-src`.
4. Implementar o multiplayer conforme `docs/MULTIPLAYER.md`.

# Minha LineUp

Jogo de navegador: monte uma lineup de CS com jogadores históricos, escolha o estilo e dispute um Major (suíço + playoffs).

- `site/` — site estático (Cloudflare, ver `wrangler.toml`; cabeçalhos em `site/_headers`)
- `site/js/engine.js` — regras do jogo (puro/determinístico; reutilizável em servidor)
- `npm test` — testes do motor (Node ≥ 20)
- `docs/SECURITY-AUDIT.md`, `docs/MULTIPLAYER.md`

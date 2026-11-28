# Privacidade — inventário e pendências para revisão jurídica

> Este documento organiza os fatos para quem for revisar a Política de Privacidade e os Termos. **Não é parecer jurídico.** Os textos atuais foram escritos para refletir fielmente o que o código faz; a validação legal (bases legais, cláusulas, identificação do controlador) deve ser feita por profissional habilitado.

## 1. Inventário de tratamento (fonte da verdade: o código)

| Dado | Finalidade | Base legal indicada na política | Local | Retenção | Onde no código |
|---|---|---|---|---|---|
| Nome de time, elenco, estilo, resultado, `player_id` (UUID aleatório) | Ranking do Desafio do dia | Execução do serviço (art. 7º, V) | D1 `daily_entries` | **90 dias** (job diário) | `worker/handler.js`, `worker/retention.js` |
| Hash SHA-256 do IP (sal diário) | Limitar abuso no dia | Legítimo interesse (art. 7º, IX) | D1 `daily_entries.ip_hash` | Zerado a partir do dia seguinte | `handler.js`, `retention.js` |
| Hash do IP (janela de 1 h) | Limitar criação/consulta de salas | Legítimo interesse | D1 `rate_limits` | 2 horas | `rooms-api.js`, `retention.js` |
| Nome de time, escolhas, estilo | Salas de campeonato | Execução do serviço | Durable Object (SQLite) | 1 h sem atividade (alarme) | `worker/room-do.js` |
| Contadores agregados | Saúde/uso | Legítimo interesse | D1 `metrics` | 90 dias; sem dado pessoal | `worker/metrics.js` |
| Logs estruturados | Operação | Legítimo interesse | Cloudflare Workers Logs | Poucos dias (Cloudflare); **sem IP, nome ou ID** | `worker/log.js` |
| IP/UA nos logs da hospedagem | Segurança/CDN | (da Cloudflare) | Cloudflare | Política da Cloudflare | — |
| `localStorage`/`sessionStorage` (`ml_*`) | Último nome do time (`ml_name`), reentrada, identificador do Desafio | Execução do serviço | Navegador do usuário | Ver política (55 min a “até limpar”) | `site/js/session.js`, `net.js`, `daily.js` |

Não coletamos: nome real, e-mail, telefone, CPF, localização, pagamento. Sem cookies próprios. Sem analytics de terceiros. Fontes servidas pelo próprio site. Anúncios **desligados**.

## 2. O que os testes garantem (CI)
`test/privacy.test.js` falha se: uma chave `ml_*` do navegador deixar de estar na política; houver `document.cookie`; os prazos do texto (90 dias, 2 horas, 55 minutos, 1 hora) divergirem do código; o Cron de retenção sair da configuração; o texto de anúncios não bater com `ads-config.js`; a política voltar a citar Google Fonts como usado; ou o e-mail de contato divergir entre política, termos e sobre.

## 3. Pendências que dependem de você / de um(a) advogado(a)
1. **Controlador:** a política diz “pessoa física responsável pelo site” e dá o e-mail. Avaliar incluir nome completo/CPF (ou CNPJ, se houver) e se a dispensa de encarregado (DPO) para agentes de pequeno porte se aplica (Resolução CD/ANPD nº 2/2022) — mantendo o canal de contato.
2. **Bases legais** (art. 7º V, IX e, se houver anúncios, I): confirmar se são as adequadas a cada finalidade.
3. **Crianças e adolescentes (art. 14):** o texto exclui menores de 12 anos e pede orientação aos responsáveis para adolescentes. Confirmar a redação e se é necessário consentimento específico.
4. **Transferência internacional (art. 33):** a Cloudflare opera fora do Brasil. Verificar o mecanismo adequado (cláusulas contratuais/DPA da Cloudflare — aceite o DPA no painel da conta, se ainda não fez).
5. **Registro das operações (art. 37):** manter este inventário como base e revisá-lo a cada mudança.
6. **Plano de incidente (art. 48):** definir quem avisa quem e em que prazo. O texto promete comunicar “conforme a lei”.
7. **Termos de uso:** foro, limitação de responsabilidade e regras de moderação (remoção de nomes sem aviso).
8. **Direito de resposta em 15 dias:** é um compromisso do texto; ter rotina para cumprir (ver `docs/OPERACAO.md`).

## 4. Rotina de manutenção
- Qualquer mudança em **o que se coleta, guarda, retém ou carrega** → atualizar `site/privacidade.html` **na mesma alteração** (o CI avisa nos casos acima).
- Revisão geral a cada 6 meses ou ao ativar anúncios (`docs/ADS.md`).
- Atualizar a data “Última atualização” sempre que o texto mudar.

# Anúncios (AdSense) e consentimento

## Estado atual: **DESLIGADO**
O site não carrega nada do Google: nenhum script, iframe ou banner. `site/js/ads-config.js` tem `enabled: false`, e a CSP (`site/_headers`) não libera domínios de anúncio. As páginas de conteúdo (`majors`, `funcoes`, `formato-suico`, `sobre`) incluem `/js/ads.js`, que **não faz nada** enquanto estiver desligado. O jogo, as salas multiplayer, a Política de Privacidade e os Termos **nunca** carregam anúncios (`test/ads-static.test.js` garante).

## Como funciona quando ligado
1. **Funding Choices** (o CMP do próprio Google, certificado IAB TCF) mostra o aviso de consentimento e guarda a escolha do visitante.
2. O **script do AdSense** respeita essa escolha.
3. Um link **“Preferências de anúncios”** aparece no rodapé para o visitante rever a decisão a qualquer momento.
4. Se o navegador envia o sinal **Global Privacy Control (GPC)**, não carregamos nada (nem o CMP).

Por que o CMP do Google e não um banner próprio: para visitantes do Espaço Econômico Europeu, Reino Unido e Suíça o Google exige um CMP certificado para servir anúncios; um banner caseiro não serve.

## Antes de ativar (fora do código)
- [ ] Conta AdSense **aprovada** para o domínio `minhalineup.com` (o `ads.txt` já tem a linha do seu publisher ID).
- [ ] No AdSense → **Privacidade e mensagens** (Privacy & messaging): criar e **publicar** a mensagem de consentimento (regulamentos europeus; e as demais opções disponíveis para o seu público) e escolher as regiões. Sem mensagem publicada, o CMP não aparece.
- [ ] Política de Privacidade revisada para refletir os anúncios (item 6 da lista de pendências).
- [ ] Decidir onde os anúncios aparecem: só páginas de conteúdo, nunca sobre a interface do jogo.

## Ativar (3 mudanças + verificação)
1. **`site/js/ads-config.js`:** `enabled: true`.
2. **`site/_headers`:** a linha `Content-Security-Policy` precisa ganhar os domínios do Google (ponto de partida baseado na CSP original do projeto):
   - `script-src`: `https://pagead2.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com https://www.googletagservices.com https://adservice.google.com https://fundingchoicesmessages.google.com`
   - `frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://fundingchoicesmessages.google.com` (a diretiva ainda não existe: hoje o `default-src 'self'` bloqueia iframes)
   - `img-src 'self' data: https:` (anúncios carregam imagens de vários hosts)
   - `connect-src 'self' wss://minhalineup.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://fundingchoicesmessages.google.com`
3. **`test/ads.test.js`:** remover (ou inverter) o teste “o site nasce SEM anúncios”; ele existe justamente para impedir uma ativação por acidente.
4. `npm.cmd test` precisa passar (o teste de coerência exige a CSP e a chave juntas).
5. **Verificar em ambiente real antes de anunciar:** publique e abra cada página de conteúdo com `F12 → Console`. **Mensagens de CSP bloqueando algo** indicam um domínio que falta: libere um por vez, só o que for reportado. A lista acima é um ponto de partida, **não foi testada com anúncios reais** (exige conta aprovada e o domínio publicado). Confirme que: o aviso de consentimento aparece (use uma janela anônima), “Recusar” não carrega anúncios personalizados, o link “Preferências de anúncios” reabre o painel, e **a página do jogo e as salas continuam sem nenhuma requisição ao Google**.

## Desligar de novo
`enabled: false` e remova os domínios do Google da CSP (o teste de coerência confirma). Nada mais muda.

## Cuidados
- Nunca clique nos próprios anúncios (risco de banimento da conta).
- Anúncios só em páginas com conteúdo próprio; não coloque sobre botões do jogo.
- Cada novo domínio liberado na CSP aumenta a superfície de ataque: revise de tempos em tempos.

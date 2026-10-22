# PokéRush publicado — 22/10/2026

Disponível em **https://fun.kw1.com.br/**, na criação direta de sala e na escolha do lobby neutro.

Ativação concluída em **22/10/2026, 16:56:18 (America/Sao_Paulo)**. Release: `ea17594a4e19b6ce319767a855a25e0162482f4f`, promovida para `main` por fast-forward. [CI da main aprovado](https://github.com/Kiw1Labs/fun/actions/runs/39844278996); [CI da branch aprovado](https://github.com/Kiw1Labs/fun/actions/runs/39843672337), ambos no commit implantado. Uma falha inicial no teste de revanche foi corrigida para aguardar o snapshot do anfitrião antes de consultar os pontos; as regras não mudaram.

## Preparação

Inventário: release anterior `f54b55bb6e8e42ddc1fb4095913e595af2f05794`, manifesto íntegro, SQLite `ok`, 90 questões, nenhuma partida/participante ativo e aproximadamente 1,9 GB de memória disponível.

Backup exclusivo do Fun: `/root/fun/backups/pokerush-20261022T195141Z`, incluindo SQLite consistente, ambiente privado, auxiliar, manifesto, metadados e plano de rollback. Segredos não foram exibidos nem versionados. O auxiliar `/root/fun/auto_update.py` foi atualizado atomicamente para distribuir os assets do PokéRush, após backup. SHA-256 anterior: `add227b820453f1373439a75a7f236079176a239eb2ab4685a0e41f3ba9556d9`; novo: `9326fcd3bf30463401df0388cb85f187f6a747377e1bd34279ada4c5aee985cb`.

A release foi validada no aparelho antes de ativar, incluindo catálogo, 151 sprites, cópia de banco, conflitos editoriais e inicialização isolada. Sem Node, build nativo, dependências novas ou porta adicional. A ativação usou o gerenciador existente e reiniciou somente Fun. Observou-se HTTPS 502 durante a janela de reinício, seguido de HTTP/HTTPS 200. A parada normal concluiu sem intervenção nos processos compartilhados.

O gerenciador também criou `/data/data/com.termux/files/home/kiwiki-infra/backups/deployment-fun-20261022T195600Z`. Plano efetivo: `/root/fun/update-plan-ea17594a4e19b6ce319767a855a25e0162482f4f.json`.

## Verificação pública

Concluída às **17:00:05**, com Chromium desktop e contexto móvel com toque em sessões separadas. Relatório: `artifacts/pokerush/public-result.json`; screenshots: `artifacts/pokerush/public-1792699156726/`.

- HTTPS 200 no portal, saúde, catálogo e scripts/estilos; 151 Pokémon locais.
- Lobby neutro, convite, escolha de PokéRush e início com duas sessões **WSS reais**.
- Charizard e Squirtle aceitos nos tipos exatos, somando 120 pontos com sequência ×2.
- Envio antigo descartado; texto, foco, seleção e nó do campo preservados durante acerto alheio.
- Sugestões dos dois Nidoran sem tipos, preenchimento ou envio por toque.
- F5 preservando identidade e pontos; encerramento pelo relógio real; resultado e revanche zerando o estado.
- Sabe Essa? e Batata Quente iniciados em salas privadas, cada um com duas sessões WSS.
- Todas as salas de verificação encerradas; inventário final sem sala aberta ou participante.

Nenhum erro da aplicação e nenhuma consulta externa necessária ao jogo. O beacon de análise injetado pela borda Cloudflare foi bloqueado pela política `script-src 'self'` existente; esses avisos ficaram separados no relatório. Não se alterou Cloudflare ou a política de segurança para esse script.

## Preservação e rollback

Inventário final às **17:00:18**: manifesto íntegro, SQLite `ok`, as mesmas 90 questões, um único backend Fun, HTTP 200 em 5050/8082 e capacidade `pokerush` anunciada. Os quatro arquivos compartilhados mantiveram seus hashes; as dez identidades de processos monitoradas mantiveram PID e instante de início. Nginx, túneis, PostgreSQL, Django, Flask, SSH e Tailscale não foram reconfigurados ou reiniciados por esta publicação.

Respostas HTTP em 5000/8000/8080/8081 iguais ao inventário; LARP manteve HTTPS 200 e Serv manteve HTTPS 302. Prova: `artifacts/pokerush/preservation-result.json`.

Para rollback, usar `auto_update.py rollback fun --plan /root/fun/update-plan-ea17594a4e19b6ce319767a855a25e0162482f4f.json`, seguindo [DEPLOY.md](DEPLOY.md), encerrando previamente salas PokéRush ao voltar a código sem esse jogo e reiniciando somente Fun. Não restaurar o banco automaticamente. O auxiliar anterior também está no backup privado.

Pendente apenas o teste manual com teclado nativo em Android físico. Este registro fica na branch `docs/pokerush-publicacao`, separada da `main` implantada, para evitar outra reinicialização automática causada somente pela documentação.

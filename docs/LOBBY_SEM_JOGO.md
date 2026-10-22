# Lobby sem jogo — 22/10/2026

**Publicado e verificado em 22/10/2026 às 10:28:48 (America/Sao_Paulo)** em `https://fun.kw1.com.br/`, release `51fe06add79877cd100862c90a305dd4cba87f20`. A verificação pública confirmou HTTPS, duas pessoas por WSS, reconexão, escolha dos dois jogos, início e encerramento das salas temporárias. Detalhes da implantação abaixo.

O portal oferece **Lobby** antes de **Sabe Essa?** e **Batata Quente**. Ao selecionar essa opção, **Criar lobby** abre uma sala sem jogo definido. Nome, visibilidade, nickname e convites seguem o fluxo existente.

O anfitrião escolhe o jogo dentro do lobby, conservando código e participantes; depois inicia a partida pelo controle normal do jogo. Os convidados acompanham a escolha em tempo real. A sala sem jogo admite 16 pessoas. Batata Quente só pode ser escolhido com até 8 participantes ativos, incluindo vagas reservadas. A escolha não expulsa pessoas nem inicia a partida automaticamente.

## Implementação e recuperação

- `game: null` no snapshot/API; criação sem o campo conserva o padrão anterior, Sabe Essa?.
- `select_game` no WebSocket, autorizado ao anfitrião e idempotente. O lock existente resolve escolhas concorrentes; só a primeira escolha válida é aplicada.
- `/health` anuncia `unassigned-lobby`. O frontend exige essa capacidade para evitar criar uma sala do jogo errado em servidores antigos.
- Persistência, reconexão, transferência de anfitrião, nome, visibilidade, presença e encerramento usam o mesmo motor. Não há dependência, migração de banco ou alteração de infraestrutura.
- Backup local anterior à alteração: `artifacts/lobby-backup-20261022-094049/`. A base do checkout era `013be83` em `main`; o documento preexistente `INCIDENTE_2026-10-21.md` foi preservado fora desta alteração.
- Rollback de uma eventual implantação: retornar ao release anterior pelo procedimento existente em [DEPLOY.md](DEPLOY.md). Salas sem jogo criadas pela versão nova exigem a versão nova do backend; o rollback deve ser realizado sem lobbies neutros abertos. Não restaurar o banco automaticamente nem alterar serviços compartilhados.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| `python -m ruff check fun tests tools deploy` | Passou |
| `python -m pytest -q --basetemp=artifacts/pytest-lobby-full --tb=short` | 222 testes passaram |
| `npm.cmd run check` e `npm.cmd run build` | Passaram; build de 298.062 bytes sem compressão |
| `npm.cmd run test:browser` | 36 cenários passaram |
| `npm.cmd run test:batata` | 1 cenário completo passou |
| `npm.cmd run test:dev` | 1 cenário passou |
| `npm.cmd run test:catalog` | Partida completa de 15 desafios, 8 imagens/7 textos, desktop/celular, privacidade e créditos; passou |

Os novos testes cobrem criação sem jogo, listagem pública, escolha dos dois jogos, início posterior, F5, identidades conservadas, permissões, escolhas inválidas/concorrentes, reenvio idempotente, transferência do anfitrião, capacidade, vagas reservadas, inatividade e fechamento. O Chromium verificou desktop de 1.440 px e celular de 320 px, tema claro/escuro e ausência de erros JavaScript. As capturas `artifacts/lobby-home-*.png`, `lobby-desktop-*.png` e `lobby-mobile-*.png` foram geradas; o portal e os lobbies desktop/móvel foram inspecionados visualmente.

A primeira execução filtrada de navegador encontrou uma expectativa incorreta de texto no teste de Batata Quente. Ela foi corrigida e a suíte completa posterior passou. No Windows, essa execução inicial também deixou os servidores de teste presos no encerramento do sandbox; somente a árvore de processos identificada como pertencente ao teste foi encerrada. A execução completa com permissão para controlar os próprios processos terminou normalmente.

## Bloqueio inicial de publicação

HTTPS público respondeu 200 em 22/10/2026 às 09:44:59 (America/Sao_Paulo), ainda com a versão anterior. O SSH expirou tanto no sandbox quanto fora dele. A consulta ao Tailscale identificou o Android `M2006C3LII` como offline, com último contato às 23:24:56 de 21/10/2026. Foi solicitado ao usuário ativar o Tailscale do aparelho.

Sem acesso remoto não foi possível concluir inventário, backup e validação da nova versão em produção. Nenhum arquivo, configuração ou processo remoto foi alterado. Antes da ativação, realizar o inventário e backup Fun, confirmar impacto sobre salas existentes e validar HTTP/HTTPS e duas sessões WebSocket com criação de lobby, reconexão, escolha e encerramento. Não declarar publicação concluída com base apenas no HTTP 200 da versão anterior.

## Publicação concluída

O acesso SSH voltou na verificação seguinte solicitada pelo usuário. O inventário encontrou a release anterior íntegra, nenhuma sala aberta, nenhuma partida ativa e aproximadamente 1,8 GiB de memória disponível. O banco passou em `PRAGMA integrity_check`. O backup online e a configuração privada foram preservados em `/root/fun/backups/lobby-20261022T130422Z/`, com plano de rollback; o backup também passou na verificação de integridade.

O commit foi integrado por fast-forward e enviado à `main`. O [CI da main](https://github.com/Kiw1Labs/fun/actions/runs/39783882159) e o [CI anterior da branch](https://github.com/Kiw1Labs/fun/actions/runs/39781952142) concluíram com sucesso. Não houve alteração de dependências, conteúdo ou configurações de serviços compartilhados.

O atualizador existente preparou a release, mas a parada do backend anterior ficou esperando tarefas de fundo do Uvicorn e terminou com `service_stop_failed`. O backend deixou de escutar, mantendo o processo vivo; o controlador conservou a release anterior. O Fun ficou temporariamente indisponível durante essa recuperação, aproximadamente entre 10:10:38 e 10:28:13. Os demais serviços mantiveram seus processos e respostas HTTP.

Um SIGTERM adicional ao backend identificado não concluiu a parada. Após conferir PID, nascimento, argumentos e grupo, foi enviado SIGINT apenas ao Python antigo do Fun, conforme a indicação de CTRL+C no log do Uvicorn. Backend, proot e worker exclusivos do Fun encerraram; não foi usado SIGKILL. O mesmo controlador existente concluiu o plano preparado, com outro backup em `~/kiwiki-infra/backups/deployment-fun-20261022T132756Z/`. A ativação terminou às **10:28:13**, sem alterar o código dos controladores, e o estado ficou `deployed`, sem erro. O bloqueio de encerramento observado deve ser considerado na próxima manutenção; não foi presumido resolvido por uma mudança de código nesta publicação.

Às **10:28:48**, o Chromium público confirmou para **cada jogo**: portal/saúde/asset/convite/F5 com HTTPS 200; lobby criado com `game: null`; duas pessoas autenticadas por WSS; ausência de escolha para o convidado; retomada da identidade em F5; escolha do anfitrião conservando código, tokens e participantes; início de partida; e encerramento confirmado da sala temporária. Nenhum erro JavaScript. Foram inspecionadas visualmente as capturas públicas do portal desktop e do lobby móvel.

A conferência final às **10:29:43** confirmou manifesto íntegro, banco íntegro, zero salas abertas e zero participantes. Os quatro hashes dos arquivos compartilhados e dez identidades de processos (PID+nascimento) foram preservados. HTTP local antes/depois: 5000=200, 8000=404, 8080=403, 8081=404, 5050=200 e 8082=200. Backend e proxy anunciam `unassigned-lobby` e conservam 90 questões.

Evidências locais sem tokens: `artifacts/lobby-before-activation.json`, `lobby-activation-result.json`, `lobby-recovery-result.json`, `lobby-public-result.json`, `lobby-preservation-result.json` e capturas em `artifacts/lobby-public-1792675706165/`. A documentação pós-publicação fica em branch separada para não disparar outra implantação somente por registro de evidências.

# Lobby sem jogo — 22/10/2026

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

## Publicação pendente

HTTPS público respondeu 200 em 22/10/2026 às 09:44:59 (America/Sao_Paulo), ainda com a versão anterior. O SSH expirou tanto no sandbox quanto fora dele. A consulta ao Tailscale identificou o Android `M2006C3LII` como offline, com último contato às 23:24:56 de 21/10/2026. Foi solicitado ao usuário ativar o Tailscale do aparelho.

Sem acesso remoto não foi possível concluir inventário, backup e validação da nova versão em produção. Nenhum arquivo, configuração ou processo remoto foi alterado. Antes da ativação, realizar o inventário e backup Fun, confirmar impacto sobre salas existentes e validar HTTP/HTTPS e duas sessões WebSocket com criação de lobby, reconexão, escolha e encerramento. Não declarar publicação concluída com base apenas no HTTP 200 da versão anterior.

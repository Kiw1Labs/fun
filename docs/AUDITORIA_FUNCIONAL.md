# Auditoria funcional — 18/10/2026

Revisão motivada pelo erro “Informe apenas o nome” ao criar uma sala e pela regra confirmada de nome padrão “Sala do [nome do usuário]”. Alterações anteriores de interface e salas públicas foram preservadas. Backup do código e dos testes antes desta revisão: `artifacts/audit-backup-20261018-222532/`.

## Causa do erro relatado

O servidor que estava atendendo `http://127.0.0.1:5050` retornou HTTP 200 em `/health`, sem versão de API, e HTTP 404 em `GET /api/rooms`. O PID identificado por consulta de leitura era 15528, Python executando Fun. Isso confirmou que o processo ainda usava a API anterior, apesar de servir o build atualizado da interface. Aquela API só aceitava `name`, rejeitando os novos campos de nome/visibilidade.

O código agora declara `api_version: 2` na saúde, e a interface confere a compatibilidade antes de listar/criar/entrar. Um ensaio no servidor real ainda antigo confirmou a mensagem de reinício e **zero POSTs de criação**. Evidência visual: `artifacts/audit-old-server-detected.png`. Esse ensaio não criou sala nem alterou o banco do usuário. O processo existente foi preservado; é necessário encerrá-lo com Ctrl+C e iniciar `npm.cmd run dev` para carregar o backend corrigido.

`npm.cmd run dev` constrói a interface e acompanha mudanças de frontend/Python juntos, recusa porta ocupada e não termina processos preexistentes. Foi testado em uma cópia temporária, incluindo reinício, preservação da sala gravada, rebuild e recusa de JavaScript inválido sem substituir o build anterior. Usa somente dependências já instaladas.

## Problemas corrigidos e regressões

| Caso | Correção/verificação |
|---|---|
| Nome da sala vazio, espaços comuns ou espaços Unicode | Servidor cria “Sala do kiwi” para criador “kiwi”; público e privado, com nome do jogador normalizado. |
| Transferência de anfitrião/reinício | Nome original da sala permanece; não muda para o novo anfitrião. |
| Interface nova com API antiga | Mensagem específica de incompatibilidade, sem enviar uma criação que perderia metadados. |
| Retorno à sala pelo mesmo navegador | Retoma o token existente em vez de cadastrar outra pessoa; identidade e vaga preservadas. |
| Confirmação de resposta atrasada | Não apaga texto de outra tentativa que o jogador já começou a digitar. |
| Nova rodada após perder a revelação | Descarta rascunho da rodada anterior ao receber outro identificador de desafio. |
| Resultado com apenas um competidor | Ação de nova partida fica desabilitada até haver dois conectados e catálogo suficiente. |
| Nome longo no celular | Cabeçalho quebra a linha, sem rolagem horizontal em 320 px. |
| Navegador bloqueando armazenamento | Bloqueia criação antes do POST e explica o necessário; não deixa uma sala sem sessão recuperável. |
| Falha de rede, nome só com espaços ou sala cheia | Erro legível, nome preservado, botões reabilitados e cancelamento disponível. |
| Envios repetidos/Escape durante criação | Só um POST; cancelamento não interrompe uma criação já enviada. |
| Build com erro de sintaxe | Build interrompido antes de substituir os assets/HTML publicados. |

Antes das correções, os novos testes reproduziram o nome genérico incorreto, a falta de versão no contrato, a ausência de retomada e o apagamento da resposta em edição. Os testes originais sozinhos não cobriam a combinação de frontend reconstruído com processo Python antigo; a cobertura foi ampliada para esse caso.

## Resultados locais reais

| Comando/ensaio | Resultado |
|---|---|
| `npm.cmd run check` | Sintaxe JavaScript válida. |
| `npm.cmd run build` | Build estático válido. |
| `.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider` | 74 testes passaram. |
| `.\.venv\Scripts\python.exe -m ruff check fun tests tools deploy` | Passou. |
| `npm.cmd run test:browser` | 14 cenários Chromium passaram. |
| `npm.cmd run test:dev` | Ensaio de desenvolvimento/recarga/build passou. |
| `.\.venv\Scripts\python.exe -m tools.live_check` | HTTP/WS reais com 15 competidores e 1 espectador passaram. |
| `node artifacts/check-running-local.mjs` | API antiga detectada na porta real 5050, sem POST. |
| `git diff --check` | Sem erros de whitespace. |

A bateria de navegador completou **15 desafios** com dois clientes, conferiu revelações, chegou aos resultados, iniciou outra partida com pontos zerados e retornou ao lobby. Também cobriu erro/cooldown/acerto, atualização/F5, múltiplas abas, expulsão/controles, temas, menu móvel, teclado, seleção público/privado, listagem e convite privado. O teste de resposta atrasada usa WebSocket real com entrega controlada; o avanço do relógio existe somente no servidor de fixtures, fora da produção.

Os testes de backend incluem 20 entradas HTTP inválidas, limites de nomes, composição/histórico, origem, permissões, autenticação, idempotência, última vaga concorrente, reconexão/expiração, cancelamento, vitória automática, ranking, backup e pacote. Nenhum desafio definitivo foi cadastrado.

O ensaio com 16 pessoas preservou pontuação na retomada, recusou a 17ª entrada, repetiu 15 respostas sem duplicar pontos e cancelou imediatamente ao desconectar todos os competidores, mantendo o espectador. Mediana de resposta mais reenvio: **77,41 ms**, máximo **89,31 ms**; RSS observado **36,29–39,92 MiB** no PC. São medidas de um ensaio curto, não de carga sustentada ou Android.

Resta um aviso já existente de depreciação do TestClient/httpx; nenhum teste falhou por ele. Execução de navegador e limpeza de seus processos temporários foram realizadas com permissão fora do sandbox após restrição de encerramento no Windows. Os processos de teste foram encerrados. A configuração de CI inclui as novas verificações, mas a execução no GitHub não foi confirmada nesta revisão.

Esta auditoria não é garantia de ausência de todos os bugs. Não foram executados Safari/Firefox, teste formal de leitor de tela ou novo ensaio em Android/Termux. Nenhum serviço remoto, servidor de produção, Cloudflare ou banco do usuário foi alterado. Relatos anteriores permanecem em `VALIDATION.md` e `UI_MINIMALISTA.md`; este documento registra a revisão funcional mais recente.

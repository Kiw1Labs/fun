# Validação do PokéRush — 22/10/2026

Implementação na branch `feat/pokerush`, a partir de `f54b55b`. Inventário: frontend estático e backend Python/Starlette com Engine síncrono e lock ASGI compartilhado. O arquivo preexistente `docs/INCIDENTE_2026-10-21.md` foi preservado. Backup do HEAD anterior em `artifacts/pokerush/before-pokerush.zip` (12.672.537 bytes).

## Resultados executados

| Verificação | Resultado real |
| --- | --- |
| `npm.cmd run check` | Sintaxe aprovada, incluindo PokéRush |
| `npm.cmd run build` | Aprovado; 507.343 bytes de interface/conteúdo local sem compressão |
| `python -m ruff check fun tests tools deploy` | Aprovado |
| `python -m pytest -q --tb=short --basetemp=artifacts/pokerush/pytest-release` | **268 aprovados**, 98,04 s; um aviso de depreciação existente do TestClient/httpx |
| `npm.cmd run test:browser` | **36 cenários aprovados**, incluindo portal, lobby, Sabe Essa?, perfil, Godmode e contribuições |
| `npm.cmd run test:batata` | Aprovado; desktop/celular, jogo completo, animações, F5, revanche, transferência e remoção |
| `npm.cmd run test:dev` | Aprovado; configuração privada, atualização, recarga e preservação do servidor existente |
| `npm.cmd run test:catalog` | Partida completa: 15 questões únicas, 8 imagens/7 textos, desktop/celular, privacidade e créditos; nenhum erro de navegador |
| `npm.cmd run test:pokerush` | Aprovado; ensaio final completo com 2, 8 e 16 participantes reais, 15,92 s |
| `git diff --check` | Aprovado |

O primeiro uso do pytest encontrou uma restrição da pasta temporária padrão do Windows; a execução final usou a pasta isolada do projeto indicada acima. Não foi necessário alterar dependências.

## Regras e transporte

Os testes verificam o catálogo real completo, os tipos atuais, transparência/hash de todas as imagens, nomes e gêneros dos Nidoran, ausência de correção aproximada, correspondência exata de um ou dois tipos, uso global único, sorteio uniforme por conjunto, remoção de conjuntos esgotados, prevenção da repetição imediata e esgotamento dos 151 Pokémon.

Pontuação 50/70/90/110, continuidade após erros, interrupção por outro jogador, cooldown de 0,5 s, prazo exato, restauração da barra, estatísticas, empates e reinícios foram exercitados. Duas respostas concorrentes pelo HTTP/WebSocket real, tanto com nomes iguais quanto com dois nomes corretos diferentes, produziram um único acerto, 50 pontos totais, um Pokémon consumido e descarte do outro envio sem cooldown. Reenvio do mesmo ID não duplica pontos.

Reconexão preserva identidade, pontos e estatísticas. Novos participantes acompanham até a próxima partida. Foram conferidos transferência de anfitrião, abandono, remoção, placar inclusivo, cancelamento com todos os competidores offline mesmo com espectador conectado, limpeza da sala e cancelamento após reinício do processo.

## Navegador e visual

Evidência final: `artifacts/pokerush/browser-1792698019777/result.json`, com `ok: true`, `errors: []` e `external: []`. Nenhum erro de JavaScript/CSP e **nenhuma requisição HTTP externa** durante o jogo. O catálogo tem 151 sprites transparentes que somam 125.426 bytes, distribuídos localmente.

O ensaio confirmou que texto, nó do input, foco e seleção são preservados quando outra pessoa acerta. Sugestões começam com duas letras, incluem Pokémon já usados e ambos os Nidoran, não mostram tipos e não preenchem/enviam por toque. Os sprites das sugestões foram efetivamente carregados e decodificados no navegador.

Foi corrigida uma sobreposição de poucos pixels entre acerto e participante seguinte na mesa cheia. Também se adaptou a roda de grupos menores em celulares estreitos, reservando espaço para os acertos sem cobrir os tipos centrais. O ensaio final mede os retângulos de participantes, centro e acertos em larguras de 320/390/1440 pixels. Até 5 sugestões aparecem em fluxo normal com rolagem; em área reduzida, tipos e barra também aparecem junto ao campo. Foram conferidos silêncio persistente, movimento reduzido, F5, espectadores, empates, revanche, retorno ao lobby, remoção por teclado e temas claro/escuro.

Screenshots finais no mesmo diretório: `playing-desktop.png`, `playing-mobile.png`, `keyboard-viewport.png`, `eight-320.png`, `eight-390.png`, `eight-1440.png`, `sixteen-320.png`, `sixteen-390.png`, `sixteen-1440.png`, `sixteen-light-mobile.png`, `results-desktop.png` e `results-mobile.png`.

## Publicação e limites

Nenhuma configuração ou serviço remoto foi alterado. Esta entrega não afirma publicação em HTTPS/WSS. O build e o pacote local incluem o catálogo e os sprites; a preparação do atualizador foi testada para preservar esses arquivos e recusar caminhos inesperados.

Para uma futura implantação, o auxiliar do Fun instalado no servidor também precisa receber a versão que conhece os assets do PokéRush, após inventário, backup e revisão de impacto conforme [DEPLOY.md](DEPLOY.md). Validar HTTPS/WSS e os demais serviços após ativação. Antes de um eventual rollback para código que não conhece `pokerush`, encerrar somente as salas desse jogo; não restaurar banco automaticamente nem modificar serviços compartilhados.

Permanece pendente a verificação manual com teclado nativo em Android físico, além da publicação/verificação pública se solicitada. Os ensaios móveis desta entrega usaram Chromium com viewport, toque e contexto móvel emulados.

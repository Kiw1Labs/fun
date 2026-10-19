# Interface minimalista — 18/10/2026

Este documento registra a validação do redesenho. As correções e os resultados funcionais mais recentes estão em [AUDITORIA_FUNCIONAL.md](AUDITORIA_FUNCIONAL.md).

Redesenho do frontend a partir das referências visuais enviadas: fundo preto, tons de cinza, navegação lateral de 240 px, ícones de traço fino, títulos menores e mais espaço livre. O tema escuro passa a ser o padrão; uma preferência clara já salva continua sendo respeitada. A escolha de tema persiste no navegador.

O portal mantém um único jogo. Na segunda revisão, solicitada no desenho do usuário, o título fica no topo, o painel de criação à esquerda e a entrada por código à direita. No celular, os painéis ficam empilhados. A criação reúne cartão do jogo, nome da sala, Público/Privado e ação Jogar. Uma janela pede o nome do jogador antes de criar ou entrar. Lobby, partida, revelação, pontuação e confirmação de encerramento seguem a mesma paleta.

O usuário confirmou a listagem de salas públicas na página principal e acesso às privadas por código/link. Nome e visibilidade da sala são validados e persistidos pelo backend; salas antigas ficam privadas. A listagem não divulga participantes, tokens ou desafios. As regras da partida e o catálogo continuam preservados. Veja os detalhes técnicos em [DECISIONS.md](DECISIONS.md).

A navegação indica a tela atual e pode ser recolhida no desktop. No celular, abre sobre o conteúdo, fecha por Escape, toque fora ou seleção de destino, contém a navegação por Tab e devolve o foco ao botão de abertura ao fechar por Escape ou toque fora. O conteúdo fica inerte enquanto o menu está aberto. Os ícones são SVG locais, sem fontes, serviços ou dependências adicionais.

## Inventário e recuperação

O checkout estava limpo na branch `main`, commit `a30ba09`. Antes das alterações, os arquivos do frontend e o teste de navegador foram copiados para `artifacts/ui-backup-20261018-211109/`, ignorado pelo Git. A recuperação pode ser feita restaurando esses arquivos e executando novamente `npm.cmd run build`.

Antes da segunda revisão, o frontend, backend e testes afetados foram copiados para `artifacts/home-layout-backup-20261018-220428/`, preservando o trabalho da primeira revisão. Não há mudança no schema SQLite; snapshots antigos recebem nome padrão e visibilidade privada ao carregar. Para testar o backend novo em uma sessão local já aberta, reinicie `python -m fun` após o build.

Nenhum acesso ou alteração no servidor, processo de produção, infraestrutura ou Cloudflare foi realizado nesta revisão. O build foi gerado somente no PC; publicação e verificação pública não fazem parte desta entrega visual.

## Verificações executadas

- `npm.cmd run check`: passou.
- `npm.cmd run build`: passou; HTML/CSS/JS somam 43.025 bytes sem compressão.
- `.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider`: 45 testes passaram. Aviso de depreciação do TestClient; nenhum teste falhou.
- `.\.venv\Scripts\python.exe -m ruff check fun tests tools deploy`: passou.
- `npm.cmd run test:browser`: 4 cenários Chromium passaram, incluindo partida sintética, erro/acerto/revelação, F5, múltiplas abas, controles do anfitrião, tema persistido, lateral recolhível, menu móvel, teclado, cancelamento da identificação e criação/entrada nas salas públicas e privadas.
- `git diff --check`: passou.

Capturas inspecionadas visualmente em desktop e celular, com temas claro e escuro. Os testes conferem ausência de rolagem horizontal nos painéis em 320, 390, 768 e 1024 px e no lobby em 320/390 px. Também verificam a seleção Público/Privado pelas setas do teclado e texto com marcação exibido sem interpretar HTML. Isso não equivale a uma auditoria completa de acessibilidade ou de todos os navegadores.

Capturas em `artifacts/home-layout-desktop.png` (1920 px), `minimal-portal-desktop.png`, `minimal-portal-light.png`, `minimal-home-desktop.png`, `minimal-home-mobile.png`, `minimal-sidebar-mobile.png`, `minimal-portal-mobile.png` e `home-public-mobile.png`. Os cenários existentes também geram capturas de lobby, desafio e revelação. Capturas usam movimento reduzido para evitar registrar estados intermediários das transições. O encerramento dos servidores de teste considera também processos terminados por sinal, evitando espera por um evento de saída já emitido.

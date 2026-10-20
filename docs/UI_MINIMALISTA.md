# Interface minimalista — 18/10/2026

Este documento registra a validação do redesenho. As correções e os resultados funcionais mais recentes estão em [AUDITORIA_FUNCIONAL.md](AUDITORIA_FUNCIONAL.md).

## Nickname salvo sem identificação repetida — 20/10/2026

O nickname definido no perfil agora é reutilizado diretamente ao criar uma sala, entrar por código ou selecionar uma sala pública. Abrir um convite por link também entra com esse nickname, retomando primeiro uma sessão existente quando disponível. A identificação continua disponível para quem ainda não definiu um nickname válido. Falhas de entrada permitem tentar novamente sem redigitar o nome; pedidos repetidos durante a mesma operação não cadastram outra pessoa. Na página de convite, salvar o perfil substitui a pergunta de nome por “Você vai entrar como …”.

Inventário: arquivos locais com as alterações anteriores de perfil e lateral, preservados no backup `artifacts/saved-nickname-backup-20261020-084333/`. Alteração restrita ao frontend, testes e documentação; sem acesso ao servidor remoto.

Validação: `npm.cmd run check`, `npm.cmd run build` (212.156 bytes) e `git diff --check` passaram. A suíte Chromium concluiu **26 cenários, todos aprovados**, incluindo criação com nickname salvo, entrada por código/lista/link, F5 sem duplicar sessão, falha de rede recuperável, pedidos simultâneos e identificação para nickname inválido. O caso de nickname de 24 caracteres em uma tela de 320 px também passou sem rolagem horizontal; [captura da nova tentativa por link](../artifacts/saved-nickname-link-retry-mobile.png) inspecionada visualmente.

Na primeira execução ampliada, os testes novos consumiram o limite HTTP do servidor usado pela auditoria, produzindo 429 em dois cenários anteriores. Os cenários de nickname passaram a usar uma quarta instância isolada de testes na porta 15055, com checagem prévia de disponibilidade, banco e mídia temporários. A suíte completa então passou, preservando os limites do backend.

## Simplificação da lateral — 20/10/2026

Conforme solicitado, a lateral reúne perfil, “Início” e tema. O título “Jogos” e o botão “Sabe Essa?” foram removidos; criação e entrada nas salas continuam na página inicial `/`. O texto padrão do perfil é “Adicione seu nickname”. Backup anterior a esta simplificação em `artifacts/sidebar-home-only-backup-20261020-083809/`, preservando as alterações locais anteriores.

Validação: sintaxe, build e `git diff --check` passaram. Os dois cenários existentes de portal/sala e navegação compacta passaram no Chromium, incluindo criação pela home, F5, múltiplas abas, tema, menu móvel e teclado. Captura da lateral móvel em `artifacts/minimal-sidebar-mobile.png` inspecionada visualmente. Alteração local, sem acesso ao servidor remoto.

## Edição do nome do usuário — 20/10/2026

O topo da lateral agora inclui um botão com ícone de pessoa, nome atual e indicação “Alterar nome”, abaixo da marca e acima de “Início”. Abre um popup com campo de nome, Salvar nome e Cancelar. A preferência fica neste navegador e preenche os próximos formulários de identificação. Dentro da sala atual, o nome também muda no placar de todos por confirmação do servidor, preservando sessão e pontos. Nomes com marcação são exibidos como texto. Não altera automaticamente o nome da sala.

O controle continua disponível como ícone na lateral recolhida. No celular, fica no topo do menu; abrir o popup fecha o menu e, ao fechar o popup, o foco volta ao botão de navegação. O diálogo oferece rótulos, limite de 24 caracteres, erro de validação e bloqueio de reenvio enquanto salva.

Inventário antes desta alteração: checkout limpo na branch `main`, commit `b4ae51a`. Backup dos arquivos afetados em `artifacts/profile-name-backup-20261020-080801/`, ignorado pelo Git. Para recuperar, restaurar os arquivos correspondentes desse diretório e executar `npm.cmd run build`. Alterações e testes realizados somente no PC.

Validação desta revisão:

- `npm.cmd run check` e `npm.cmd run build`: passaram; build com 211.610 bytes sem compressão, incluindo arquivos de marca e Godmode.
- `.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp=<diretório novo em artifacts>`: **107 testes passaram**, com um aviso de depreciação já existente do TestClient. `FUN_MEDIA` apontou para mídia isolada de teste. Diretórios antigos de mídia e temporários recusaram acesso, inclusive na tentativa fora da sandbox; nenhuma permissão desses diretórios foi alterada.
- `.\.venv\Scripts\python.exe -m ruff check fun tests tools deploy` e `git diff --check`: passaram.
- `npm.cmd run test:browser`: **20 cenários passaram**. Os quatro novos verificam popup, espaços em branco, cancelamento, F5, preenchimento da criação/entrada, texto com marcação, nome durante a partida sem perder pontos, atualização entre abas, armazenamento bloqueado, recusa do servidor, envio repetido e retomada do mesmo evento após perda da confirmação. Servidores de navegador usam `FUN_MEDIA` dentro do diretório temporário, sem consultar a mídia de produção.
- Revisão visual em desktop e celular de 320 px, nos temas claro e escuro. Após trazer a aba de celular para primeiro plano para capturas completas, os quatro cenários de perfil foram repetidos e passaram. Uma execução adicional ficou presa na limpeza pela sandbox; apenas sua árvore de processos de teste foi encerrada, e a repetição fora da sandbox concluiu a limpeza normalmente.

Capturas: [lateral no desktop](../artifacts/profile-sidebar-desktop.png), [popup no desktop](../artifacts/profile-popup-desktop.png), [popup claro](../artifacts/profile-popup-light.png), [lateral no celular](../artifacts/profile-sidebar-mobile.png) e [popup no celular](../artifacts/profile-popup-mobile.png). Não houve publicação ou alteração no servidor remoto nesta revisão.

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

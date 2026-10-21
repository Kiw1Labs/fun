# Painel administrativo Godmode

Após o login em `/godmode`, os cartões permitem escolher a consulta: primeiro **Salas abertas**, com os dados das salas públicas e privadas, e depois **Sabe Essa?**, com perguntas e respostas.
Uma terceira opção, **Contribuições**, lista somente as questões recebidas que aguardam análise. Abra um cartão para consultar título, referência, imagem, resposta, categorias sugeridas em texto livre e nickname opcional. Para aprovar, marque uma ou mais **Categorias finais**, escolha a dificuldade e registre os direitos/fonte de uso revisados; a questão entra no acervo com a tag **Contribuição**. As categorias começam desmarcadas e a sugestão original é preservada no banco privado. **Recusar questão** retira o envio da fila sem adicioná-lo ao jogo e dispensa a seleção de categorias. Consulte [NOVA_QUESTAO.md](NOVA_QUESTAO.md) para os detalhes do fluxo e da implantação.

**Sabe Essa?** mostra todas as perguntas registradas no SQLite em uma grade de cartões com imagem e enunciado, incluindo rascunhos, perguntas em revisão e inativas. Questões de texto têm uma indicação própria; imagens ausentes exibem uma mensagem. Clique em um cartão, ou use Enter/Espaço, para abrir os detalhes: imagem completa, enunciado, resposta, outras respostas aceitas, todas as categorias aprovadas, subcategoria, dificuldade, formato, status e identificador. Feche pelo botão, com Escape ou clicando fora do popup; o foco retorna ao cartão. A busca continua consultando enunciados, respostas, alternativas, qualquer categoria aprovada e identificadores.

**Salas abertas** mostra nome, código, link, visibilidade, fase, participantes e anfitrião atual. Cada pessoa informa se está conectada ou desconectada. Saídas e expulsões removem a pessoa dessa consulta, e a identificação do anfitrião acompanha a transferência do papel no servidor. O botão **Atualizar** consulta novamente os dados; abrir a opção de salas também atualiza a consulta.

Os links são montados no próprio domínio, usando somente códigos válidos de quatro letras, e abrem a sala em outra aba pelo fluxo normal de entrada. A API administrativa fornece apenas nome, indicação de anfitrião e estado de conexão de cada participante; tokens, hashes de sessão e identificadores internos não são enviados. Nomes e demais textos são inseridos como texto, sem interpretar HTML.

## Acesso

O painel aceita vários usuários com senhas individuais. A conta já configurada em `FUN_ADMIN_USERNAME` e `FUN_ADMIN_PASSWORD` continua funcionando. As contas adicionais ficam em um arquivo privado, com hashes de senha, fora do repositório. Sem conta válida em nenhuma dessas fontes, o painel fica desativado e responde `404`.

## Adicionar usuários

No terminal do projeto, execute para cada pessoa:

```powershell
npm.cmd run admin:add -- joao
```

Troque `joao` pelo nome desejado. O comando pede uma senha de 12 a 256 caracteres e sua confirmação, sem mostrar o que foi digitado nem aceitar senha em argumentos. Se omitir o nome, também será perguntado no terminal. Repita o comando com outro nome para adicionar mais pessoas. O mesmo login de `/godmode` aceita todas essas contas, com o acesso de leitura já existente. Não há níveis de permissão diferentes.

O usuário atual não é substituído. Nomes que já existem são recusados, inclusive o nome definido em `FUN_ADMIN_USERNAME`; nenhum cadastro troca uma senha anterior. Não é preciso reiniciar o Fun depois de incluir uma conta. O arquivo é atualizado com lock, backup e troca atômica, e é recarregado na próxima consulta administrativa. O comando recusa terminais que não consigam ocultar a senha.

Por padrão, o arquivo chama-se `godmode-users.json` e fica na mesma pasta do banco do Fun: `data/godmode-users.json` no PC e junto ao banco em `shared/` na configuração de produção. É possível indicar outro caminho privado com `FUN_ADMIN_USERS_FILE`. O cadastro e o servidor devem usar a mesma configuração. Não coloque esse arquivo nas pastas públicas de assets ou mídia. Backups `.backup-*` ficam ao lado dele, com os mesmos cuidados de acesso. Os registros contêm hashes e salts, nunca as senhas digitadas. Para execução direta em um ambiente já configurado: `python -m tools.add_admin nome`; a versão via npm carrega os arquivos de ambiente locais automaticamente.

O endereço apresenta uma tela própria de login em português. Os dados são conferidos no servidor; as APIs `/api/godmode/rooms` e `/api/godmode/questions` exigem o cabeçalho HTTP Basic, mas não enviam o desafio `WWW-Authenticate`; credenciais inválidas aparecem na própria tela, sem abrir a janela nativa do navegador. A senha fica apenas na memória da página enquanto o painel está aberto e não é gravada em armazenamento do navegador. Dez tentativas inválidas por IP em um minuto são permitidas; depois disso, o servidor limita novas tentativas antes de calcular hashes. Há um teto de 60 consultas administrativas por IP/minuto. Use uma senha forte e acesse somente por HTTPS em produção.

As respostas usam `Cache-Control: no-store`, e a página solicita aos buscadores que não a indexem. A rota do painel e seus arquivos estáticos não contêm dados administrativos; todas as informações são servidas pelas APIs protegidas.

## Desenvolvimento e build

O login e o painel seguem a estética do portal: marca oficial, paleta neutra, fonte do sistema, barra lateral, painéis com bordas discretas e botões arredondados. O tema claro/escuro usa a mesma preferência `fun:theme` da página principal. No celular, o menu bloqueia o conteúdo enquanto está aberto, mantém a navegação por teclado e fecha com Escape ou toque fora. A grade ajusta a quantidade de colunas à largura da tela, e o popup rola internamente sem alargar a página. As miniaturas são carregadas sob demanda e preservam a imagem inteira; nenhum arquivo de mídia é gerado ou alterado.

No PC, `npm.cmd run dev` carrega `.env.local` e `.env` na raiz do projeto. As variáveis já definidas no terminal têm prioridade, seguidas de `.env.local` e `.env`. Os dois arquivos privados são ignorados pelo Git; não copie os caminhos de produção de `.env.example` para o PC.

Configure `FUN_ADMIN_USERNAME` e `FUN_ADMIN_PASSWORD` nesse arquivo privado, usando uma senha forte. O launcher não cria senhas padrão nem imprime credenciais nos logs. Depois de editar esses arquivos, encerre o launcher com Ctrl+C e execute `npm.cmd run dev` novamente. Requer Node 20.12+ para carregar os arquivos de ambiente sem dependências adicionais.

Para execução manual com `python -m fun`, configure as variáveis no processo antes de iniciar. Gere os arquivos estáticos com:

```sh
npm run build
```

O build copia `frontend/godmode.html` para `dist/godmode.html`. O backend serve `godmode.js` e `godmode.css` pelas rotas de assets. Os dados vêm do mesmo motor de salas e da tabela `questions` do SQLite do Fun.

Os testes correspondentes estão em `tests/test_app.py` e `tests/browser.test.mjs` e podem ser executados com:

```sh
python -m pytest
npm run test:browser
```

## Correção da tela após login — 20/10/2026

### Grade de questões e popup de detalhes

A consulta **Sabe Essa?** passou de tabela para grade, conforme solicitado. Os cartões mostram miniatura, enunciado, categoria, dificuldade e status; respostas e alternativas ficam no popup. A implementação usa o `dialog` nativo do navegador, texto inserido sem interpretar HTML e as imagens existentes em `/media/` no próprio domínio. Não há nova dependência, mudança de API, banco ou regra de jogo. A opção **Salas abertas** continua primeiro na seleção, e **Sabe Essa?** permanece a consulta inicial.

Validação final: cinco cenários Chromium de Godmode passaram, incluindo login de contas distintas, grade, detalhes de imagem e texto, mídia ausente, busca por resposta e alternativa, Escape, retorno de foco, textos com HTML exibidos literalmente, temas e telas de 320 a 1440 px. Build e verificação de sintaxe passaram. A verificação pública confirmou 90 cartões, 48 questões de imagem, miniaturas visíveis carregadas, detalhes e respostas, busca, logout, APIs autenticadas HTTP 200 e ausência de erros JavaScript. HTTP, HTTPS e uma conexão WSS foram verificados; a sala privada temporária foi encerrada. Evidências em `artifacts/godmode-grade/`, incluindo `public-verification.json` e capturas de desktop/celular.

Antes da entrega, o manifesto completo e os hashes dos arquivos online foram conferidos; os três arquivos de origem coincidiam com o backup local anterior à alteração. A entrega mudou somente HTML, CSS e JavaScript do Godmode, a cópia estática do HTML e suas entradas no manifesto. Nenhum serviço foi reiniciado. Backup e rollback com guardas de release e hashes em `/root/fun/backups/godmode-grade-20261020T142714Z-06e947ff/`. O manifesto completo foi validado novamente após a escrita. O `rollback.py` dessa pasta restaura os arquivos anteriores sem reiniciar serviços. Backup local em `artifacts/godmode-grade-backup-20261020-111749/`.

### Opções Sabe Essa? e Salas abertas

Revisão solicitada em 20/10/2026: cartões no formato da seleção do jogo, com indicação da opção selecionada. A consulta de perguntas é a opção inicial; as duas opções funcionam por clique e teclado. As salas mostram participantes ativos, incluindo sessões desconectadas ainda reservadas. O anfitrião aparece primeiro e sua identificação vem do estado autoritativo do servidor. A mudança adiciona o campo `people` à API administrativa, sem alterar o banco ou as regras das partidas.

Validação: quatro testes da API e quatro cenários de navegador passaram, cobrindo autenticação, campos permitidos, estados de conexão, saídas, expulsões, encerramento, transferência de anfitrião, links, textos com marcação HTML exibidos literalmente e telas de 320 a 1440 px. Também passaram build, sintaxe, Ruff e verificação de espaços no diff. A primeira tentativa Python no sandbox foi bloqueada ao consultar `data/media`; a repetição autorizada passou, com o aviso de depreciação já existente do TestClient.

A entrega online alterou somente os arquivos do Godmode e a consulta `godmode_rooms` em `fun/app.py`, com conferência de que o restante do backend permaneceu igual. Backup SQLite consistente com integridade `ok`, configuração e arquivos anteriores em `/root/fun/backups/godmode-opcoes-20261020T133048Z-7080c866/`. O manifesto foi validado integralmente antes e depois da atualização. O `rollback.py` da pasta restaura os arquivos com guardas de release e hashes; para carregar o backend restaurado, usar o controlador existente para reiniciar somente Fun, depois de confirmar ausência de participantes e partidas.

Não havia salas, participantes ou partidas ativos antes da atualização. Foi usado exclusivamente `services.py restart fun` do controlador existente, sem editar sua configuração. Os dez processos verificados dos demais sistemas permaneceram iguais, assim como suas respostas HTTP. Nenhuma credencial foi alterada.

A verificação pública confirmou 90 perguntas, os dados de uma sala privada temporária com dois participantes via WSS, abertura do link em outra aba, transferência do anfitrião, atualização e logout. A sala de teste foi encerrada, todas as consultas autenticadas retornaram HTTP 200 e não houve erro JavaScript. Houve timeout no caminho de rede padrão do PC; HTTPS respondeu normalmente por IPv4 e pelo próprio servidor. O teste final do Chromium usou IPv4 somente naquele navegador, com verificação normal de TLS e sem mudar a rede ou o túnel. Evidências em `artifacts/godmode-opcoes/`, incluindo `public-verification.json` e capturas de desktop/celular.

### Visual alinhado ao portal

A revisão seguinte substituiu o visual azul e os gradientes pela estética da home, no formulário e no painel. A marca, as cores e a fonte foram comparadas com `https://fun.kw1.com.br/` em ambos os temas. As verificações públicas em 1440×1000 e 390×844 confirmaram login e saída, busca, atualização, 90 perguntas, APIs HTTP 200, ausência de erros JavaScript e página sem rolagem horizontal. As capturas ficam em `artifacts/godmode-estetica/`; os testes locais usam apenas contas e perguntas artificiais.

Passaram build, verificação de sintaxe, `git diff --check` e os três cenários de navegador selecionados por `godmode`. Uma repetição no sandbox do Windows falhou no encerramento dos processos temporários; somente a árvore desse teste foi encerrada após conferir PID, comando e criação. A repetição final fora dessa restrição passou com os três cenários e encerramento normal.

A entrega online alterou somente `frontend/godmode.html`, `frontend/godmode.css`, `frontend/godmode.js`, a cópia estática de `godmode.html` e os hashes correspondentes no manifesto. Nenhum serviço foi reiniciado e nenhuma credencial foi alterada. Backup completo anterior ao novo visual em `/root/fun/backups/godmode-estetica-20261020T130257Z-653da347/`; backup do ajuste final de legibilidade em `/root/fun/backups/godmode-estetica-20261020T130741Z-93a72745/`. Cada pasta contém `CHANGE.json` e `rollback.py`, com conferência da release e hashes. Para voltar ao visual anterior, executar os rollbacks na ordem inversa. Os demais arquivos da release foram verificados contra o manifesto antes e depois da entrega.

### Correção inicial da transição

O login online era aceito pelas APIs, mas a regra `display: grid` de `.login-shell` prevalecia sobre o atributo `hidden`. O formulário permanecia visível e o painel aparecia abaixo da primeira tela. A regra `.login-shell[hidden]{display:none}` restaura a transição entre login e painel. Os testes de navegador agora verificam que o formulário desaparece ao entrar e que o painel desaparece ao sair, em desktop e celular; os dois cenários falharam antes da correção e passaram depois.

Aplicada somente essa regra ao CSS da release online, com atualização de seu hash no manifesto. Backup anterior do CSS e manifesto, registro da alteração e `rollback.py` em `/root/fun/backups/godmode-visibility-20261020T124945Z-fb8fe4a8/`. O rollback confere a release e os hashes antes de restaurar. Nenhum serviço foi reiniciado, e nenhuma conta, senha ou dado de sala foi alterado. O manifesto completo estava consistente antes da mudança.

A verificação pública em `https://fun.kw1.com.br/godmode`, em Chromium com telas de 1366×900 e 390×844, confirmou autenticação, APIs HTTP 200, 90 perguntas carregadas, formulário oculto e painel no topo, saída normal e ausência de erros JavaScript. Evidências locais, sem senhas, em `artifacts/godmode-online-login/`. Esta verificação cobre somente o painel administrativo.

## Entrega de múltiplos usuários — 20/10/2026

Implementação local com backup anterior em `artifacts/godmode-users-backup-20261020-091828/`, incluindo backup SQLite consistente. Não havia salas com atividade antes das alterações no backend observado pelo launcher. Nenhuma senha da configuração existente foi alterada, e nenhum nome novo foi inventado ou cadastrado no ambiente real; os nomes e senhas são escolhidos por você no comando de cadastro. Não foi iniciado outro servidor em segundo plano nem houve acesso ao Android.

A validação completa passou com 131 testes Python e 27 cenários Chromium, incluindo dois usuários adicionais, senhas cruzadas recusadas e compatibilidade com o login anterior. Também passaram sintaxe, build, Ruff, pacote sem dados privados e teste integrado do launcher. A revisão seguinte evita hashes repetidos nas leituras do painel: os dois cenários de login foram repetidos e passaram; depois, os 26 testes específicos passaram, incluindo a invalidação por troca do arquivo durante uma autenticação em andamento. Testes usam apenas credenciais artificiais e arquivos temporários. Os detalhes de implementação e referências do algoritmo estão em [DECISIONS.md](DECISIONS.md).

Rollback de código: restaurar os arquivos correspondentes do backup e remover os novos módulos e ferramentas adicionados nesta revisão. Os usuários adicionais devem ser preservados no arquivo privado; não é preciso restaurar o banco de salas. A conta anterior permanece na configuração privada original.

## Correção local verificada — 20/10/2026

Em `127.0.0.1:5050`, a resposta “Painel administrativo indisponível” era causada pela ausência das duas variáveis de administrador. O launcher passou a carregar arquivos de ambiente privados. Foi criada uma configuração local em `.env.local`, ignorada pelo Git, com senha aleatória; nenhuma credencial existente foi substituída nem impressa nos logs. O comportamento do backend sem credenciais foi preservado.

Antes do reinício, o banco local tinha 90 perguntas e nenhuma sala ou participante conectado. Backup SQLite online, com integridade verificada, em `artifacts/godmode-local-backup-20261020-090241/fun.sqlite3`; fontes e documentação anteriores estão na mesma pasta. Apenas o launcher local e seus processos Python foram reiniciados. Não houve acesso ao Android ou alteração nos demais sistemas.

Verificações executadas: `npm.cmd run check`, teste integrado `npm.cmd run test:dev` e os três testes Python de Godmode passaram. O teste do launcher cobre `.env.local` sobre `.env`, variáveis explícitas sobre os arquivos, senha entre aspas, APIs protegidas, recarga do Python e logs sem credenciais. No endereço local real, HTTP `/godmode` retornou 200, a API sem login retornou 401, o navegador autenticou, carregou 90 perguntas e saiu normalmente, sem erros JavaScript. Captura da tela de login em `artifacts/godmode-local-backup-20261020-090241/login-local.png`.

A instância local foi iniciada em segundo plano. Registro do processo e logs em `artifacts/godmode-local-backup-20261020-090241/`. Para voltar à execução no seu terminal, execute o script `stop-local.ps1` dessa pasta no PowerShell, seguido de `npm.cmd run dev`. O script confere PID, comando e horário de criação antes de parar a instância. Para desfazer a alteração do launcher, restaure `tools/dev.mjs` do backup e reinicie o Fun local; o banco não precisa ser restaurado para esse rollback de código.

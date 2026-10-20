# Painel administrativo Godmode

O painel em `/godmode` exibe salas abertas (públicas e privadas) e todas as perguntas registradas no SQLite, incluindo rascunhos, perguntas em revisão e inativas. Códigos de sala são informativos; não há links ou ações para entrar nas salas.

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

## Entrega de múltiplos usuários — 20/10/2026

Implementação local com backup anterior em `artifacts/godmode-users-backup-20261020-091828/`, incluindo backup SQLite consistente. Não havia salas com atividade antes das alterações no backend observado pelo launcher. Nenhuma senha da configuração existente foi alterada, e nenhum nome novo foi inventado ou cadastrado no ambiente real; os nomes e senhas são escolhidos por você no comando de cadastro. Não foi iniciado outro servidor em segundo plano nem houve acesso ao Android.

A validação completa passou com 131 testes Python e 27 cenários Chromium, incluindo dois usuários adicionais, senhas cruzadas recusadas e compatibilidade com o login anterior. Também passaram sintaxe, build, Ruff, pacote sem dados privados e teste integrado do launcher. A revisão seguinte evita hashes repetidos nas leituras do painel: os dois cenários de login foram repetidos e passaram; depois, os 26 testes específicos passaram, incluindo a invalidação por troca do arquivo durante uma autenticação em andamento. Testes usam apenas credenciais artificiais e arquivos temporários. Os detalhes de implementação e referências do algoritmo estão em [DECISIONS.md](DECISIONS.md).

Rollback de código: restaurar os arquivos correspondentes do backup e remover os novos módulos e ferramentas adicionados nesta revisão. Os usuários adicionais devem ser preservados no arquivo privado; não é preciso restaurar o banco de salas. A conta anterior permanece na configuração privada original.

## Correção local verificada — 20/10/2026

Em `127.0.0.1:5050`, a resposta “Painel administrativo indisponível” era causada pela ausência das duas variáveis de administrador. O launcher passou a carregar arquivos de ambiente privados. Foi criada uma configuração local em `.env.local`, ignorada pelo Git, com senha aleatória; nenhuma credencial existente foi substituída nem impressa nos logs. O comportamento do backend sem credenciais foi preservado.

Antes do reinício, o banco local tinha 90 perguntas e nenhuma sala ou participante conectado. Backup SQLite online, com integridade verificada, em `artifacts/godmode-local-backup-20261020-090241/fun.sqlite3`; fontes e documentação anteriores estão na mesma pasta. Apenas o launcher local e seus processos Python foram reiniciados. Não houve acesso ao Android ou alteração nos demais sistemas.

Verificações executadas: `npm.cmd run check`, teste integrado `npm.cmd run test:dev` e os três testes Python de Godmode passaram. O teste do launcher cobre `.env.local` sobre `.env`, variáveis explícitas sobre os arquivos, senha entre aspas, APIs protegidas, recarga do Python e logs sem credenciais. No endereço local real, HTTP `/godmode` retornou 200, a API sem login retornou 401, o navegador autenticou, carregou 90 perguntas e saiu normalmente, sem erros JavaScript. Captura da tela de login em `artifacts/godmode-local-backup-20261020-090241/login-local.png`.

A instância local foi iniciada em segundo plano. Registro do processo e logs em `artifacts/godmode-local-backup-20261020-090241/`. Para voltar à execução no seu terminal, execute o script `stop-local.ps1` dessa pasta no PowerShell, seguido de `npm.cmd run dev`. O script confere PID, comando e horário de criação antes de parar a instância. Para desfazer a alteração do launcher, restaure `tools/dev.mjs` do backup e reinicie o Fun local; o banco não precisa ser restaurado para esse rollback de código.

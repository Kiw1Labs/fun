# Fun · Sabe Essa?

Portal de jogos multiplayer em pt-BR. Primeiro jogo: **Sabe Essa?**. O portal e a home do jogo usam `/`; salas usam exatamente quatro letras, por exemplo `/ABCD`.

Implementação com motor autoritativo, HTTP/WebSocket, frontend responsivo claro/escuro e persistência privada. **Acervo inicial real: 90 perguntas, 48 imagens WebP locais e 42 textos.** Ver [banco de perguntas](docs/BANCO_DE_PERGUNTAS.md) para importação, fontes e licenças. A interface impede iniciar quando o catálogo não satisfaz composição e histórico. Fixtures artificiais existem somente nos testes, fora do pacote de produção.

**Produção verificada em 19/10/2026:** catálogo ativo em [fun.kw1.com.br](https://fun.kw1.com.br/), com partida pública completa de 15 rodadas em desktop/celular. Atualização automática integrada ao worker existente, exigindo CI verde e preservando o intervalo de 300 segundos entre ciclos. Detalhes e backups em [DEPLOY.md](docs/DEPLOY.md).

## Desenvolvimento no Windows

Checkout confirmado: `C:\Users\eduar\Documents\github\fun`. Requer Python 3.11+ e Node 20.12+. Os comandos abaixo são PowerShell; usar `npm.cmd` evita depender de mudança da política de scripts do Windows. Se `python` for um alias da Store sem acesso, usar o executável real exibido por `py -0p` para criar o venv. Não modificar credenciais existentes.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm.cmd ci --ignore-scripts
npm.cmd run dev
```

Abrir **http://127.0.0.1:5050**. Na página principal, escolha Sabe Essa?, preencha o nome da sala, selecione Público/Privado e clique em **Jogar**. Uma janela pede seu nome como jogador. Salas públicas aparecem abaixo dos painéis; para uma privada, use o painel de entrada com o código ou compartilhe a URL de quatro letras. A navegação do jogo permanece em `/`. Backend local aceita Origin localhost/127.0.0.1 na porta 5050; para outro endereço, definir `FUN_ORIGINS` explicitamente. O frontend já construído é servido pelo backend no desenvolvimento; produção serve assets no Nginx existente. Não executar múltiplos workers.

No Linux: `.venv/bin/python` no lugar de `.\.venv\Scripts\python.exe`. As variáveis estão em `.env.example`; o supervisor as carrega, mas `python -m fun` não lê `.env` automaticamente. `npm.cmd run dev` carrega `.env.local` e `.env`, preservando primeiro as variáveis do terminal. Use caminhos locais nesses arquivos, que são ignorados pelo Git. Dados de desenvolvimento ficam em `data/`, ignorado pelo Git.

Para habilitar o [Godmode local](docs/GODMODE.md), cadastre um usuário com o comando abaixo, ou mantenha o par `FUN_ADMIN_USERNAME`/`FUN_ADMIN_PASSWORD` em `.env.local`. Alterações nas variáveis exigem reiniciar `npm.cmd run dev`; contas adicionadas pelo comando são reconhecidas automaticamente. Sem conta em nenhuma dessas fontes, `/godmode` responde `404` com “Painel administrativo indisponível”. Senhas nunca são incluídas nos logs.

Para adicionar outros usuários ao Godmode, execute **`npm.cmd run admin:add -- joao`**, trocando `joao` pelo nome escolhido. O comando solicita e confirma uma senha oculta de pelo menos 12 caracteres e salva somente seu hash. Repita com outro nome para cadastrar mais contas. O administrador anterior continua funcionando, e os novos cadastros passam a valer sem reiniciar o Fun. Os dados ficam em `data/godmode-users.json` (ou junto ao banco configurado), fora do Git. Veja [cadastro e configuração](docs/GODMODE.md#adicionar-usuários).

Com o ambiente já instalado, basta **`npm.cmd run dev`**. Esse comando gera o build, observa a interface e reinicia o Python local quando o código dele muda. Após editar a interface, atualize a página no navegador. Encerre com **Ctrl+C**. Uma reinicialização durante uma partida cancela a partida e preserva o estado recuperável, como definido na especificação.

Se a porta 5050 estiver ocupada, pare o Fun anterior com Ctrl+C no terminal em que foi iniciado e execute o comando novamente. O launcher não encerra um servidor preexistente. A interface detecta API antiga para evitar erros como “Informe apenas o nome” após atualizar só o frontend. Para execução manual sem observação: `npm.cmd run build`, seguido de `.\.venv\Scripts\python.exe -m fun`.

Nome da sala vazio ou apenas com espaços recebe **“Sala do [nome do usuário]”**. Reentrar pelo mesmo navegador retoma a sessão existente, sem gastar outra vaga. Nomes de salas já gravados são preservados.

## Testes e build

```powershell
npm.cmd run check
npm.cmd run build
.\.venv\Scripts\python.exe -m ruff check fun tests tools deploy
.\.venv\Scripts\python.exe -m pytest -q
npx.cmd playwright install chromium
npm.cmd run test:browser
npm.cmd run test:dev
.\.venv\Scripts\python.exe -m tools.measure
.\.venv\Scripts\python.exe -m tools.bundle
```

Testes cobrem regras, distribuição simultânea dos desafios, tempo e pontuação, prazo de erro, aliases, histórico, espectadores, ranking inclusivo, cancelamento, expulsões, transferência, expiração, retomada, duplicação, disputa pela última vaga e concorrência entre abas. Os testes de navegador usam servidores isolados nas portas locais 15050/15051, banco temporário e fixtures excluídas de produção. Geram screenshots em `artifacts/`. O teste de pacote deve ser executado após build.

`requirements.lock` fixa todas as dependências de produção e hashes de wheels universais. Para auditoria opcional: instalar `pip-audit` em ambiente de desenvolvimento e executar `python -m pip_audit -r requirements.lock`. O runtime não precisa dele.

## Organização e operação

- `fun/engine.py`: salas, identidade, conexões, prazos e eventos idempotentes.
- `fun/games/`: registro modular e política Sabe Essa?.
- `fun/catalog.py`: validação editorial, normalização e seleção exata.
- `fun/app.py`: HTTP, WebSocket, heartbeat, limites e snapshots privados.
- `fun/store.py`: SQLite exclusivo, snapshots atômicos e recuperação.
- `frontend/`: portal, sala, jogo e acessibilidade responsiva sem dependências de runtime.
- `deploy/`: Nginx por hostname, runit com rotação, preparação de release e plano aditivo.

Leia [especificação](docs/PRODUCT_SPEC.md), [arquitetura original](docs/ARCHITECTURE.md), [decisões técnicas](docs/DECISIONS.md), [catálogo privado](docs/CATALOG.md), [deploy e rollback](docs/DEPLOY.md) e [validação executada](docs/VALIDATION.md).

A auditoria funcional mais recente, com as correções da criação de sala e os testes ampliados, está em [AUDITORIA_FUNCIONAL.md](docs/AUDITORIA_FUNCIONAL.md).

A implantação anterior foi verificada em 18/10/2026. Em 19/10, o domínio retornou HTTP 530 / Cloudflare 1033 e a conexão SSH ao Android expirou; o catálogo ainda não foi importado em produção nem a configuração do atualizador remoto foi alterada. O acervo real de 90 questões está no GitHub no commit `633e9f54362f4fd4519d633fa2004858c9c7e8ac`, com CI aprovado. A integração preparada para atualização automática aguarda o Android voltar à rede. Consulte [banco e operação](docs/BANCO_DE_PERGUNTAS.md) e o relatório administrativo para o estado detalhado.

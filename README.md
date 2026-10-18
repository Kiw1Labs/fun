# Fun · Sabe Essa?

Portal de jogos multiplayer em pt-BR. Primeiro jogo: **Sabe Essa?**. O portal e a home do jogo usam `/`; salas usam exatamente quatro letras, por exemplo `/ABCD`.

Implementação com motor autoritativo, HTTP/WebSocket, frontend responsivo claro/escuro e persistência privada. **Produção começa sem desafios.** A interface impede iniciar quando o catálogo não satisfaz composição e histórico. Fixtures artificiais existem somente nos testes, fora do pacote de produção.

## Desenvolvimento no Windows

Checkout confirmado: `C:\Users\eduar\Documents\github\fun`. Requer Python 3.11+ e Node 20+. Os comandos abaixo são PowerShell; usar `npm.cmd` evita depender de mudança da política de scripts do Windows. Se `python` for um alias da Store sem acesso, usar o executável real exibido por `py -0p` para criar o venv. Não modificar credenciais.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm.cmd ci --ignore-scripts
npm.cmd run build
.\.venv\Scripts\python.exe -m fun
```

Abrir **http://127.0.0.1:5050**. O portal tem o botão Sabe Essa?, que abre criar/entrar sem mudar `/`. Compartilhar a URL de quatro letras para outra pessoa entrar. Backend local aceita Origin localhost/127.0.0.1 na porta 5050; para outro endereço, definir `FUN_ORIGINS` explicitamente. O frontend já construído é servido pelo backend no desenvolvimento; produção serve assets no Nginx existente. Não executar múltiplos workers.

No Linux: `.venv/bin/python` no lugar de `.\.venv\Scripts\python.exe`. As variáveis estão em `.env.example`; o supervisor as carrega, mas `python -m fun` não lê `.env` automaticamente. Dados de desenvolvimento ficam em `data/`, ignorado pelo Git.

## Testes e build

```powershell
npm.cmd run check
npm.cmd run build
.\.venv\Scripts\python.exe -m ruff check fun tests tools deploy
.\.venv\Scripts\python.exe -m pytest -q
npx.cmd playwright install chromium
npm.cmd run test:browser
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

O celular foi inspecionado, mas Fun **não foi ativado** devido à carga elevada e ao impacto ainda não validado do reload compartilhado. Nenhum serviço existente foi alterado. DNS Fun resolve; HTTPS Fun respondeu 502, portanto não há declaração de disponibilidade pública. Portas 5050/8082 estavam livres e os serviços antigos responderam. O relatório distingue verificações locais, remotas e pendências.

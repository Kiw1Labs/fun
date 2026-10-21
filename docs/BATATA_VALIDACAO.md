# Batata Quente — validação local de 21/10/2026

## Sincronização do teste que bloqueava a atualização pública

A execução de CI [`39644966559`](https://github.com/Kiw1Labs/fun/actions/runs/39644966559), do commit `caa9b83`, passou nos testes Python e nos 33 cenários gerais de navegador, mas falhou no cenário de Batata Quente: a confirmação da vez no celular era recebida antes da atualização da sílaba no navegador do anfitrião. A comparação imediata lia o estado anterior nessa outra conexão. O atualizador manteve a versão pública antiga por exigir CI aprovado.

O teste agora aguarda explicitamente a troca da sílaba na tela do anfitrião e mantém a comparação e as demais verificações. O cenário corrigido passou localmente em 15,09 s; capturas em `artifacts/batata-browser-1792605999688/`. Backup anterior em `artifacts/batata-public-fix-backup/`. A publicação deve continuar pelo fluxo normal, com CI aprovado e verificações no Android e no domínio público.

## Remoção dos textos e da coluna de ajuda

Removidos, a pedido do usuário, os resumos de vidas/tempos e ciclo de dificuldade do lobby e os blocos completos “Como jogar” e “Passou pela roda”. A mesa ocupa a largura disponível. Alterações restritas à apresentação, à documentação e à remoção de expectativas antigas do teste de navegador.

`npm.cmd run check`, `npm.cmd run build`, `npm.cmd run test:batata` e `git diff --check` passaram. Build de 293.486 bytes sem compressão. O cenário real de navegador verificou partida, queima, reconexão, revanche e oito pessoas em 1440/390/320 px; nenhum erro JavaScript/CSP foi registrado. Evidências em `artifacts/batata-browser-1792603818598/`, com lobby desktop e mesa de oito em 320 px inspecionados visualmente.

A prévia em `http://127.0.0.1:5055` retornou HTTP 200 e serviu os assets com os textos removidos. Backup anterior à alteração em `artifacts/batata-texts-backup-20261021-142922/`. Nenhum processo ou serviço remoto foi alterado.

## Esclarecimento sobre a última pessoa a usar a sílaba

O usuário confirmou o exemplo Ana → Bia → Caio → Dani: se Ana queimar, Dani também usa a sílaba e Ana recebe outra ao voltar. Se Bia também queimar, a referência passa a ser Bia. O motor já realizava a troca nesse ponto; esta revisão explicita o limite na mensagem da tela e na especificação, e amplia os testes para quatro pessoas, inclusive queima na última pessoa do ciclo.

Verificações executadas nesta revisão: **33 testes de Batata Quente passaram em 13,46 s**, com o aviso preexistente Starlette/httpx; `npm.cmd run check`, `npm.cmd run build`, Ruff e `git diff --check` passaram. O cenário real de navegador também passou, sem erros JavaScript/CSP, com evidências em `artifacts/batata-browser-1792602920903/`. A captura de celular com a mensagem completa foi inspecionada. O build tem 296.439 bytes sem compressão.

A prévia `http://127.0.0.1:5055` retornou HTTP 200 e serviu o JavaScript com a mensagem atualizada. Não foi necessário reiniciar o backend. Inventário e backup anteriores à revisão em `artifacts/batata-cycle-anchor-backup-20261021-141307/`. Nenhuma alteração remota foi feita.

## Revisão das regras fixas e do visual

Revisão local sobre `main`, após a integração inicial. Mantém o design compartilhado do Fun e remove os ajustes do lobby. As regras são 3 vidas, aquecimento de 10–30 segundos e piso de passagem de 5 segundos. O ciclo repete 3 voltas fáceis, 1 média, 2 fáceis e 1 difícil. Somente a queima mantém a sigla por uma volta.

| Verificação desta revisão | Resultado |
| --- | --- |
| `npm.cmd run check` e `npm.cmd run build` | Passaram; build de 296.354 bytes sem compressão |
| `.venv/Scripts/python.exe -m ruff check fun tests tools deploy` | Passou |
| Suíte Python completa com `FUN_MEDIA=artifacts/media-batata-rules-full`, `-p no:cacheprovider --basetemp=artifacts/pytest-batata-rules-full` | **200 passaram em 49,90 s**, com o aviso preexistente Starlette/httpx |
| `npm.cmd run test:batata` | Passou; dois contextos independentes, palavras recusadas/válidas, queima, sigla mantida até o retorno, revanche, F5 e transferência de anfitrião |
| Prévia atualizada em `http://127.0.0.1:5055` | `/` HTTP **200**, `/health` saudável e WebSocket autenticado com duas pessoas; primeira volta fácil, 3 vidas e ajustes legados recusados |

Os testes das regras incluem dois ciclos completos de dificuldade, alteração da ordem por eliminação/saída/expulsão, nova queima durante manutenção, reconexão, token novo mesmo com sigla mantida e esgotamento de respostas. O ticker também foi verificado com relógio real, esperando a queima após o mínimo fixo de 10 segundos.

Evidências finais em `artifacts/batata-browser-1792602156527/`, incluindo lobby sem formulário, sigla mantida em desktop/celular e oito pessoas em 1440/390/320 px. Capturas inspecionadas visualmente; nenhum erro JavaScript ou de CSP foi detectado. Registro HTTP/WS da prévia em `artifacts/batata-rules-preview.json`.

Inventário e cópias dos arquivos anteriores em `artifacts/batata-rules-backup/`; o banco isolado da prévia foi copiado com a API de backup SQLite para `preview-before-rules.sqlite3`. Somente o processo identificado como a prévia local na porta 5055 foi reiniciado. Nenhuma alteração remota ou implantação pública foi feita. As fontes anteriores e esse banco permitem reverter a revisão local após encerrar somente a prévia.

## Registro da entrega inicial

Checkout: `C:\Users\eduar\Documents\github\fun`, branch `feat/batata-quente`. Inventário inicial sem mudanças no Git; cópias dos arquivos de implementação anteriores em `artifacts/batata-backup`. Não houve acesso ou alteração no Android, Nginx, túneis, bancos remotos ou serviços de outros projetos.

## Resultados executados

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run check` | JavaScript válido, incluindo Batata Quente |
| `npm.cmd run build` | Aproximadamente 299 kB sem compressão, sem novas dependências de frontend |
| `python -m ruff check fun tests tools deploy` | Passou |
| `python -m pytest -q --basetemp=artifacts/pytest-batata-verified-final` | **193 passaram**, 1 aviso preexistente de depreciação Starlette/httpx; execução final em 42,39 s |
| `npm.cmd run test:batata` | **Passou**: dois contextos independentes, desktop/celular, HTTP/WS reais; oito conexões autenticadas na mesa completa |
| Regressão geral de navegador | Os **33 cenários** passaram; a limpeza posterior foi bloqueada pelo sandbox do Windows. A árvore dos testes foi identificada e encerrada com a permissão efetiva da sessão |
| Regressão repetida com limpeza autorizada | **3 passaram**, saída 0: partida Sabe Essa?, portal/F5/abas/host e salas públicas/privadas |
| `npm.cmd run test:dev` | Passou: configuração, recarga Python e atualização da interface |
| `python -m tools.bundle` | Pacote gerado com dicionário, licenças e assets; teste de preparação/manifesto passou na suíte Python |
| Integridade do dicionário | Hash e quantidade correspondem ao manifesto: 1.670.571 chaves, 49.097.492 bytes de dados/índice em memória |
| Prévia HTTP | `/` retornou **200**, `/health` retornou `status: ok`, em `http://127.0.0.1:5055` |

Os comandos Python foram executados com `.venv/Scripts/python.exe`. A repetição de três cenários usou `node --test --test-name-pattern 'partida sintética em navegador|portal, home em /|página principal:' tests/browser.test.mjs`, `TEMP`/`TMP` em `artifacts/browser-temp` e a permissão de execução necessária para a limpeza dos processos de teste. Nenhuma falha funcional ficou pendente.

## Evidências e limites

Capturas e resultado final: `artifacts/batata-browser-1792598744054/`. Incluem lobby, partida, resultado, listagem pública, roda de oito em 1440/390/320 px e tema claro. Foram inspecionadas visualmente. Não houve erro JavaScript ou violação de CSP durante o cenário final. O teste também reduz o viewport para 390×430, verifica ausência de rolagem horizontal e mantém o campo utilizável; isso não equivale a testar um teclado físico/virtual em um Android real.

O cenário de navegador usa relógio controlado somente no servidor de fixtures. Um teste de integração separado usa **relógio real** e espera a queima publicada pelo ticker sem envio do cliente. Regras de prazo, piso de passagem, expiração única, mensagens duplicadas/atrasadas, eliminação, vencedor, revanche, espectadores, isolamento, transferência de host e reinício também têm testes automatizados.

A prévia usa banco isolado `data/batata-preview.sqlite3` e a porta 5055. O browser embutido não abriu a aba por timeout da ferramenta; a URL continua disponível para abertura manual e o Chromium automatizado foi usado na inspeção. O servidor permanece iniciado para a entrega local solicitada.

Não foi feita implantação pública nem verificação externa HTTPS/WebSocket. Reiniciar o processo cancela partidas ativas sem vencedor e preserva a sala para reconexão. O VERO é amplo e pode recusar flexões fora do subconjunto compilado; fonte, licença e critérios estão em [BATATA_QUENTE.md](BATATA_QUENTE.md).

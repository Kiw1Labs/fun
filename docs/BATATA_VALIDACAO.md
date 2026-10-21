# Batata Quente — validação local de 21/10/2026

## Correção dos pulos pouco visíveis ou desativados

Após o relato de mudança de cor/expressão sem movimento, a sondagem distinguiu animação normal de movimento reduzido: com movimento normal houve variação de poses; com movimento reduzido, uma pose e deslocamento zero. Isso reproduz o sintoma, sem afirmar qual configuração estava ativa no navegador do usuário. O salto anterior também tinha deslocamento pequeno devido à escala do SVG. O deslocamento do pulo passou de 16 para 48 unidades do desenho.

Adicionado o botão “Ativar pulos” / “Pulos ligados”. Por padrão, a sala respeita movimento reduzido; uma escolha explícita pode ativar os pulos nesse modo e fica salva neste navegador, sem alterar o sistema. A cor e a expressão continuam acompanhando o aquecimento em ambos os modos.

`npm.cmd run check`, `npm.cmd run build` e `npm.cmd run test:batata` passaram. Build de 295.615 bytes. O novo teste mede movimento espontâneo na partida por vários quadros, sem posicionar a animação manualmente: mais de dez poses e deslocamento vertical superior a 12/6/3 px em 1440/390/320 px. Também mede movimento após ativação manual com movimento reduzido, persistência após F5 e parada ao desligar. O jogo completo, as quatro expressões e a roda de oito pessoas continuam passando. Evidências finais: `artifacts/batata-browser-1792616965480/`.

Backup anterior em `artifacts/batata-hop-fix-backup/`, sondagem em `artifacts/potato-motion-probe.json` e inventários remotos em `artifacts/batata-hop-fix-before-activation.json` e `artifacts/batata-hop-fix-runtime-before.json`. A publicação segue somente por assets, com CI, backup, rollback e preservação de processo; verificação posterior em `artifacts/batata-hop-fix-preservation.json`.

## Aquecimento animado da batata

Implementada a referência do usuário: inclinação e pulos alternados no mesmo lugar, com cor progressivamente mais queimada, manchas, boca séria, sobrancelhas tensas, olhos semicerrados e suor. O desenho continua em SVG. A aparência usa os prazos autoritativos, não esfria com a extensão de prazo ao passar e reinicia a cada novo aquecimento. A velocidade dos pulos aumenta preservando a fase da animação entre atualizações; a preferência de movimento reduzido cancela os pulos, inclusive quando alterada durante a partida.

`npm.cmd run check`, `npm.cmd run build` e `npm.cmd run test:batata` passaram. Build de 294.407 bytes. Além do jogo completo e da roda de oito pessoas em 1440/390/320 px, o cenário verifica as quatro expressões/cores, olhos semicerrados, inclinação nos dois sentidos, posição fixa do recipiente, calor preservado na extensão de prazo, reinício e movimento reduzido. Capturas e vídeo de prévia em `artifacts/batata-browser-1792615549482/`, incluindo `potato-heat-preview.webm`. Fases tranquila, séria e estressada inspecionadas visualmente.

Backup local anterior em `artifacts/batata-heat-backup/`; inventários remotos em `artifacts/batata-heat-before-activation.json` e `artifacts/batata-heat-runtime-before.json`. Publicação somente de assets, após CI e backup/rollback, com conferência posterior em `artifacts/batata-heat-preservation.json` e teste público em `artifacts/batata-public-*/result.json`.

O primeiro CI da animação passou nos testes Python, nos 33 cenários gerais e nas verificações de expressão/movimento, mas detectou falta de espaço para “MMM” com oito pessoas em 320 px. O recipiente da batata voltou à largura anterior nessa faixa. A correção passou localmente em 19,55 s; evidências finais em `artifacts/batata-browser-1792615860614/`. As verificações de espaço e a composição com letras largas foram mantidas.

## Roda circular e indicação junto ao avatar

A roda usa um raio único nos dois eixos e se adapta à largura disponível. A batata permanece junto à sílaba no centro; a seta tem espaço ao lado do avatar da pessoa da vez, sem girar sobre o conteúdo. Removidos os textos centrais “Sua vez!” e “Vez de …”. O contorno e o estado textual do participante continuam indicando o turno.

`npm.cmd run check`, `npm.cmd run build` e `npm.cmd run test:batata` passaram. A verificação percorreu todas as oito posições de turno em 1440/390/320 px, conferindo círculo, lugares dentro da mesa e ausência de sobreposição da seta com sílaba, batata, avatares, nomes, estados e vidas. A área das letras é medida pelo texto efetivo, sem contar o espaço vazio do título. Build de 289.293 bytes; capturas locais em `artifacts/batata-browser-1792610395637/`, com inspeção visual em desktop e celular. Backup anterior em `artifacts/batata-circle-backup/`.

Inventário anterior à publicação em `artifacts/batata-circle-before-activation.json` e `artifacts/batata-circle-runtime-before.json`. A publicação segue o fluxo de assets com CI aprovado, comparação integral de runtime, backup e rollback, preservando o processo do Fun e os serviços compartilhados. O resultado público fica em `artifacts/batata-public-*/result.json` e a conferência de preservação em `artifacts/batata-circle-preservation.json`.

A primeira execução no CI detectou sobreposição na diagonal direita em 320 px. A seta agora ocupa o lado externo do avatar, alternando seu lado conforme a posição na roda. A correção passou localmente nas oito posições e três larguras; capturas em `artifacts/batata-browser-1792610675960/`. Build final de 289.553 bytes.

A revisão final também reserva o centro no celular: batata e sílaba ficam lado a lado, com escala menor em 320 px. O teste verifica que os cartões não cobrem o centro, usando “MMM” para exercitar letras largas em todas as posições. Essa revisão passou localmente, com build de 289.626 bytes e capturas em `artifacts/batata-browser-1792610824786/`. O CI da correção anterior da seta passou; a revisão final recebe uma nova execução completa antes da publicação.

## Remoção pelo participante e simplificação da mesa

Removidos o texto “Boa de palavra? Mostre na roda.”, o contador visível de voltas/dificuldade e o botão “×” de cada participante. O anfitrião clica na pessoa para abrir o popup de confirmação compartilhado com Sabe Essa?, também acessível por Enter/Espaço. O servidor mantém as mesmas permissões e a progressão de dificuldade.

`npm.cmd run check`, `npm.cmd run build` e `npm.cmd run test:batata` passaram. O cenário verificou abertura por clique, cancelamento sem remoção, ausência do controle para convidados e remoção efetiva por teclado. Também passou a roda com oito pessoas em 1440/390/320 px. Build de 290.874 bytes; capturas de partida e popup desktop/celular em `artifacts/batata-browser-1792609514665/`, inspecionadas visualmente. Backup local em `artifacts/batata-player-popup-backup/`.

O inventário remoto encontrou uma partida com quatro participantes e o backend PID 29047, nascimento 174937419, servindo `/root/fun/current/dist`. A publicação está preparada para trocar somente os assets após CI, backup e comparação integral dos arquivos de runtime, preservando o processo. Baselines em `artifacts/batata-player-popup-before-activation.json` e `artifacts/batata-player-popup-runtime-before.json`; o resultado público será registrado após a ativação.

## Partida sem mensagens auxiliares e sem cronômetro visível

Removidos a dica abaixo da sílaba, o texto de manutenção da sílaba, o aviso textual de perda de vida e o cronômetro com segundos e barra, conforme solicitado. A apresentação deixa de consultar esses elementos; sons e animações continuam recebendo o tempo autoritativo. O relógio do servidor e as regras não foram alterados.

`npm.cmd run check`, `npm.cmd run build` e `npm.cmd run test:batata` passaram. O cenário de navegador continua verificando a perda de vida pelo estado das pessoas e a mesma sílaba após queimar, sem depender dos textos removidos. Build local de 291.447 bytes sem compressão; capturas em `artifacts/batata-browser-1792608641579/`. Backup anterior em `artifacts/batata-clean-game-backup-20261021-155027/`. A publicação desta revisão deve preservar a partida encontrada em andamento, com troca apenas da release de assets após comprovar que o backend é idêntico.

## Publicação verificada

Release `7b839a37cb79599cd5dbe7a8e4f0a3a90fd1953a`, enviada para `main` e ativada pelo atualizador existente em 21/10/2026 às **15:31:03** (America/Sao_Paulo). [CI completo aprovado](https://github.com/Kiw1Labs/fun/actions/runs/39652817748): **207 testes Python**, 33 cenários gerais de navegador, cenário de Batata Quente, servidor de desenvolvimento e catálogo. Nenhuma verificação foi desabilitada.

Às **15:32:43**, o teste de produção confirmou HTTPS 200, os dois cartões de jogo, lista de salas carregada, duas pessoas em contextos independentes desktop/celular via WSS, palavra aceita pelo dicionário, queima publicada pelo ticker real, sílaba mantida após a queima, ausência dos textos removidos e encerramento da sala temporária. Não houve erro JavaScript. Capturas de portal e partida foram inspecionadas visualmente. Resultado e imagens: `artifacts/batata-public-1792607521641/`.

O manifesto da release está íntegro. Os hashes de `auto_update.py`, `services.py`, `nginx-local.conf` e `tunnel.py` compartilhados foram preservados, assim como dez identidades de processos compartilhados, incluindo nascimento do PID. Evidências em `artifacts/batata-public-before-activation.json`, `artifacts/batata-public-inventory-result.json` e `artifacts/batata-public-preservation.json`. As sondagens locais dos outros serviços mantiveram os códigos anteriores.

O auxiliar exclusivo `/root/fun/auto_update.py` recebeu duas atualizações pequenas com backup/rollback, sem reinício de serviços nessa preparação: assets/dicionário e equivalência dos três campos opcionais vazios. A segunda cópia está em `/root/fun/backups/batata-helper-20261021T182619Z/`. O catálogo real passou na comparação antes da ativação, e o novo backend mantém 90 questões ativas. O atualizador fez a troca e o reinício somente do Fun pelo procedimento existente.

## Sincronização do teste que bloqueava a atualização pública

A execução de CI [`39644966559`](https://github.com/Kiw1Labs/fun/actions/runs/39644966559), do commit `caa9b83`, passou nos testes Python e nos 33 cenários gerais de navegador, mas falhou no cenário de Batata Quente: a confirmação da vez no celular era recebida antes da atualização da sílaba no navegador do anfitrião. A comparação imediata lia o estado anterior nessa outra conexão. O atualizador manteve a versão pública antiga por exigir CI aprovado.

O teste agora aguarda explicitamente a troca da sílaba na tela do anfitrião e mantém a comparação e as demais verificações. O cenário corrigido passou localmente em 15,09 s; capturas em `artifacts/batata-browser-1792605999688/`. Backup anterior em `artifacts/batata-public-fix-backup/`. A publicação deve continuar pelo fluxo normal, com CI aprovado e verificações no Android e no domínio público.

A execução seguinte encontrou outra corrida no teste de expulsão de Sabe Essa?: a confirmação era reaberta depois de ficar invisível, antes de terminar o evento nativo `close` do cancelamento anterior. O teste passou a aguardar esse evento, preservando a verificação da expulsão por teclado. O caso isolado corrigido passou localmente. O auxiliar específico do Fun no Android foi atualizado para incluir assets e dicionário do novo jogo, após 14 testes locais de deploy/atualizador; backup e rollback em `/root/fun/backups/batata-helper-20261021T181221Z/`. Nenhum serviço foi reiniciado nessa preparação e os hashes dos arquivos compartilhados foram preservados.

O CI da revisão `722a802` passou. A preparação automática identificou depois um falso conflito no catálogo: o SQLite inclui os campos opcionais `reference`, `submission_id` e `submitted_by`, enquanto o JSON legado os omite. A comparação passa a considerar o padrão vazio desses três campos. Valores preenchidos, campos desconhecidos e edições reais continuam bloqueados. Os 19 testes locais de deploy/atualizador passaram, incluindo os cinco casos que verificam essa distinção e que o banco não é alterado pela comparação.

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

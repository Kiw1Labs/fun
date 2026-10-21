# Batata Quente — validação local de 21/10/2026

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

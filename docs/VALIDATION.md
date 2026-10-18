# Validação executada — 18/10/2026

## Checkout e escopo

Checkout existente em `C:\Users\eduar\Documents\github\fun`, branch `main`, origin `https://github.com/Kiw1Labs/fun.git`. No início não havia commits nem código, apenas documentos não rastreados. Foram lidos integralmente AGENTS, PRODUCT_SPEC, ARCHITECTURE e CODEX_KICKOFF. Os documentos originais foram preservados; o README inicial está em `docs/STARTER_README.md`.

O sandbox de escrita da sessão apontava para o checkout administrativo vizinho. A implementação foi preparada e testada em staging privado desse workspace e consolidada no checkout Fun com permissão de escrita específica, preservando os arquivos iniciais. Nenhuma credencial foi alterada.

## Testes locais efetivamente executados

| Verificação | Resultado |
|---|---|
| `python -m pytest -q` | 43 testes passaram, motor/HTTP/WS/concorrência/backup/release/plano Nginx |
| `python -m ruff check fun tests tools deploy` | Passou |
| `npm.cmd run check` | Sintaxe JavaScript passou |
| `npm.cmd run build` | Build passou; 23.727 bytes de HTML/CSS/JS sem compressão |
| `npm.cmd run test:browser` | 2 cenários Chromium passaram, desktop 1440/1366 e móvel 390 px |
| `python -m tools.live_check` | 16 pessoas, 15 competidores + 1 espectador, HTTP/WS TCP reais; passou |
| `python -m pip_audit -r requirements.txt` | Nenhuma vulnerabilidade conhecida reportada |
| `python -m pip check` | Nenhuma dependência quebrada |
| `npm.cmd audit --omit=dev` | Zero vulnerabilidades; frontend não tem dependências de produção |
| `python -m tools.bundle` e testes de pacote | Manifesto validado; sem catálogo, sessões, tokens, fixtures ou credenciais |

Os testes verificam 15 rodadas, 20 segundos e limite exato, arredondamento 0,5 para cima, cooldown 0,5 s, aliases sem fuzzy, composições simultâneas e três partidas de histórico. Cobrem sessões reservadas por 60 s, múltiplas abas, F5, abandono, expulsão, espectador, empate, placar inclusivo sem colocação para removidos, transferência imediata/60 s, fechamento em todas as fases, sala vazia 5 min e aviso 30+2 min. Casos concorrentes disputam a última vaga e repetem start/resposta em duas abas. Respostas/aliases/tokens privados não aparecem antes da revelação. Mensagens inválidas e origens não autorizadas são recusadas.

O teste visual confirmou nome contendo marcação tratado como texto, ausência de rolagem horizontal em 390 px, navegação móvel, temas, ausência de controles de host no convidado e confirmação de encerramento. A rodada sintética verifica erro/cooldown, acerto, recarga do convidado e revelação. Screenshots ficam em `artifacts/`, ignorado pelo Git. Não foi executada auditoria formal de leitor de tela, navegadores Safari/Firefox ou teste de acessibilidade automatizado completo.

## Recursos medidos no PC Windows

Ensaio curto do processo ASGI com 15 competidores e 1 espectador, dados artificiais e banco temporário: RSS ocioso **36,35 MiB**, após eventos **39,98 MiB**; **0,469 s de CPU** durante **0,691 s de cenário**. A janela é curta e não representa carga sustentada. Latência mediana para resposta **mais reenvio duplicado**: **169,77 ms**, máximo **197,88 ms**, com 15 envios concorrentes. Cancelamento imediato com espectador conectado e retomada com score preservado passaram.

Microbenchmark de 100 amostras com tracemalloc ligado: manutenção + 16 snapshots, mediana **2,792 ms**, p95 **5,352 ms**, pico de alocações Python rastreadas **0,351 MiB**. Esse pico não equivale ao RSS. Nenhuma dessas métricas é medição do Fun no ARM.

## Inventário e verificações remotas

SSH `kiwiki` funcionou sem modificar autenticação. Android Linux ARMv8l/32 bits; Debian confirmou Python **3.11.2** e Nginx **1.22.1**. **8 CPUs** reportadas. Uptime aproximadamente 17 dias. Memória total **3.790 MiB**, disponível cerca de **2.000 MiB**, swap usada **356 MiB** de 2.047. Disco do usuário **97 GiB disponíveis** de 110 GiB. Load average inicial **25,47 / 25,82 / 26,13**, posterior **26,15 / 25,96 / 25,97**; não se atribuiu essa carga a um processo específico.

| Endereço/porta | Resultado observado |
|---|---|
| `127.0.0.1:5000` Flask | TCP aberto, HTTP 200 |
| `127.0.0.1:8000` Django | TCP aberto, HTTP 200 |
| `127.0.0.1:8080` Nginx antigo | TCP aberto, HTTP 200 |
| `127.0.0.1:8081` Nginx antigo | TCP aberto, HTTP 200 |
| `127.0.0.1:5432` PostgreSQL | TCP aberto; nenhum dado ou credencial consultado |
| `127.0.0.1:5050`, `:8082` | Conexão recusada: livres no inventário, não reservadas |
| `https://larp.kw1.com.br/` | HTTPS 200 |
| `https://serv.kw1.com.br/` | HTTPS 302 |
| `https://fun.kw1.com.br/` | DNS Cloudflare resolveu; HTTPS 502 |

O master ativo é `/kiwiki-infra/nginx-local.conf`, não `/etc/nginx/sites-enabled`. Template `deploy/nginx-fun.conf` foi validado **no Debian real** via `nginx -t`, dentro de um wrapper temporário: saída 0, sintaxe OK. Não abriu porta, não iniciou worker e não alterou configuração ativa. O teste da configuração combinada com a ativa ainda depende da release instalada e do plano de ativação.

`ss` foi limitado pelo Android (`Cannot open netlink socket`); a verificação de portas foi feita por conexão TCP e HTTP. Diretórios Termux runit contêm cloudflared/postgres/SSH, mas `sv status` do cloudflared não encontrou `supervise/ok`; isso não comprova supervisão runit ativa. O túnel está atendendo os sites públicos, e seu gerenciamento exato precisa ser confirmado antes de registrar outro serviço. Não foram lidos tokens de túnel, senhas, chaves ou configurações de autenticação.

## Falhas encontradas e corrigidas

O primeiro teste revelou transferência incorreta do host com timestamps iguais; o motor passou a usar ordem crescente de entrada. A atualização de Starlette removeu um decorator antigo; a integração foi adaptada e retestada. Um teste continha nome de 25 caracteres e foi corrigido para respeitar o limite de 24. A limpeza de filhos Python no Windows exigiu encerrar a árvore exclusiva do teste; os cenários finais encerraram sem processos persistentes. Chamadas de rede limitadas pelo sandbox foram repetidas com permissão específica. Resta um aviso de depreciação do TestClient por usar `httpx`; não afeta runtime ou resultados.

## Pendências reais

- Nenhuma implantação ativa no celular, reload Nginx, alteração Cloudflare ou instalação de dependência remota foi feita. Carga elevada e supervisão proot ainda não ensaiada impedem confirmar segurança operacional.
- Confirmar a margem de CPU, `venv/ensurepip` Debian, sinalização/parada do supervisor e medir RSS/CPU ARM do Fun em ensaio isolado antes de ativar.
- Após isso, revisar o candidato e obter confirmação para reload do Nginx compartilhado. Procedimento, backup e rollback estão em `docs/DEPLOY.md`.
- Confirmar manualmente no túnel existente o ingresso `fun.kw1.com.br → http://127.0.0.1:8082`, somente depois da origem saudável. O 502 atual não prova esse alvo. Não há credencial de gerenciamento Cloudflare exposta nesta sessão.
- HTTPS/WSS Fun de ponta a ponta e regressão dos sites antigos após ativação estão pendentes. Sem catálogo editorial adequado, a partida pública permanecerá bloqueada por projeto.
- CI foi versionado, mas sua execução no GitHub só pode ser verificada após push. Artefatos e ambiente de desenvolvimento local não são versionados.

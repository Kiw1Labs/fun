# Implantação aditiva no Kiwiki Lab

**Estado atual, 19/10/2026, 12:17 UTC:** catálogo ativo no Android e em `https://fun.kw1.com.br/`. A release funcional `4a4f72b` passou no CI, no ensaio isolado ARM e na partida pública completa: 15 rodadas, duas sessões desktop/celular, imagens, respostas, pontos, créditos, F5 e WSS. O SQLite de produção contém 90 perguntas ativas e 48 imagens locais verificadas; integridade `ok`. Fun foi integrado ao updater existente, com 300 segundos de espera após cada ciclo e exigência de CI verde. Flask/Django/Nginx continuam saudáveis, com os mesmos processos. Ver [operação do catálogo e atualizador](BANCO_DE_PERGUNTAS.md). As seções seguintes descrevem o procedimento e os inventários históricos, anteriores à ativação.

Inventário anterior à ativação em 18/10/2026: **preparado, não ativado**. Portas 5050/8082 livres no inventário; reconfirmar imediatamente antes da ativação. O celular estava com load average aproximadamente 25 para a máquina toda. Não se comprovou margem segura de CPU; nenhum pacote foi instalado, serviço iniciado, configuração ativa alterada ou reload executado no celular.

O master confirmado é `nginx -c /kiwiki-infra/nginx-local.conf -g 'daemon off;'` dentro do Debian, com o bind Termux `$HOME/kiwiki-infra:/kiwiki-infra`. Os arquivos `/etc/nginx/sites-enabled/*` são informativos e **não** são o ponto de ativação deste master. Há cloudflared e PostgreSQL já em execução. Os scripts administrativos existentes mostram supervisão Python (`infra_controller.py` e supervisor de túnel com PID+nascimento); o diretório runit existe, mas `sv status` não comprovou runit ativo. Não criar outro túnel, proxy ou banco global.

## Pacote no PC

No checkout, execute build, lint e testes. Gere `artifacts/fun-release.tar.gz` com `python -m tools.bundle`. O pacote inclui manifesto SHA-256 de cada arquivo. Baixe dependências com `python -m pip download -r requirements.lock --dest artifacts/wheels`; todos os wheels são Python universais, sem compilação de extensões no ARM. Não enviar o ambiente virtual Windows ao Linux.

Transfira somente o pacote e wheels por SSH/SCP usando o alias existente para um diretório novo e privado do Termux. Use `proot-distro login --minimal --bind <diretório-termux>:/fun-incoming debian` para acessar os arquivos, sem alterar binds de outros serviços. Dentro do Debian, execute o preparador recebido do próprio pacote revisado:

```sh
python3 prepare_release.py /fun-incoming/fun-release.tar.gz COMMIT_HEX --base /root/fun
python3 -m venv /root/fun/venv
/root/fun/venv/bin/python -m pip install --no-index --find-links /fun-incoming/wheels -r /root/fun/releases/COMMIT_HEX/requirements.lock
```

Não recriar venv se já existir: revisar sua versão e testar em outro venv se necessário. Debian confirmou Python 3.11.2; `venv`/`ensurepip` não foram instalados nem validados no aparelho. Se faltarem, parar esta etapa e avaliar o pacote específico, sem atualizar o sistema inteiro.

O preparador cria apenas uma release nova, diretórios privados e `.env` a partir do template. Recusa sobrescrever uma release. Não cria `current` nem altera Nginx. Valide as permissões: diretórios privados `0700`, `.env`, catálogo, banco e backups `0600`; arquivos de código e build legíveis pelo usuário do backend. O Nginx ativo usa identidade Debian root/proot; se o worker mudar de usuário, dar leitura/travessia somente aos assets e mídia por grupo dedicado, nunca a banco ou catálogo.

## Ativação, somente após capacidade e impacto revisados

1. Verificar novamente `uptime`, `free -m`, processos, portas e HTTP em 5000/8000/8080/8081. Guardar status e métricas. Preparar backup do `.env`, catálogo, supervisor e Nginx ativo em diretório `0700`. Para banco Fun existente: `python -m tools.backup ORIGEM DESTINO_NOVO`. Não copiar apenas o `.sqlite3` quando WAL estiver ativo.
2. Revisar `shared/fun.env`; manter `FUN_ORIGINS=https://fun.kw1.com.br`, porta 5050 e caminhos isolados. Não versionar esse arquivo. Criar symlink temporário `current-next` para a release e fazer troca atômica com `mv -T current-next current`, preservando o destino anterior para rollback. Recusar substituir um `current` que não seja symlink.
3. Preferir `deploy/fun_service.py` no Termux como adapter para o controlador Python existente. A CLI `status/start/stop` usa lock, PID+nascimento, marcador exato e grupo exclusivo proot; recusa iniciar se 5050 já estiver ocupada e não envia SIGKILL. Não há outro loop supervisor no adapter. Antes de integrar sua chamada ao controlador existente, testar start/saúde/stop isolados e preparar o diff e backup do controlador; **essa integração requer confirmação** porque altera supervisão compartilhada. `FUN_LOG` ativa rotação no próprio backend (5 backups de 1 MB), e o adapter limita o log de lançamento a duas versões de 1 MB. Alternativa somente se runit já for comprovado ativo: copiar `deploy/runit/fun` para um diretório novo, inicialmente com `down`, tornando os scripts executáveis e copiando `log-config` para `$HOME/fun-logs/config`. Não ativar ambos. O encaminhamento de sinais proot não foi ensaiado no aparelho; permanece pendente.
4. Só após essa revisão, retirar `down` e subir **apenas Fun**. Testar `curl http://127.0.0.1:5050/health`, criar duas sessões sintéticas descartáveis via HTTP e testar o upgrade WebSocket com Origin correto, sem catálogo definitivo. Medir RSS/CPU reais antes e depois. Não manter fixtures no servidor público.
5. Com o bind `/kiwiki-infra` existente, executar `python deploy/plan_nginx.py /kiwiki-infra/nginx-local.conf /root/fun/backups/PLANO_NOVO`. Isso cria backup, hash e candidato com um único `include` no bloco `http`. Comparar `diff -u` e verificar que os hosts/rotas antigos permanecem byte a byte. Testar `nginx -t -c /root/fun/backups/PLANO_NOVO/nginx-candidate.conf`. Se a configuração original mudou desde o backup, gerar novo plano; não aplicar um candidato antigo.
6. **Pedir confirmação antes de substituir a configuração e recarregar o master compartilhado.** Esta exigência vem da missão e do risco de afetar os serviços existentes. Após aprovação, copiar candidato para o caminho ativo, rodar `nginx -t -c /kiwiki-infra/nginx-local.conf` e então `nginx -s reload -c /kiwiki-infra/nginx-local.conf`. Não executar restart/kill do Nginx, cloudflared, banco ou SSH.
7. Testar `curl -H 'Host: fun.kw1.com.br' http://127.0.0.1:8082/health`, `/`, assets e `/{QUATRO_LETRAS}`; testar WS através de 8082 com Origin `https://fun.kw1.com.br`. Host diferente deve receber 421. Repetir baselines antigos 5000/8000/8080/8081 e HTTPS de larp/serv; só prosseguir se preservados.

## Cloudflare e verificação pública

DNS de `fun.kw1.com.br` já resolveu para Cloudflare e HTTPS respondeu **502** no inventário. Isso não comprova o alvo do ingresso. Não foi encontrada credencial de gerenciamento autorizada; nenhuma foi procurada em arquivos privados. Depois de a origem 8082 estar saudável, a menor ação manual é conferir no túnel existente **Published application → fun.kw1.com.br → http://127.0.0.1:8082**. Se já estiver assim, não alterar nada. Manter Host `fun.kw1.com.br`; não editar entradas larp/serv. Não criar outro túnel.

Verificar publicamente `/`, `/health`, um asset, F5 em sala, conexão WSS, duas sessões e reconexão. Um HTTP 200 sozinho não comprova WS. Registrar respostas, latência e RSS, sem tokens ou dados pessoais. O teste real de HTTPS/WSS Fun está pendente até ativação e rota verificadas.

## Rollback

Se Fun falhar, manter o resto em execução. Desabilitar apenas a nova rota Fun se necessário; não alterar rotas antigas. Voltar `current` atomicamente ao symlink anterior e reiniciar somente Fun após verificar que o grupo antigo parou e 5050 foi liberada. Reiniciar cancela a partida sem vencedor e preserva histórico/pontos. Para primeira implantação, manter o serviço `fun` em `down` e parado. Não excluir release ou dados.

Se houver regressão Nginx, restaurar o backup privado do arquivo ativo, validar `nginx -t` e fazer reload do mesmo master, após confirmação. Não reiniciar todo o servidor. Banco só deve ser restaurado com Fun parado e backup atual preservado; não fazer downgrade de esquema automaticamente. Este MVP não modifica bancos dos outros sistemas.

Não há limpeza automática destrutiva de releases, backups ou catálogos. A expiração de salas apaga apenas as linhas efêmeras do banco exclusivo Fun. Um reload Nginx e a supervisão proot precisam de ensaio operacional antes de serem declarados validados.

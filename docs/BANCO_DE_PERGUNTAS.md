# Banco de perguntas do Sabe Essa?

## Acervo inicial e regras

Preparado em 18–19/10/2026 por solicitação expressa do usuário, que substitui a
restrição inicial de trabalhar somente com fixtures. São **90 perguntas ativas**,
**48 imagens locais** e **42 textos originais** em português brasileiro. Música
usa pistas factuais originais: nenhuma letra, gravação ou prévia de streaming.

| Categoria interna | Perguntas |
|---|---:|
| TV e entretenimento | 15 |
| Memes e internet | 15 |
| Games | 15 |
| Música | 15 |
| Cinema e séries | 15 |
| Cultura e nostalgia | 15 |

| Dificuldade | Imagem | Texto | Total |
|---|---:|---:|---:|
| Fácil | 24 | 18 | 42 |
| Médio | 18 | 12 | 30 |
| Difícil | 6 | 12 | 18 |
| Total | 48 | 42 | 90 |

Os seis `set_id` iniciais servem à revisão: cada um contém 15 questões (imagem
4/3/1, texto 3/2/2 por dificuldade). A partida sorteia no acervo geral, sem
vinculação a conjuntos ou seleção de categorias na interface. O seletor prefere
essa composição conjunta quando disponível e mantém a busca exata para outras
distribuições válidas. Preserva alternância, 20 segundos, 7/5/3 dificuldades,
histórico das três partidas e todas as regras multiplayer existentes.

## Persistência e privacidade

Reutiliza o **mesmo SQLite** das salas (`FUN_DATABASE`); não há outro serviço nem
banco. A migração aditiva 1, `private_question_catalog`, cria `questions(id,data)`
e `schema_migrations`, sem apagar ou recriar salas. `Store` aplica a migração
idempotente ao abrir o banco. O catálogo persistido é carregado no início do
backend. O fallback JSON antigo continua disponível somente para banco sem
questões; desativar todas as questões não ressuscita o fallback.

`content/questions/catalog.json` é o catálogo editorial privado, versionado.
Contém resposta principal e aliases explícitos, categoria/subcategoria,
dificuldade, formato, fontes, créditos, hash e status. `seeds.json` contém as
decisões editoriais e `provenance.json` guarda autoria, arquivo original, URL
real de download, licença, revisão Commons, hashes e transformação de cada mídia.
`media-selection.json` fixa os nomes exatos dos arquivos revisados.

O navegador recebe somente id, formato, enunciado e caminho opaco da imagem
durante a pergunta. Resposta e créditos aparecem **após revelação**. Fontes e
créditos ficam acessíveis no diálogo Créditos durante a sessão. Banco, catálogo,
proveniência e ferramentas não têm rota pública. Aliases usam apenas a
normalização existente (caixa, acentos, espaços e pontuação); não há fuzzy/IA.

## Mídias, fontes e direitos

As 48 imagens publicadas estão em `media/questions/m_<hash>.webp`: **2.414.886
bytes**, maior arquivo **148.578 bytes**, até 800 px, proporção preservada e
metadados EXIF removidos. Processamento ocorre no PC com Pillow; o runtime não
instala Pillow, não busca conteúdo externo e não processa imagens nas partidas.
O importador copia os arquivos para `FUN_MEDIA/questions/`, verificando hash.
Nenhuma imagem de uma rodada depende de servidor externo.

Identidade/fatos foram pesquisados nas referências Wikipedia/Wikimedia de cada
registro e, para Pense Bem, na cronologia oficial da Tectoy. A descrição e a
licença de cada arquivo Commons foram consultadas via API; os arquivos finais
foram inspecionados visualmente. Licenças do acervo visual:

| Licença registrada | Arquivos |
|---|---:|
| CC BY 2.0 | 11 |
| CC BY 3.0 | 4 |
| CC BY 3.0 br | 2 |
| CC BY-SA 2.0 | 7 |
| CC BY-SA 3.0 | 4 |
| CC BY-SA 4.0 | 6 |
| CC0 | 1 |
| Public domain | 13 |

Os créditos individuais incluem autor, título, licença, fonte e mudanças;
derivadas BY-SA mantêm a licença correspondente. Domínio público/CC0 têm suas
declarações individuais registradas no manifesto. Não se presumiu licença pela
busca no Google. Imagens de memes protegidos foram substituídas por pistas
textuais originais; fotos de hardware são fotografias próprias licenciadas,
sem extração de imagens de jogos. Ilustrações clássicas de Alice, Pinóquio e
Sherlock têm proveniência de domínio público; não usam versões de estúdios.

O único logotipo é o globo da Wikipedia, CC BY-SA 3.0. Seu uso referencial em um
desafio segue a seção 3.6.3 da [política de marcas da Wikimedia](https://foundation.wikimedia.org/wiki/Policy:Trademark_policy),
com aviso de ausência de afiliação/endosso. Nenhuma marca compõe a identidade do jogo.
Ver também [reutilização Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)
e os links específicos de licença de cada registro. O relatório de alternativas
descartadas está em `content/questions/rejections.json`; nenhuma pendência de
revisão integra as 90 ativas. Revisar direitos novamente ao trocar qualquer arquivo.

## Comandos existentes

No checkout, com dependências instaladas, usar `.venv/bin/python` no Linux e
`.\.venv\Scripts\python.exe` no Windows em lugar de `python`. Exemplos:

```sh
python -m tools.validate_catalog content/questions/catalog.json --media-root media --report artifacts/catalog-validation.json
# Antes de importar em um banco existente, escolher um destino NOVO de backup:
python -m tools.backup data/fun.sqlite3 artifacts/backups/fun-ANTES.sqlite3
python -m tools.import_catalog content/questions/catalog.json --database data/fun.sqlite3 --media-root media --media-destination data/media --report artifacts/import.json
# Repetir importação: inserted=0, updated=0, unchanged=90 no acervo inicial.
python -m pytest -q
python -m ruff check fun tests tools deploy
npm run build
npm run test:browser
npm run test:catalog
python -m tools.bundle
python -m tools.bundle_content
```

Não executar o backup se o banco ainda não existir. Backup usa SQLite Online
Backup, inclui WAL e verifica integridade. O importador valida tudo antes de
abrir o banco; faz upsert por ID, preserva registros ausentes do arquivo e as
salas existentes. Não remove arquivos antigos e recusa sobrescrever imagem com
hash divergente. Importar com Fun parado ou em manutenção e reiniciar **somente
Fun** para carregar a nova revisão. Uma reinicialização cancela partida ativa
conforme a regra já existente; não restaura um dump sobre dados novos.

Os testes reais incluem quatro partidas completas com 60 IDs distintos,
conferência de aliases, respostas erradas/cooldown, pontos e privacidade;
100 sementes × 8 seleções de partida; decodificação das 48 imagens; API e
importação duplicada preservando salas; e uma partida de 15 rodadas com dois
navegadores desktop/celular. `npm run test:catalog` usa porta isolada 15056 e
relógio de teste que não integra o pacote de produção. Testes antigos continuam
usando fixtures sintéticas exclusivamente isoladas.

## Acrescentar, revisar ou desativar

1. Escolher um ID novo e estável; não reciclar IDs para contornar o histórico.
   Pesquisar fonte verificável, redigir pista original e revisar aliases e dificuldade.
2. Para imagem, confirmar autoria/licença e permissão de redistribuição, escolher
   o arquivo exato em `media-selection.json` e registrar qualquer restrição.
3. Acrescentar o seed com `verification_note` e `set_id` de expansão; então usar
   no PC `python -m tools.research_content --ids ID`, `python -m tools.prepare_media`
   e `python -m tools.compile_catalog`. A compilação exige evidências pesquisadas;
   não transforma candidatos em conteúdo automaticamente confiável. A revisão
   factual/visual/licença é editorial, feita na preparação, nunca por IA na partida.
4. Conferir `provenance.json`, as imagens e o catálogo. Executar validação,
   testes e importação. O auditor rejeita respostas principais/imagens duplicadas
   e informa pares de textos com sobreposição de palavras ≥80% para revisão.
5. Corrigir resposta/aliases mantendo ID; para retirar conteúdo, alterar `status`
   para `inactive`, `draft` ou `review`, reimportar e reiniciar Fun. Somente
   `active` pode ser sorteado. Reexecutar os testes de disponibilidade: desativar
   itens pode reduzir a capacidade exigida para quatro partidas consecutivas.

Os JSON versionados e as mídias são suficientes para importação offline. A
pesquisa pode ser repetida com internet; os caches em `artifacts/research/` não
são necessários no celular. `requirements-content.txt` instala Pillow apenas
para preparação. O relatório do auditor e da importação vai para `artifacts/`.

## Atualização automática no Kiwiki Lab

`deploy/auto_update.py` implementa o helper para o atualizador compartilhado,
sem criar outro daemon. **Instalado e verificado em 19/10/2026:** o worker ativo
inclui Codex, Kiwiki e Fun, com 300 segundos de espera após cada ciclo. O acesso
ao Android foi restabelecido, e a release funcional `4a4f72b` foi ativada às
12:13:51 UTC, após CI verde e ensaio isolado no aparelho.

O perfil consulta `main` no GitHub e só prepara um SHA que
tenha execução **push** bem-sucedida de `.github/workflows/ci.yml`.

O helper usa release imutável e build estático por hash sem Node, valida catálogo
e mídia offline, testa importação em cópia consistente do banco e inicia um
backend temporário em 15057. A ativação faz backup consistente do banco e do
ambiente, para somente Fun, importa conteúdo, troca `current` atomicamente,
reinicia Fun e verifica backend5050 e Nginx8082. Falha retorna à release anterior,
preservando banco e mídias; o SHA que falhou fica bloqueado para revisão. Não
altera SSH, túneis, credenciais ou configuração compartilhada de Nginx.

O fluxo foi executado no Android: helper instalado em `/root/fun/auto_update.py`,
backup SQLite/ambiente em
`~/kiwiki-infra/backups/deployment-fun-20261019T121335Z/` e 90 questões ativas no
SQLite real, com integridade `ok` e conteúdo igual ao catálogo da release.
As 48 mídias copiadas conferem com os hashes. A conferência pública terminou
às 12:17:55 UTC: 15 rodadas completas, duas pessoas em desktop/celular, 8 imagens,
7 textos, 7/5/3 dificuldades, quatro conexões WSS, reconexão por F5, pontos e
créditos aprovados. Nenhum erro JavaScript da aplicação. A sala privada de teste
foi encerrada. Backend e proxy informam `api_version=2` e `catalog_count=90`.
Os processos de PostgreSQL, Agent, Django, Flask e Nginx foram preservados;
LARP público retornou 200 e Serv manteve o redirecionamento 302 do Access.

A primeira instalação exigiu duas correções cobertas por dez testes do helper:
aceitar banco legado ainda sem a tabela `questions`, sem migrá-lo durante a
checagem de conflitos, e aceitar somente a diferença CRLF/LF do lockfile da
release inicial Windows. Mudanças reais de dependências continuam bloqueadas.

Mudanças de `requirements.lock`, configuração Nginx, esquema do catálogo ou
edições locais conflitantes são bloqueadas para revisão. Não há instalação
automática de novas dependências nem limpeza de releases/backups. Após
instalação, o estado fica em `~/kiwiki-infra/run/fun-autoupdate.json`;
heartbeat/intervalo em `~/kiwiki-infra/run/auto-update-heartbeat.json`; log
rotativo em `~/kiwiki-infra/logs/auto-update.log`. Estado final conferido:
`current`, sem erro, journal `complete`, sem flags de manutenção/pausa. Ver
`docs/DEPLOY.md` para a infraestrutura.

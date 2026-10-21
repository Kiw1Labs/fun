# Batata Quente

Segundo jogo do Fun, integrado ao portal `/` e às salas de quatro letras. Publicado em [fun.kw1.com.br](https://fun.kw1.com.br/) em 21/10/2026, com verificação pública concluída às 15:32:43 (America/Sao_Paulo). O pedido desta versão amplia o escopo anterior de um único jogo; as regras de Sabe Essa? continuam próprias daquele jogo.

Resultados reais, comandos e evidências em [BATATA_VALIDACAO.md](BATATA_VALIDACAO.md).

Revisão visual solicitada em 21/10/2026: manter o mesmo design dos outros jogos do Fun. Portal, sala, formulários, botões e cronômetro usam a paleta neutra, a tipografia, as bordas e os temas claro/escuro compartilhados. A batata e a roda permanecem elementos próprios da partida.

Revisão seguinte de 21/10/2026: removidos da partida a dica abaixo da sílaba, a explicação de manutenção da sílaba, a mensagem textual de perda de vida e o cronômetro visível, incluindo segundos e barra. O servidor continua controlando o tempo e publicando as queimas; vidas, turno, sons e animações continuam funcionando.

Nova revisão de 21/10/2026: removidos o texto “Boa de palavra? Mostre na roda.” e o contador de voltas/dificuldade. O anfitrião abre a confirmação de remoção clicando no participante, ou usando Enter/Espaço com o foco nele. A roda não tem mais botões “×”; cancelar o popup mantém a pessoa na sala.

Revisão da roda em 21/10/2026: círculo com raio único para os dois eixos, adaptado à largura disponível. A batata e a sílaba ficam no centro; a seta fica ao lado do avatar de quem está jogando, com espaço próprio. Removidos “Sua vez!” e “Vez de …” do centro. O contorno e o texto “Está com a batata” na pessoa continuam identificando o turno. O teste de navegador percorre as oito posições em 1440/390/320 px, verificando círculo, lugares dentro da mesa e seta sem sobreposição.

## Jogar e desenvolver

Execute `npm.cmd run dev` e abra `http://127.0.0.1:5050`. Escolha **Batata Quente**, mantenha a sala privada, clique **Jogar** e informe seu apelido se ainda não houver um salvo. Compartilhe o link ou código. Outra pessoa deve entrar em um navegador ou perfil independente; abas do mesmo navegador retomam a mesma identidade.

O anfitrião inicia a partida com 2 a 8 pessoas. As regras são fixas: 3 vidas, aquecimento aleatório inteiro entre 10 e 30 segundos e garantia de 5 segundos ao passar. A dificuldade começa fácil e segue automaticamente o ciclo de voltas abaixo. A pedido do usuário, o lobby não exibe os resumos de vidas/tempos e dificuldade, nem formulário de ajustes. Os blocos “Como jogar” e “Passou pela roda” foram removidos da interface; a mesa ocupa a largura disponível. A interface indica o turno por texto, contorno, seta e posição da batata. O campo aceita Enter. O som pode ser silenciado, com preferência salva no navegador; os sons são sintetizados localmente após interação do usuário. Animações respeitam movimento reduzido.

Para acesso pela rede local, o processo precisa escutar na interface autorizada, com `FUN_ORIGINS` contendo a origem exata. O launcher padrão escuta somente em loopback. Não expor portas de desenvolvimento ou habilitar origens genéricas em produção.

## Regras confirmadas

- O servidor define ordem, trecho (sigla), vidas, prazo, volta, dificuldade e vencedor. Cada palavra válida avança ao próximo jogador elegível. O trecho muda na passagem, exceto durante a volta de manutenção após uma queima.
- O ciclo automático é **3 voltas fáceis → 1 média → 2 fáceis → 1 difícil**, repetindo desde as 3 fáceis. A volta e a dificuldade são controladas pelo servidor, sem contador visível.
- O prazo do aquecimento é compartilhado: passa junto com a batata. Se faltarem menos de 5 segundos, o padrão garante 5 segundos à próxima pessoa.
- Palavra inválida informa o motivo e mantém o turno e o prazo. A palavra precisa existir nesta edição do dicionário e conter o trecho contínuo, em qualquer posição.
- Letras maiúsculas, acentos e cedilha são equivalentes: `Braço` e `braco` contam como a mesma palavra. Não há correção aproximada. Uma palavra normalizada não pode se repetir na partida.
- Na expiração, somente a pessoa da vez perde uma vida. O servidor avança e sorteia um aquecimento novo. **Só quando a batata queima**, a mesma sílaba segue até a pessoa anterior à que queimou, **incluindo a vez dela**; quem queimou recebe outra ao retornar. Exemplo confirmado: Ana → Bia → Caio → Dani; se Ana queimar, Bia, Caio e Dani usam a mesma sílaba, e Ana recebe outra. Se Bia também queimar, a referência passa a ser Bia: Caio, Dani e Ana usam a mesma sílaba, e Bia recebe outra ao voltar. Palavra recusada mantém o turno e não inicia essa manutenção. Zero vidas elimina; a pessoa continua assistindo. A última pessoa com vidas vence.
- O anfitrião pode iniciar outra partida ou retornar todos ao lobby. A revanche restaura 3 vidas, zera palavras e histórico e recomeça na primeira volta fácil.

## Decisões técnicas desta versão

- Reutilizamos Python/Starlette, WebSockets nativos e frontend JavaScript do Fun. Não adicionamos Socket.IO, React, processos, bibliotecas nativas ou serviços de validação externos.
- O limite de oito inclui quem acompanha. Entrada após o início ocupa vaga de espectador, sem receber vidas; a pessoa pode jogar a próxima partida. Somente participantes conectados no início entram na ordem de jogo.
- Desconexão reserva a identidade e a vaga por 60 segundos. O relógio continua e a pessoa desconectada pode perder vidas até a reconexão ou abandono. Todas as pessoas ainda elegíveis desconectadas cancelam imediatamente, sem vencedor. Saída definitiva ou expulsão pode dar vitória por permanência.
- O anfitrião que sai transfere a função imediatamente à pessoa conectada mais antiga; desconexão involuntária aguarda 60 segundos. Fechar sala exige confirmação no navegador e cancela a partida.
- Salas vazias expiram em 5 minutos; lobby/resultados têm aviso após 30 minutos mais 2 minutos para confirmar presença. Uma partida ativa não expira por inatividade.
- O motor síncrono fica separado do adaptador HTTP/WS e todas as mutações passam pelo mesmo lock. Eventos têm identidade e resposta idempotente; o turno tem token novo a cada passagem/queima. Envio tardio ou referente a um turno anterior é rejeitado. Duas abas não podem passar duas vezes com o mesmo turno.
- O Fun já persiste snapshots em SQLite exclusivo. Reiniciar o processo **encerra a partida sem vencedor**, preservando a sala e abrindo nova janela de reconexão. A partida interrompida não é retomada. Usar exatamente um worker.
- Uma volta termina quando todas as pessoas ainda elegíveis naquela volta concluíram sua vez por palavra válida, queima ou saída definitiva. Palavra recusada não conta; espectadores e eliminados não entram nas próximas voltas. A desconexão temporária mantém a pessoa na ordem durante a janela de reconexão.
- Se a pessoa de referência for eliminada ou sair, a sigla permanece até todas as outras pessoas elegíveis concluírem uma vez. Essa decisão cobre os casos em que a vez não pode retornar à pessoa original.
- O token de turno muda mesmo com a sigla mantida. Se todas as palavras disponíveis dessa sigla já tiverem sido usadas, a manutenção termina antes da volta para evitar um turno impossível.
- Ajustes enviados por clientes antigos são recusados. Salas persistidas recebem os valores fixos ao carregar; iniciar/reiniciar a partida também restaura esses valores.
- Trechos de três letras: fácil ≥ 1.000 respostas; média 200–5.000; difícil 30–500. A contagem considera palavras normalizadas ainda não usadas. A faixa da volta é aplicada ao sortear a próxima sigla; uma sigla em manutenção continua até terminar sua volta. O trecho anterior é evitado quando há alternativas. Se a faixa esgotar, usa outro trecho com respostas, inclusive duas letras; se todo o léxico esgotar, encerra sem vencedor.

## Dicionário e licença

Fonte: [VERO pt-BR do LibreOffice](https://github.com/LibreOffice/dictionaries/tree/67032ee957631908098a72edf48dc81cac27e369/pt_BR), revisão fixa `67032ee957631908098a72edf48dc81cac27e369`. Autoria de Raimundo Santos Moura e colaboradores. O [aviso original](../content/dictionary/README_VERO.txt) oferece LGPLv3 e Mozilla Public License. Esta distribuição usa **LGPL-3.0**, com os textos [COPYING.LESSER](../content/dictionary/COPYING.LESSER) e [COPYING](../content/dictionary/COPYING). Os arquivos originais `.dic` e `.aff` acompanham a edição derivada; a licença aplica-se aos dados do dicionário. Não copiamos a base privada ou elementos visuais do BombParty.

O compilador `python -m tools.compile_dictionary` roda **no PC**, sem rede. Preserva entradas minúsculas de 3 a 32 letras e aplica uma única regra de sufixo do próprio VERO: flags A–D e flags minúsculas, sem continuação, hífen ou adições de mais de 12 caracteres. Isso inclui plurais, gêneros e muitas flexões verbais. Não é uma implementação integral do Hunspell. Não são aplicados prefixos, sufixos encadeados, compostos ou sugestões aproximadas.

Entradas exclusivas com inicial maiúscula, siglas exclusivamente maiúsculas, palavras marcadas como proibidas/raras/não sugeridas, abreviações com pontuação, números, espaços, apóstrofos e hífens são excluídas. Uma grafia minúscula que também tenha uso como nome próprio pode ser aceita pelo seu uso lexical; mudar a capitalização na jogada não muda a validação. Siglas sem entrada lexical minúscula ficam fora. O léxico é amplo, contém termos técnicos e regionais e não tem classificação editorial por frequência cotidiana nem filtro etário.

A edição contém **1.670.571 formas normalizadas**. Grafias alternativas de uma mesma chave compartilham repetição e contagem; quando a grafia digitada corresponde a uma alternativa, ela é preservada em minúsculas. Entrada sem acento que corresponda a várias grafias usa a primeira alternativa em ordem lexical. A fonte pode conter lacunas; flexões que dependam de regras excluídas podem ser recusadas.

`manifest.json` registra fonte, revisão, quantidade e hash SHA-256 do conteúdo descompactado. `words.tsv.gz` e `fragments.json` são reproduzíveis. A busca binária mantém aproximadamente **47 MiB de dados/índices por processo**, além do runtime, sem criar um objeto Python para cada palavra. O dicionário não é enviado ao navegador. Não compilar no Android.

## Testes e implantação

```powershell
npm.cmd run check
npm.cmd run build
.\.venv\Scripts\python.exe -m ruff check fun tests tools deploy
.\.venv\Scripts\python.exe -m pytest -q --basetemp=artifacts/pytest-batata
npm.cmd run test:batata
npm.cmd run test:browser
```

`tests/test_batata.py` cobre regras fixas, dois ciclos completos de dificuldade, manutenção da sigla após queima incluindo a vez da pessoa anterior em uma roda de quatro, mudança de referência após nova queima, eliminação/saída da pessoa de referência, dicionário real, relógio, repetição, mensagens concorrentes, isolamento, reconexão, permissões, abandono e reinício. `tests/batata.browser.mjs` abre dois contextos independentes de Chromium, desktop e celular; verifica o lobby sem ajustes, a manutenção da sílaba, a revanche, o popup de remoção por clique/teclado e seu cancelamento. Usa HTTP e WebSocket reais e um relógio controlável exclusivo do servidor de fixtures para evitar dependência da duração dos screenshots. Evidências ficam em `artifacts/batata-browser-*`. O servidor de teste e suas rotas não entram no pacote.

O build inclui os assets próprios; o pacote e o preparador do atualizador incluem dicionário e licença. `FUN_DICTIONARY` pode apontar para outro diretório compilado; se ausente, usa o dicionário do release. Produção exige HTTP/HTTPS com upgrade WebSocket, um worker e backup/rollback conforme [DEPLOY.md](DEPLOY.md). A release `7b839a3` foi ativada pelo fluxo existente, com preservação dos serviços compartilhados e verificações públicas registradas em [BATATA_VALIDACAO.md](BATATA_VALIDACAO.md).

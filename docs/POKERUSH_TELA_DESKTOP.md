# PokéRush em uma tela no computador — 22/10/2026

Pedido confirmado: ocupar a tela inteira no computador sem rolagem da página. O ajuste se limita à interface do PokéRush; não muda regras, pontuação, tempo, catálogo, dados ou backend.

A sala usa a altura disponível da janela, com mesa flexível, campo de resposta na parte inferior e controles à direita. As sugestões ficam na lateral e mantêm a rolagem própria, com até cinco nomes visíveis. O próprio input e a lista são preservados ao mudar o estado ou redimensionar; não se cria outro campo. A mesa com mais pessoas distribui participantes no perímetro em quatro fileiras, reservando espaço para os acertos. Placar e vencedores dos resultados ficam lado a lado, incluindo empate entre 16 pessoas.

O ajuste vale para janelas a partir de 761 px com ponteiro preciso. Os estilos são restritos ao PokéRush; o fluxo móvel continua existente. A página não usa um bloqueio global de overflow para esconder conteúdo: os elementos recebem espaço dentro da janela.

## Validação executada

`npm.cmd run check`, `npm.cmd run build` e `npm.cmd run test:pokerush` aprovados. O teste de navegador completo passou com duas, oito e dezesseis pessoas reais e mantém os cenários móveis, de reconexão, sugestões, pontuação, revanche e remoção.

Novas verificações medem `scrollHeight`/`scrollWidth` e os retângulos de mesa, centro, participantes, acertos, campo, sugestões, placar, vencedores e rodapé. Foram aprovados lobby, partida com sugestões, partida com 16 pessoas, resultados e empate entre 16 pessoas nas resoluções **1024×600, 1024×768, 1280×720, 1366×768, 1440×900 e 1920×1080**. Nenhum elemento essencial ficou fora da área visível nem houve rolagem da página.

Evidências locais: `artifacts/pokerush/browser-1792700092429/`, especialmente `desktop-fit-playing-2-suggestions.png`, `desktop-fit-playing-16.png`, `desktop-fit-results-16.png` e `desktop-fit-tie-16.png`. Backup anterior: `artifacts/pokerush-desktop/before.zip`.

## Publicação

Preparar a release com CI aprovado, comparar byte a byte os arquivos de runtime e dados com a versão ativa e validar a candidata isoladamente. Como o backend e o catálogo são idênticos e o processo usa `FUN_STATIC=/root/fun/current/dist`, a troca pode ser feita somente nos arquivos visuais, com backup do Fun, troca atômica e rollback, preservando PID e sessões. Conferir HTTPS/WSS, layout e processos compartilhados após a ativação. Evidências operacionais ficam em `artifacts/pokerush-desktop/`.

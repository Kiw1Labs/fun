# Pokédex lateral de PokéRush

Pedido de 22/10/2026: mostrar os 151 números da primeira geração ao lado da mesa e revelar o sprite de cada Pokémon quando alguém acertá-lo.

Os snapshots agora incluem `pokerush.used_ids`, lista numérica ordenada derivada do histórico autoritativo da partida. A interface mantém as posições 001–151, troca apenas as acertadas por imagens locais e marca cada uma com um visto. Os demais números não mostram nomes nem imagens. A contagem acompanha os mesmos IDs.

Não há migração, dependência ou serviço novo. O histórico já era persistido pelo servidor; expor os IDs no snapshot permite recuperar a Pokédex ao recarregar ou entrar como espectador. As marcações permanecem no resultado e são limpas ao começar outra partida ou retornar ao lobby.

A lateral se adapta à altura disponível no computador, preservando a página sem rolagem e limitando a altura das sugestões. O celular mantém o formulário e as sugestões no fluxo, com a Pokédex abaixo da mesa. Sprites já pertenciam ao pacote local do jogo.

Validação automatizada cobre acerto de outra pessoa, erro que não revela, expiração da miniatura de acerto, reconexão, espectador, resultados, os 151 acertos, revanche e números em ordem. O teste de navegador confere a imagem no lugar do número, recarga e seis resoluções de computador, além de telas móveis. As evidências de execução ficam em `artifacts/pokerush/` e `artifacts/pokerush-pokedex/`.

A publicação exige o backend atualizado para enviar os IDs. Antes da ativação: inventário, CI aprovado, backup e checagem de partidas ativas. Preservar os outros serviços e não cancelar uma partida em andamento para aplicar esta alteração.

Validação local executada em 22/10/2026: `npm.cmd run check`, `npm.cmd run build` e Ruff passaram; `pytest -q tests/test_pokerush.py` passou com 45 testes. O ensaio real de navegador `npm.cmd run test:pokerush` passou, incluindo a Pokédex, F5, espectadores, revanche, foco e ausência de rolagem nas seis resoluções de computador. Evidências finais: `artifacts/pokerush/browser-1792700931611/`. O build tem 517.879 bytes sem compressão.

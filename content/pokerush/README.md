# Catálogo local do PokéRush

151 formas padrão, IDs nacionais 1–151, obtidas da [PokéAPI v2](https://pokeapi.co/docs/v2#pokemon) em 22/10/2026. `types` contém os identificadores atuais, não os tipos históricos dos jogos de primeira geração. Exemplos: Clefairy é `fairy`; Magnemite é `electric` + `steel`; Mr. Mime é `fairy` + `psychic`.

Cada registro conserva a URL do recurso, a URL do sprite e SHA-256 da imagem. As imagens PNG transparentes vêm de `sprites.front_default`, no [repositório PokeAPI/sprites](https://github.com/PokeAPI/sprites). Total dos 151 sprites: **125.426 bytes**. São miniaturas de 96 × 96, distribuídas localmente e antecipadas no lobby. O jogo não consulta fontes externas durante partidas, sugestões ou envios.

Preparação no PC: `python -m tools.prepare_pokerush`. A ferramenta usa seis conexões, cache em `artifacts/pokerush/source` e publica o catálogo somente após obter os 151 registros. Para atualizar dados, remova do cache somente os recursos que deseja consultar novamente antes de executar a ferramenta. Não executar essa ferramenta no celular servidor nem em cada build; os arquivos compilados já acompanham o Git e o release.

Nomes especiais de exibição: `Nidoran ♀`, `Nidoran ♂`, `Farfetch’d` e `Mr. Mime`. Os identificadores originais continuam preservados em `slug`. A tabela de tipos em português está em `fun/games/pokerush.py` e `frontend/pokerush.js` e é conferida pelos testes.

Pokémon e as imagens dos personagens pertencem a seus respectivos titulares (Nintendo, Creatures e GAME FREAK). A disponibilização pela PokéAPI não transfere direitos sobre os personagens. Referências: [PokéAPI](https://pokeapi.co/), [licença/créditos dos sprites](https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt).

# PokéRush

Regras confirmadas pelo pedido de implementação em **22/10/2026**. Jogo integrado ao portal Fun e à seleção do lobby neutro, identificado por `pokerush`. Usa o mesmo código de quatro letras, convite, visibilidade, nickname, anfitrião e confirmação de remoção dos demais jogos.

## Regras

- Catálogo dos 151 Pokémon de Kanto, formas tradicionais, com os **tipos atuais** da PokéAPI. Nenhuma forma regional, Mega Evolução ou transformação. Nomes e sprites transparentes ficam locais; [origem e preparação](../content/pokerush/README.md).
- Uma única rodada contínua. Todos respondem simultaneamente. O nome completo precisa corresponder **exatamente ao conjunto** de um ou dois tipos do centro, independentemente da ordem. Fogo aceita Charmander e recusa Charizard; Fogo + Voador aceita Charizard e recusa Charmeleon.
- Um Pokémon acertado fica indisponível para toda a sala até outra partida. Cada conjunto elegível tem um bilhete no sorteio, independentemente da quantidade de Pokémon. Conjuntos esgotados saem do sorteio; o conjunto anterior não se repete se houver alternativa. Usar os 151 encerra a partida.
- Uma barra começa cheia e esvazia em 30 segundos. Cada acerto troca imediatamente o desafio e restaura os 30 segundos. Sem contagem numérica de tempo; cores verde, amarelo e vermelho. O prazo oficial pertence ao servidor.
- Primeiro acerto vale 50 pontos. Acertos consecutivos da mesma pessoa valem `50 + 20 × (sequência − 1)`: 50, 70, 90, 110… Somente o acerto de outra pessoa encerra a sequência. Erros não descontam pontos.
- Erro, nome desconhecido ou Pokémon usado bloqueia os envios daquela pessoa por 0,5 segundo no servidor, sem expor o motivo. Não troca o desafio, reinicia a barra ou interrompe a sequência.
- A primeira resposta correta recebida vence o desafio. Envios carregam `round_id`; mensagens antigas são descartadas sem ponto ou bloqueio, inclusive se o nome servir para o novo desafio. Eventos duplicados usam a idempotência da sala.
- A partir do segundo acerto consecutivo, exibe 🔥 ×2, ×3… Pontos recebidos aparecem brevemente. Imagem, nome e tipos do Pokémon ficam abaixo de quem acertou durante dois segundos, enquanto a disputa continua. Outro acerto da mesma pessoa substitui a exibição e renova seu prazo.

## Entrada e respostas

As sugestões começam com duas letras e pesquisam o catálogo completo, incluindo usados e todos os tipos. Cada linha mostra somente miniatura e nome. Até cinco linhas ficam visíveis, com rolagem para as demais. Tocar/clicar não preenche nem envia. O nome completo precisa ser digitado e enviado por Enter ou botão.

A normalização ignora caixa, acentuação, espaços e pontuação, sem correção aproximada de grafia. `Mr Mime`, `Mr. Mime` e `mr-mime` são equivalentes. `Nidoran F`/`Nidoran ♀` e `Nidoran M`/`Nidoran ♂` identificam espécies distintas. `Nidoran` sem gênero é recusado.

O próprio nó do campo, sua seleção, texto e foco sobrevivem às atualizações da partida, inclusive aos acertos de outros jogadores. Apenas a confirmação do envio correspondente limpa seu texto. Em telas estreitas com teclado/redução da área visível, tipos e barra também aparecem junto ao campo. Sugestões ocupam espaço no fluxo da página, sem popup sobre o desafio. Temas, navegação, cartões e controles seguem o Fun; movimento reduzido é respeitado. Sons de acerto, erro, fim e alerta são sintetizados localmente, com opção persistente de silêncio e somente um efeito por vez.

Revisão de 22/10/2026: no computador (janela a partir de 761 px e ponteiro preciso), a sala ocupa a altura disponível, sem rolagem da página. As sugestões ficam na lateral, com até cinco nomes e rolagem interna. A mesa adapta sua altura e usa até seis colunas e quatro fileiras no perímetro para acomodar 16 pessoas; os acertos continuam abaixo de cada jogador. Os resultados distribuem vencedores e placar lado a lado. Campo, foco e seleção continuam preservados ao responder ou redimensionar. No celular permanece o fluxo móvel. Validação registrada em [POKERUSH_TELA_DESKTOP.md](POKERUSH_TELA_DESKTOP.md).

## Sala e resultados

- Mínimo de dois conectados para iniciar; limite compartilhado de 16 pessoas, incluindo espectadores e sessões reservadas.
- Quem entra durante a partida acompanha até a próxima. Retornar com o token existente preserva identidade, pontos, acertos, sequência máxima e participação, dentro dos 60 segundos de reconexão do Fun.
- Todos os competidores offline cancelam imediatamente, sem vencedor; um espectador conectado não impede esse cancelamento. Abandono definitivo ou remoção deixando um único competidor usa a vitória por permanência existente. Sala vazia expira após cinco minutos. O anfitrião é transferido pelas regras comuns.
- O resultado destaca todos os empatados na maior pontuação, com nome e avatar de inicial, e apresenta placar em ordem de pontos, acertos e maior sequência. Quem saiu continua na mesma lista em cinza, sem colocação, como nos outros jogos. Espectadores não integram o placar daquela partida.
- Somente o anfitrião pode **Jogar novamente** ou **Voltar à sala**. A nova partida zera pontos, estatísticas, sequência, bloqueios e Pokémon usados. Todos os conectados entram no novo elenco, inclusive espectadores anteriores.

## Decisões técnicas

Detalhes de implementação, separados das regras confirmadas:

- `fun/games/pokerush.py` é uma política síncrona chamada pelo Engine sob o lock ASGI compartilhado. Não adiciona processo, dependência, banco ou serviço.
- `pokerush` usa a fase `playing`, com uma identidade nova para cada desafio e o prazo em `deadline`. A expiração é verificada antes de qualquer ação, além do ticker de 250 ms. Não concede ponto na fronteira do prazo.
- Catálogo imutável carregado uma vez por processo; escolha uniforme por conjunto com `secrets.choice`. Usados são persistidos no snapshot SQLite com IDs como strings para preservar a representação após serialização.
- O estado transmite apenas os tipos do desafio, contagem de usados, placar e acertos ainda em exibição. Não transmite tentativas erradas. O catálogo público serve à busca visual; validá-lo no cliente não concede pontos.
- Cada pessoa tem um último acerto com ID e horário de término. O cliente remove a exibição usando o relógio sincronizado e não precisa de um evento adicional por animação. A partida nunca espera por animações.
- Até oito pessoas usam disposição ao redor do centro; telas estreitas com cinco a oito pessoas e grupos maiores usam o perímetro de uma mesa com espaço reservado para acertos. Avatares usam a inicial, seguindo o padrão existente. Resultados empatados não têm desempate.
- Reinício do processo cancela partidas ativas e preserva as sessões/placares, conforme o padrão existente. Não há retomada de relógio depois de reinício.
- Build e pacote incluem JSON e 151 sprites. O preparador Python do atualizador também copia e valida esses caminhos; não faz consultas à PokéAPI, não exige Node no aparelho e mantém as barreiras de CI/backup/rollback existentes.

## Verificação

```powershell
npm.cmd run check
npm.cmd run build
.\.venv\Scripts\python.exe -m ruff check fun tests tools deploy
.\.venv\Scripts\python.exe -m pytest -q
npm.cmd run test:pokerush
```

`tests/test_pokerush.py` cobre tipos atuais e exatos, nomes, transparência/hash das imagens, sorteio uniforme por conjunto, esgotamento, bloqueio global, pontuação e sequência, cooldown, envios antigos/duplicados, fronteira do relógio, 151 acertos, resultados, reconexão, espectadores, reinício, limite de sala e disputa concorrente pelo transporte HTTP/WebSocket real.

`tests/pokerush.browser.mjs` usa backend isolado na porta 15058, três contextos de navegador e depois 16 conexões reais. Confere sugestões, teclado, preservação do nó/foco/seleção, exibição substituível, sequência, silêncio persistente, F5, espectadores, resultados, empates, revanche, lobby, remoção, temas e larguras 320/390/1440. Registra screenshots e relatório em `artifacts/pokerush/`. As rotas de avanço do relógio existem somente no servidor de fixtures dos testes.

Esses ensaios de viewport não substituem teste manual com teclado nativo em um Android físico. Resultados executados e limites estão em [POKERUSH_VALIDACAO.md](POKERUSH_VALIDACAO.md).

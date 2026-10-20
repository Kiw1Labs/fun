# Fun / Sabe Essa? — especificação funcional

Decisões recolhidas do planejamento anterior, 18/10/2026. O nome “Sabe Essa?” é provisório (antes PopSauce BR / Party Games BR). Não substituir essas decisões por suposições.

## Plataforma e URLs
- Portal em `https://fun.kw1.com.br/`, inicialmente com **Sabe Essa?** como único jogo. Revisão aprovada em 18/10/2026: título no topo, painel de criação à esquerda e painel de entrada por código à direita; no celular, painéis empilhados.
- Criação na página principal com seleção do jogo, nome da sala e seletor **Público/Privado**, seguida da ação **Jogar**. O nome do jogador é solicitado antes de criar/entrar e é distinto do nome da sala.
- Correção solicitada em 20/10/2026: quando o nickname já estiver salvo neste navegador, reutilizá-lo ao criar ou entrar em sala, sem pedir novamente. Solicitar identificação somente quando não houver nickname válido.
- Se o nome da sala estiver vazio ou contiver apenas espaços, criar como **Sala do [nome do usuário]**, usando o nome informado pelo criador. Regra confirmada pelo usuário em 18/10/2026.
- Salas públicas aparecem na página principal; salas privadas ficam acessíveis por código ou link, sem listagem pública. Comportamento confirmado pelo usuário em 18/10/2026.
- A home do jogo permanece **na mesma URL `/`**, antes de entrar em sala. Revisão solicitada em 20/10/2026: remover o título “Jogos” e o atalho “Sabe Essa?” da barra lateral; o jogo continua acessível na página inicial.
- Salas têm URL `https://fun.kw1.com.br/ABCD`, com exatamente **quatro letras** no código, únicas em toda a plataforma entre salas ativas, incluindo jogos futuros. O backend resolve o código para o jogo e a sala.
- Design minimalista inspirado na navegação do site ChatGPT, incluindo barra lateral, responsividade e visual claro/escuro; sem copiar marcas ou logotipos.
- Revisão solicitada em 20/10/2026: oferecer um controle no topo da barra lateral que abre um popup para alterar o nome do usuário.
- Preparar arquitetura para mais jogos, implementar somente Sabe Essa? agora.

## Desafios
- Modo único inicial: **Geral**, sem seleção de categorias pelo jogador. Referências populares amplamente reconhecíveis no Brasil.
- **15 desafios por partida**, **20 segundos** por desafio, sem dicas, com revelação da resposta correta após cada desafio.
- Se todos os competidores elegíveis já acertaram, encerrar o desafio antecipadamente.
- **8 desafios de imagem e 7 de texto**, intercalados; **7 fáceis, 5 médios e 3 difíceis** por partida. Os dois balanços devem coexistir.
- Tipos de texto: pergunta objetiva curta, falas de personagens e filmes, trechos musicais apresentados como texto, bordões e memes escritos.
- Sem repetição de desafio na mesma partida e nas **três partidas anteriores** da sala.
- Revisão expressamente solicitada em 18/10/2026: cadastrar acervo real, pesquisado, licenciado e persistido. O banco inicial contém 90 questões e 48 imagens locais; ver [banco de perguntas](BANCO_DE_PERGUNTAS.md). Manter fixtures isoladas e impedir partida sem composição suficiente. Não usar conteúdo protegido sem autorização adequada.

## Respostas e pontos
- Participantes podem tentar ilimitadamente até acertar ou acabar o tempo. **Resposta incorreta:** espera individual de **0,5 s** antes de nova tentativa, sem multa de pontos.
- Aceitar texto principal e aliases explicitamente cadastrados. Normalizar maiúsculas/minúsculas, acentos, espaços repetidos e pontuação decorativa. **Não** aceitar erros de ortografia por similaridade/fuzzy matching automático.
- Apenas um acerto pontua por desafio. Fórmula **P = arredondar(200 − 5 × t)** com `t` em segundos decorridos (inclusive frações) e regra de arredondamento **0,5 para cima**; teto **200**. Após 20 s = **0**. O servidor calcula tempo e pontos, nunca o navegador.
- Ranking somente da partida, pelo somatório dos 15 desafios. Empates de pontos compartilham **a mesma colocação**, sem desempate.

## Salas, anfitrião e espectadores
- Mínimo de **2 competidores** para começar; limite de **16 pessoas totais** por sala, incluindo competidores, espectadores e anfitrião (não há vaga extra do host).
- Apenas anfitrião inicia manualmente a partida.
- Quem entrar no meio da partida só pode entrar como **espectador**, caso haja vaga; joga apenas na partida seguinte.
- Anfitrião pode expulsar participantes até durante a partida. Saídas e expulsões podem produzir vitória automática se apenas um competidor permanece.
- Saída voluntária do anfitrião transfere função imediatamente ao participante **conectado mais antigo**; desconexão involuntária aguarda 60 s de reconexão antes da transferência.
- Encerrar a sala é ação diferente de sair dela.

## Reconexão, cancelamento e saídas
- Desconexão de participante reserva sua vaga/sessão por até **60 s**, preservando pontos e identidade. Após prazo, configura abandono definitivo.
- **Exceção prioritária:** quando **todos os competidores da partida** ficam desconectados ao mesmo tempo, cancelar a partida **imediatamente, sem vencedor**, sem aguardar os 60 s. A sala pode continuar caso haja outras pessoas conectadas.
- Quando restar apenas **um competidor** por abandono definitivo ou expulsão, terminar com **vitória automática** dele.
- Lista de pontuação mantém **todos os nomes e pontos acumulados**, inclusive expulsos e desistentes, na **mesma lista**, em **cinza e sem colocação**. Não criar blocos separados para desistências ou expulsões.

## Resultados e encerramento
- Em resultado, o anfitrião decide **Retornar todos ao lobby** ou **Iniciar nova partida**; não retornar automaticamente. A nova partida zera a pontuação, mas mantém histórico antirrepetição.
- Participantes que saíram ou foram removidos continuam no placar enquanto os resultados estiverem visíveis; ao retornar ao lobby, as sessões inativas e suas entradas do placar são removidas.
- Anfitrião pode **encerrar a sala a qualquer momento** (lobby, partida, resultados), com confirmação; se houver partida, **cancelar sem vencedor**.
- Salas completamente vazias expiram após **5 minutos**.
- Lobby e tela de resultados: depois de **30 minutos de inatividade relevante**, mostrar aviso de presença durante **2 minutos**; se ninguém confirmar, encerrar sala. Confirmação reinicia contagem. Não encerrar jogo ativo pela mesma regra de inatividade.

## Escopo, segurança e UX
- Godmode: revisão solicitada em 20/10/2026 para permitir vários usuários administrativos, cada um com sua própria senha. As contas de administração são independentes dos nicknames e sessões dos jogadores.
- Godmode: login e visualização administrativa devem seguir a mesma estética da página principal do Fun, conforme solicitado em 20/10/2026.
- Godmode: oferecer, nesta ordem, cartões **Salas abertas** e **Sabe Essa?**. **Salas abertas** mostra nomes e links das salas e seus participantes, identificando o anfitrião; **Sabe Essa?** mostra perguntas e respostas. Revisão solicitada em 20/10/2026, substituindo a restrição anterior de links apenas informativos; ordem dos cartões ajustada a pedido do usuário na mesma data.
- Godmode, **Sabe Essa?**: exibir as questões em uma grade com imagem e enunciado. Selecionar uma questão abre um popup com seus detalhes e resposta. Revisão solicitada em 20/10/2026.
- Contribuições: página `/nova-questao`, sem atalho nos menus ou nas páginas existentes, com a mesma estética do Fun. Permitir envio sem identificação ou com nickname opcional, título da pergunta, resposta e categoria. Separar o formato nas abas **Imagem** e **Texto**: a primeira exige imagem e a segunda exige texto de referência. Mostrar apenas o campo da aba selecionada e exigir exatamente um dos dois por envio. As questões recebidas devem ter uma tag de contribuição, aguardar em uma lista separada no Godmode e entrar no sistema somente após aprovação administrativa; permitir recusá-las. Pedido e revisão de obrigatoriedade em 20/10/2026.
- Interface em pt-BR, funcional em celular e desktop, acessível por teclado, contraste e leitores de tela.
- O motor da partida deve ser autoritativo; não enviar respostas aceitas antes da revelação, proteger ações privilegiadas do host, tratar mensagens duplicadas, recarga de página e disputas entre eventos simultâneos.
- Sem login obrigatório, ranking global ou escolha de categorias no MVP. Não inventar funcionalidades extras.

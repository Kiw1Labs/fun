# Fun — arquitetura e plano de implantação

## Infraestrutura pré-existente (validar ao vivo)
O dispositivo Kiwiki Lab é celular Android 10 Xiaomi M2006C3LII (dandelion), Termux 0.118.3, ~3,7 GiB RAM, swap ~2 GiB, Debian 12 proot armhf disponível. Já opera apps Flask, Django, Nginx, PostgreSQL, Cloudflare Tunnel, Tailscale, SSH e monitoramento. Há histórico de pressão de memória/carga e interrupções matinais. Não alterar ou interromper esses serviços.

Portas informadas anteriormente: Flask 5000, Django 8000, Nginx dashboard 8080 e LARP 8081, PostgreSQL 5432, host agent 9100, SSH 8022. Endereços públicos anteriores `larp.kw1.com.br` e `serv.kw1.com.br`. Portas e processos devem ser conferidos antes de qualquer mudança.

## Arquitetura proposta (não confundir com infraestrutura já verificada)
- Um frontend web estático, mobile-first (Vue/Vite ou equivalente leve) com shell do portal e jogo.
- Backend leve em Python (preferencialmente FastAPI/Starlette/ASGI ou alternativa compatível com ambiente real), usando WebSockets para salas e atualização em tempo real.
- Proxy reverso Nginx em `127.0.0.1:8082`, **se livre**. Backend em `127.0.0.1:5050`, **se livre**. Assets estáticos servidos diretamente pelo Nginx quando apropriado.
- Reutilizar instalação existente de **Nginx, PostgreSQL e cloudflared**, quando funcional. Criar usuário/schema/banco específico para Fun, respeitando o banco atual; NÃO reconfigurar a instância inteira para o Fun. Se persistência em banco for desnecessária inicialmente para estado efêmero, registrar a decisão e garantir que nenhum dado de outros projetos seja alterado.
- Cloudflare: adicionar nova rota **Published application** `fun.kw1.com.br` -> `http://127.0.0.1:8082` usando túnel existente, depois de confirmar a porta. Não criar novo túnel desnecessariamente. Cloudflare termina TLS; origem privada usa HTTP.
- Evitar Redis, Docker, serviços pesados e novos túneis por padrão. Se algum se mostrar essencial, justificar impacto e obter aprovação antes de adicionar.
- Iniciar com **um processo backend autoritativo** por sala. Não distribuir salas em múltiplos workers sem gerenciamento consistente de estado compartilhado.
- Tokens opacos de sessão no cliente e validações de recuperação no servidor; código de sala não é credencial de administração.

## Endpoints e roteamento
- `/` portal; selecionando Sabe Essa? a home do jogo continua na mesma URL.
- `/{codigo}` (quatro letras) mostra sala do jogo resolvida pelo servidor e sobrevive a F5; evitar conflito com rotas reservadas como `/api/`, `/assets/`, `/health` e `/ws`.
- Backend expõe uma checagem de saúde privada ou sem segredos, APIs e canal em tempo real; implementar limites de taxa e validação de entrada.
- `/nova-questao` é uma página pública sem links de entrada no portal. `POST /api/question-submissions` recebe contribuições anônimas ou com nickname opcional; a tabela privada `question_submissions` mantém os envios separados de `questions`. As APIs `/api/godmode/submissions` e suas rotas de imagem/revisão exigem autenticação administrativa. Somente a aprovação cria um desafio ativo e atualiza o catálogo em memória; partidas já iniciadas mantêm seus decks.
- WebSocket deve suportar upgrade via Nginx/Cloudflare, heartbeat, retomada de sessão, sincronização ao conectar e idempotência.

## Entrega técnica e segurança operacional
1. Inventariar estado existente, capacidade, portas, túnel e regras locais de deploy.
2. Implementar tudo no checkout local `Documents/github/Fun` (achar caminho real), usando git.
3. Registrar decisões e casos de teste. Desenvolver com fixtures artificiais em ambiente de teste; produção inicia sem catálogo definitivo.
4. Rodar lint, build, testes unitários, integração e cenários de corrida; em seguida testar local e remoto.
5. Fazer backup e plano de rollback antes de adicionar configurações Nginx/serviço no Termux. Não alterar configuração de outros hostnames ou caminhos.
6. Configurar reinício supervisionado sem loops pesados e monitoramento leve, de preferência reaproveitando padrões do Kiwiki Lab.
7. Verificar local HTTP, WebSocket e acesso externo HTTPS; certificados e DNS devem estar corretos. A implantação externa depende da rota Cloudflare feita pelo usuário ou de autorização já disponível.
8. Git commit/push a `https://github.com/Kiw1Labs/fun` somente pelo ambiente autenticado. Não versionar `.env`, tokens, certificados, bancos, dados pessoais ou dumps.

## Critérios de aceite mínimos
- Rotas, criação/entrada na sala, limite 16, mínimo 2, espectadores, controle do anfitrião e reconexão de 60 s.
- 15 desafios/20 s, composição 8/7 e 7/5/3, antirrepetição, normalização e pontuação testados com fixtures.
- Cancelamento instantâneo se todos os competidores desconectam; vitória automática se sobra um após saídas definitivas; ranking inclusivo em cinza, empates.
- Saída vs encerramento do host, transferência, aviso 30+2 minutos e sala vazia 5 min, mesmo com múltiplos clientes.
- Deploy usa baixo consumo e **não afeta larp/serv ou as outras aplicações**; não afirmar disponibilidade sem testes reais.

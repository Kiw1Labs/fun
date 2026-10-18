# Prompt mestre para Codex — implementar Fun / Sabe Essa?

Você é o agente de implementação responsável pelo projeto **Fun**, primeira aplicação **Sabe Essa?**, com repositório `https://github.com/Kiw1Labs/fun`.

**Diretório desejado no computador:** `Documents/github/Fun`. Identifique o caminho exato do usuário no Windows, não assuma que `~` é equivalente em qualquer shell. Você está em ambiente de trabalho do PC; o destino de produção é outro dispositivo, o servidor Android/Termux **Kiwiki Lab**.

## CONTEXTO OBRIGATÓRIO
Leia integralmente `AGENTS.md`, `docs/PRODUCT_SPEC.md` e `docs/ARCHITECTURE.md` antes de começar. Estes arquivos transcrevem as decisões da conversa anterior do ChatGPT, à qual você não deve presumir acesso por estar na mesma conta. Não peça para o usuário repetir definições já presentes nos documentos.

A plataforma terá portal em **https://fun.kw1.com.br** com, por enquanto, apenas um botão Sabe Essa?. Ao selecionar o jogo, a home do jogo permanece na rota `/`. Salas futuras e atuais têm URLs de exatamente quatro letras, p.ex. `/ABCD`, com unicidade entre todos os jogos. O visual é minimalista, responsivo, com barra lateral inspirada na estrutura do ChatGPT, sem copiar identidade protegida. O jogo é de desafios ao vivo em salas e todas as suas regras detalhadas encontram-se na especificação, que prevalece sobre quaisquer escolhas de implementação.

## MISSÃO
Implementar uma versão utilizável, testada, documentada, segura e leve, com backend servidor-autoritativo e frontend responsivo; preparar implantação no celular sem interferir nos serviços existentes. Faça trabalho real no checkout, não apenas descreva como faria. Utilize a infraestrutura existente sempre que seguro (Nginx, PostgreSQL, cloudflared), evitando sobrecarga, novos processos redundantes e risco aos outros sistemas.

## ORDEM DE EXECUÇÃO
1. Verifique estado do git, remote, branch, permissões e arquivos. Preserve trabalho já existente. Se a pasta não contém clone, clonar; se ainda não há código, iniciar projeto. Antes de um push, mostrar as mudanças e rodar testes.
2. Faça levantamento tecnológico do celular via canal remoto já autorizado, caso disponível. Não exponha credenciais, não presuma SSH disponível e não tente instalar coisas para burlar acesso. Identifique processos, portas, RAM, CPU, disco e como o Nginx/Cloudflare gerenciam os sites antigos.
3. Crie estrutura modular para portal, salas, motor do primeiro jogo, modelos de desafio, aplicação web em tempo real, persistência e testes. Prefira stack leve e compatível com Termux ARM; registre dependências e escolhas. Portas **8082/5050 são apenas propostas** a confirmar.
4. Implemente fielmente todas as regras descritas em `docs/PRODUCT_SPEC.md`, cobrindo especialmente cronômetros autoritativos, 0,5s por erro, cálculo de pontos, distribuição dos 15 desafios, reconexão, cancelamento instantâneo quando todos os competidores estiverem offline, transferência de anfitrião, expulsões, espectadores, rankings, fechamento e expiração.
5. **Não invente nem cadastre desafios reais em produção.** Crie esquema de autoria/importação com aliases e classificação; crie fixtures sintéticas somente para testes e uma UI de ausência de conteúdo. Uma partida só inicia quando há catálogo adequado à composição e ao histórico antirrepetição.
6. Backend e cliente devem resistir a F5, perda de conexão, duplicação de eventos, múltiplas abas, mudanças de anfitrião, solicitações concorrentes e mensagens maliciosas. Defina testes automatizados para esses cenários; proteja ações do anfitrião e dados privados de resposta.
7. Forneça arquivos de configuração/versionamento para produção: template de variáveis, build frontend no PC, aplicação backend mínima, configuração Nginx por hostname, WebSocket upgrade, permissões de arquivos, logs com rotação, saúde e supervisor compatível com o sistema existente. Faça configuração **aditiva**, backup e rollback.
8. O usuário configura no Cloudflare **Published application** `fun.kw1.com.br` -> `http://127.0.0.1:8082` (se essa porta ficar confirmada). Verifique DNS/túnel e solicite somente a ação manual necessária se a permissão Cloudflare não existir. Nunca sobrescreva rotas `larp.kw1.com.br` ou `serv.kw1.com.br`.
9. Teste frontend, backend, WebSocket, regras e configuração; anote comandos, resultados, falhas, métricas aproximadas de recursos realmente medidas e itens pendentes.
10. Faça commits descritivos, e **push** para `Kiw1Labs/fun` via credenciais já configuradas no computador. Não use force push. Preserve segredos fora do git. Atualize README com instruções para dev, testes, deploy e recuperação.

## CRITÉRIO DE CONCLUSÃO
- Código e testes efetivos presentes no repositório local.
- Projeto fiel às regras documentadas, sem acréscimos funcionais não aprovados.
- Ambiente de desenvolvimento executável e configuração de produção preparada; implantação no celular apenas se acesso/capacidade e segurança forem confirmados.
- Outros aplicativos existentes continuam funcionando; relatório final traz URLs/portas verificadas, branch e commit pushado, e distingue testes executados dos que ficaram pendentes.
- Se uma etapa depender de acesso/credencial impossível, complete todo o restante, documente bloqueio preciso e forneça a menor ação manual necessária. Não declare sucesso da etapa bloqueada.

Comece pela leitura dos documentos, inspeção segura do repositório e um plano curto. Depois implemente e valide sem esperar aprovação para tarefas locais reversíveis; peça confirmação antes de ações destrutivas ou que possam afetar serviços de produção.

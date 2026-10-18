# Fun — Instruções permanentes para Codex

Leia integralmente `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md` e `prompts/CODEX_KICKOFF.md` antes de alterar código ou infraestrutura. A especificação de produto é a fonte de verdade para regras confirmadas. Não invente regras ausentes; registre decisões técnicas e incertezas separadamente.

Repositório: `https://github.com/Kiw1Labs/fun`; pasta solicitada: `~/Documents/github/Fun` (descobrir caminho real no Windows). Implantação: celular Android/Termux Kiwiki Lab já hospeda outros sistemas; preservá-los obrigatoriamente.

- Fazer inventário e backup antes de mudanças, especialmente no servidor remoto. Não reiniciar/reconfigurar cloudflared, PostgreSQL, nginx, Django, Flask, Tailscale, SSH, ngrok ou supervisores sem verificar impacto e preparar rollback.
- Escolher tecnologias conservadoras e leves compatíveis com Android 10 ARM/Termux, evitando processos pesados, builds no aparelho e dependências nativas difíceis.
- Portas 8082 (nginx) e 5050 (backend) são propostas, não reservas; conferir antes.
- Isolar dados/banco do Fun e variáveis de ambiente, sem divulgar segredos nem comitar `.env`.
- Backend autoritativo para códigos de sala, sessões, relógio, respostas, pontos e expulsões. Tratar concorrência, reconexão e reinícios.
- Entregar código, testes e documentação; executar testes e relatar resultados reais, com evidência. Não declarar implantação pública concluída sem verificação HTTP/HTTPS e WebSocket.
- Não cadastrar desafios definitivos agora. Fixtures artificiais de teste podem existir, isoladas de produção.
- Usar pt-BR para interface e documentação. Foco em acessibilidade e dispositivos móveis.

# Painel administrativo Godmode

O painel em `/godmode` exibe salas abertas (públicas e privadas) e todas as perguntas registradas no SQLite, incluindo rascunhos, perguntas em revisão e inativas. Códigos de sala são informativos; não há links ou ações para entrar nas salas.

## Acesso

Configure `FUN_ADMIN_USERNAME` e `FUN_ADMIN_PASSWORD` no arquivo privado do serviço (`shared/fun.env` em produção), nunca no repositório. Sem as duas variáveis, o painel fica desativado e responde `404`.

O endereço apresenta uma tela própria de login em português. Os dados são conferidos no servidor; as APIs `/api/godmode/rooms` e `/api/godmode/questions` exigem o cabeçalho HTTP Basic, mas não enviam o desafio `WWW-Authenticate`; credenciais inválidas aparecem na própria tela, sem abrir a janela nativa do navegador. A senha fica apenas na memória da página enquanto o painel está aberto e não é gravada em armazenamento do navegador. Dez tentativas inválidas por IP em um minuto são permitidas; depois disso, o servidor limita novas tentativas. Use uma senha forte e acesse somente por HTTPS.

As respostas usam `Cache-Control: no-store`, e a página solicita aos buscadores que não a indexem. A rota do painel e seus arquivos estáticos não contêm dados administrativos; todas as informações são servidas pelas APIs protegidas.

## Desenvolvimento e build

Configure as variáveis no processo local antes de iniciar o servidor. Gere os arquivos estáticos com:

```sh
npm run build
```

O build copia `frontend/godmode.html` para `dist/godmode.html`. O backend serve `godmode.js` e `godmode.css` pelas rotas de assets. Os dados vêm do mesmo motor de salas e da tabela `questions` do SQLite do Fun.

Os testes correspondentes estão em `tests/test_app.py` e `tests/browser.test.mjs` e podem ser executados com:

```sh
python -m pytest
npm run test:browser
```

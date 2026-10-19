# Painel administrativo Godmode

O painel em `/godmode` exibe salas abertas (públicas e privadas) e todas as perguntas registradas no SQLite, incluindo rascunhos, perguntas em revisão e inativas. Códigos de sala são texto simples; a lista não oferece links, botões nem ações para abrir ou alterar salas.

## Acesso

O servidor exige autenticação HTTP Basic com usuário e senha configurados no ambiente:

```sh
FUN_ADMIN_USERNAME=seu-usuario
FUN_ADMIN_PASSWORD=uma-senha-longa-e-unica
```

Configure os valores no arquivo privado de ambiente do serviço (em produção, `shared/fun.env`), nunca neste repositório. Use uma senha forte e acesse o painel somente por HTTPS. Se qualquer variável estiver vazia ou ausente, `/godmode` e suas APIs respondem `404` e o painel fica desativado. Dez tentativas inválidas por IP em um minuto são permitidas; depois disso, o servidor limita novas tentativas.

O navegador apresenta a solicitação de usuário e senha ao abrir `/godmode`. As APIs protegidas são `/api/godmode/rooms` e `/api/godmode/questions`; ambas exigem as mesmas credenciais. Respostas usam `Cache-Control: no-store`, e a página solicita aos buscadores que não a indexem. A autenticação é aplicada pelo servidor a cada rota; ocultar o endereço não é considerado controle de acesso.

## Desenvolvimento e build

Configure as duas variáveis no processo local antes de iniciar o servidor. Gere os arquivos estáticos com:

```sh
npm run build
```

O build copia `frontend/godmode.html` para `dist/godmode.html`. O backend serve o HTML e os arquivos `godmode.js`/`godmode.css` pelas rotas protegidas, inclusive em releases preparadas pelo atualizador Android sem Node.js. Os dados vêm do mesmo motor de salas e da tabela `questions` do SQLite do Fun. Não há uma segunda base de dados.

Os testes de integração correspondentes estão em `tests/test_app.py` e podem ser executados junto da suíte Python:

```sh
python -m pytest
```

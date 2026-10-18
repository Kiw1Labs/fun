# Autoria e importação privada

Produção inicia sem catálogo. Nunca usar fixtures como conteúdo real. Um editor deve fornecer conteúdo autorizado e revisar respostas, aliases, classificação e acessibilidade da imagem.

O arquivo é uma lista JSON de objetos com estes campos:

| Campo | Tipo e regra |
|---|---|
| `id` | Identificador editorial estável e único, 1–80 letras, números, `_` ou `-`. Não reciclar IDs para contornar o histórico. |
| `kind` | `image` ou `text` |
| `difficulty` | `easy`, `medium` ou `hard` |
| `prompt` | Enunciado curto, obrigatório, até 1.000 caracteres |
| `answer` | Resposta principal, até 200 caracteres |
| `aliases` | Lista explícita de alternativas, até 40 itens de 200 caracteres |
| `classification` | Lista editorial não vazia; não é filtro selecionável pelo jogador |
| `rights` | Registro de autoria/licença/autorização, obrigatório |
| `image` | Imagem: caminho local `/media/arquivo.png`, `.jpg`, `.jpeg` ou `.webp`; texto: `null` |

Não se aceitam URLs externas, SVG, caminhos relativos, aliases vazios ou IDs duplicados. A normalização aplica casefold, decomposição de acentos e substituição da pontuação por espaços; não faz correção ortográfica. Cadastre explicitamente toda variante aceitável.

No PC, com ambiente ativado:

```powershell
python -m tools.import_catalog caminho/privado/revisado.json caminho/privado/catalog-v1.json
```

O destino deve ser novo: o importador não sobrescreve catálogo anterior. O backend carrega o catálogo no início. Em manutenção do Fun, copie o catálogo validado e as imagens para `shared`, preserve a versão anterior e reinicie somente o Fun. Imagens devem ter permissão de leitura para o worker Nginx; catálogo e banco nunca são servidos pelo Nginx. Não altere IDs/aliases enquanto uma partida usa essa versão.

É possível ter 15 desafios e ainda faltar composição: o seletor exige simultaneamente 8 imagens, 7 textos, 7 fáceis, 5 médios e 3 difíceis. Exclui os desafios das três partidas anteriores, inclusive uma partida iniciada e cancelada. Valida as distribuições por busca das combinações possíveis e amostragem sem reposição; começa por imagem e intercala até a oitava imagem. O catálogo só é adequado quando há combinação exata após as exclusões.

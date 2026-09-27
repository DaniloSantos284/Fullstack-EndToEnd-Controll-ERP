# API HTTP atual

Esta é a descrição do comportamento implementado no backend em `backend/src`. As rotas da aplicação são montadas sob `/api`; portanto, a base é `http://<host>:<porta>/api`.

> **Disponibilidade atual:** a inicialização valida as variáveis de ambiente com Zod antes de abrir a porta configurada. Os contratos abaixo descrevem os handlers implementados; a disponibilidade de uma instância ainda depende de uma configuração de banco válida.

## Convenções do contrato

- Os identificadores de produto e de movimentação são UUIDs gerados pelo servidor. Nas rotas que recebem `:id`, o único critério HTTP implementado é ser uma string não vazia; o formato UUID não é validado.
- Um segmento `:id` ausente não casa a rota parametrizada. Se não houver outra rota para aquele método e path, o Express aplica seu `404` padrão; por exemplo, `GET /api/products` casa a rota de listagem, não a de detalhes. O `400` local de `id` ocorre somente quando o segmento foi recebido e fica vazio após `trim`, como em um espaço codificado.
- O corpo das rotas de escrita é JSON. Campos desconhecidos são ignorados pelos controllers.
- `ProductCategory` aceita somente: `FOOD`, `ELECTRONICS`, `CLOTHING`, `CLEANING`, `OFFICE` e `OTHER`.
- A API expõe os tipos de movimento como `ENTRY` e `EXIT`. A persistência MySQL os converte internamente para `in` e `out`.
- Datas `Date` serializadas por `res.json()` são strings ISO 8601, por exemplo `"2026-09-25T12:34:56.000Z"`.
- Propriedades com valor `undefined` não aparecem no JSON. Assim, `imageUrl` e `barCode` podem estar ausentes, apesar de aparecerem como opcionais nos exemplos de resposta.
- A criação preserva o `price` `number` recebido no JSON. Já leituras MySQL de `products.price` (`DECIMAL(10,2)`) tendem a chegar como string: o pool não habilita `decimalNumbers: true` e o repositório não faz conversão. Clientes não devem supor `price` numérico em respostas de leitura.

## Endpoints

### `GET /api/products`

Lista os produtos persistidos. Não há paginação, filtros, ordenação configurável ou uso de query string no handler. A ordem é a devolvida pelo banco, pois a consulta não contém `ORDER BY`.

**Corpo:** não utiliza corpo.

**Resposta `200 OK`:** array, inclusive vazio (`[]`).

```json
[
  {
    "id": "9ecf4f56-4b6e-4e49-9972-b47f844b2d9b",
    "name": "Camiseta",
    "price": "59.90",
    "category": "CLOTHING",
    "imageUrl": "http://localhost:4000/uploads/camiseta.png",
    "quantity": 10
  }
]
```

Cada item contém `id`, `name`, `price`, `category`, `quantity` e, quando definido, `imageUrl`. Nesta leitura, `price` tende a ser a string retornada pelo MySQL para `DECIMAL(10,2)`, pois não há conversão no repositório. A quantidade é recalculada a partir das movimentações carregadas: entradas somam e saídas subtraem; o campo `products.quantity` armazenado não é usado para montar a resposta.

**Outros status observáveis:** falhas no repositório de produtos, incluindo carregamento de movimentos durante a listagem, são convertidas para `400` com `{"message":"Erro ao buscar produtos no banco"}`. Erros não classificados pelo middleware retornam `500`.

### `POST /api/products`

Cria um produto. A quantidade inicial é zero; não há campo de quantidade aceito nesta rota.

**Corpo JSON:**

```json
{
  "name": "Camiseta",
  "price": 59.9,
  "category": "CLOTHING",
  "imageUrl": "http://localhost:4000/uploads/camiseta.png",
  "barCode": "1234567890"
}
```

| Campo | Obrigatório | Regra aplicada |
| --- | --- | --- |
| `name` | Sim | Deve ser `string`; depois, não pode ser vazia ou formada apenas por espaços. O valor não é aparado antes de ser salvo. |
| `price` | Sim | Deve ser `number` e não pode ser negativo. Zero e valores decimais são aceitos. |
| `category` | Sim | Deve ser `string` e um dos valores de `ProductCategory`. |
| `imageUrl` | Não | Só é encaminhado se for `string`; string vazia acaba não sendo persistida nem devolvida. Não há validação de URL, arquivo ou existência no diretório de uploads. |
| `barCode` | Não | Só é encaminhado se for `string`; string vazia acaba não sendo persistida nem devolvida. Não há regra de unicidade ou de formato. |

**Resposta `201 Created`:**

```json
{
  "id": "9ecf4f56-4b6e-4e49-9972-b47f844b2d9b",
  "name": "Camiseta",
  "price": 59.9,
  "category": "CLOTHING",
  "imageUrl": "http://localhost:4000/uploads/camiseta.png",
  "barCode": "1234567890"
}
```

Não retorna `quantity`, `movements`, cabeçalho `Location` ou os timestamps do banco.
O `price` dessa resposta é o `number` recebido no corpo de criação; a ressalva de
`DECIMAL` aplica-se às respostas que leem o produto do MySQL.

**Erros de regra (`400 Bad Request`):**

- `{"message":"Campo name inválido."}` se `name` não for string;
- `{"message":"Campo preço inválido."}` se `price` não for number;
- `{"message":"Campo categoria inválido."}` se `category` não for string;
- `{"message":"Categoria inválida."}` se a categoria não pertencer ao enum;
- `{"message":"Nome do produto é obrigatório."}` se o nome for vazio/apenas espaços;
- `{"message":"Preço inválido"}` se o preço for negativo ou `NaN` no caso de chamada interna;
- `{"message":"Erro ao salvar no DB"}` para qualquer erro capturado na persistência do produto.

Erro inesperado fora desses casos retorna `500` no formato global.

### `GET /api/products/:id`

Obtém o produto e as suas movimentações. As movimentações vêm da consulta do produto e são ordenadas no banco por `created_at DESC`.

**Parâmetro:** para alcançar esta rota, o segmento `id` precisa estar presente. Um
segmento presente que resulte vazio após `trim` recebe `400`; a ausência do segmento
não aciona este handler.

**Resposta `200 OK`:**

```json
{
  "id": "9ecf4f56-4b6e-4e49-9972-b47f844b2d9b",
  "name": "Camiseta",
  "price": "59.90",
  "category": "CLOTHING",
  "imageUrl": "http://localhost:4000/uploads/camiseta.png",
  "barCode": "1234567890",
  "quantity": 5,
  "movements": [
    {
      "id": "dc0615af-68d5-4895-a945-e783a4bc6077",
      "type": "EXIT",
      "quantity": 5,
      "createdAt": "2026-09-25T12:34:56.000Z"
    }
  ]
}
```

Os itens de `movements` deste endpoint não incluem `productId`. `imageUrl` e `barCode` são omitidos se não tiverem valor. Nesta leitura, `price` tende a ser string pelo retorno padrão do MySQL para a coluna `DECIMAL(10,2)`.

**Erros/status:**

- `400` com `{"message":"Id do produto inválido"}` se o segmento presente ficar vazio após `trim`;
- `404` com `{"message":"Product not found"}` se não houver produto;
- `400` com `{"message":"Erro ao procurar pelo id"}` se a consulta SQL de `findById` falhar;
- `400` com `{"message":"Erro ao buscar esse produto"}` se a hidratação do produto ou o carregamento de seus movimentos falhar. `findById` retorna `mapRowToProduct` sem `await`, portanto essa rejeição não é capturada pelo `catch` de `findById`;
- `500` para erro não tratado pelo `AppError`.

### `POST /api/products/:id/stock/entry`

Registra uma entrada de estoque para o produto.

**Corpo JSON:**

```json
{ "quantity": 10 }
```

`quantity` deve ser `number`, não pode ser `NaN` e deve ser maior que zero. Não há validação de inteiro; valores positivos decimais passam pela camada HTTP, embora a coluna MySQL seja `INT`.

**Resposta `201 Created`:**

```json
{ "ok": true }
```

O identificador e a data da movimentação não são retornados. A operação cria uma movimentação `ENTRY` com UUID e data atuais.

**Erros/status:**

- `400` `{"message":"Parâmetro id inválido."}` para segmento `id` presente, mas vazio após `trim`;
- `400` `{"message":"Campo quantity inválido. Deve ser número > 0."}` para corpo inválido, zero ou negativo;
- `404` `{"message":"Produto não encontrado"}` se o produto não existir;
- `400` `{"message":"Erro ao procurar pelo id"}` se a consulta SQL de `findById` falhar;
- `400` `{"message":"Erro ao buscar esse produto"}` se a hidratação do produto falhar;
- `500` se a gravação da movimentação, ou outro erro não convertido em `AppError`, falhar.

### `POST /api/products/:id/stock/exit`

Registra uma saída de estoque para o produto.

**Corpo JSON:**

```json
{ "quantity": 5 }
```

As exigências de `quantity` são as mesmas da entrada: número positivo, sem exigência de inteiro. Antes de persistir, o produto é remontado com seu histórico e a saída só é aceita se a quantidade atual desse agregado carregado for suficiente. Essa proteção vale para a operação isolada; como não há transação ou bloqueio, saídas concorrentes podem observar o mesmo saldo e, em conjunto, excedê-lo.

**Resposta `201 Created`:**

```json
{ "ok": true }
```

**Erros/status:**

- `400` `{"message":"Parâmetro id inválido."}` para segmento `id` presente, mas vazio após `trim`;
- `400` `{"message":"Campo quantity inválido. Deve ser número maior que 0."}` para corpo inválido, zero ou negativo;
- `400` `{"message":"Insufficient stock"}` quando não há estoque calculado suficiente;
- `404` `{"message":"Produto não encontrado"}` se o produto não existir;
- `400` `{"message":"Erro ao procurar pelo id"}` se a consulta SQL de `findById` falhar;
- `400` `{"message":"Erro ao buscar esse produto"}` se a hidratação do produto falhar;
- `500` se a persistência da movimentação, ou outro erro não convertido em `AppError`, falhar.

### `GET /api/products/:id/movements`

Lista somente as movimentações de um produto, em ordem decrescente de `created_at` no banco.

**Parâmetro:** para alcançar esta rota, o segmento `id` precisa estar presente; um
segmento presente e vazio após `trim` recebe `400`.

**Resposta `200 OK`:** array, possivelmente vazio.

```json
[
  {
    "id": "dc0615af-68d5-4895-a945-e783a4bc6077",
    "productId": "9ecf4f56-4b6e-4e49-9972-b47f844b2d9b",
    "type": "ENTRY",
    "quantity": 10,
    "createdAt": "2026-09-25T12:34:56.000Z"
  }
]
```

Diferentemente de `GET /api/products/:id`, esta resposta inclui `productId` em cada item.

**Erros/status:**

- `400` `{"message":"Parâmetro id inválido."}` para segmento `id` presente, mas vazio após `trim`;
- `404` `{"message":"Produto não encontrado."}` se o produto não existir;
- `400` `{"message":"Erro ao procurar pelo id"}` se a consulta SQL de `findById` falhar;
- `400` `{"message":"Erro ao buscar esse produto"}` se a hidratação durante a verificação do produto falhar;
- `500` se a consulta direta de movimentações falhar ou ocorrer outro erro não convertido em `AppError`.

### `GET /uploads/*`

O Express serve estaticamente arquivos existentes em `backend/uploads` sob o prefixo `/uploads`; essa montagem não usa o prefixo `/api`. Por exemplo, uma referência salva como `http://<host>:<porta>/uploads/camiseta.png` pode ser obtida por `GET` se o arquivo existir.

O conteúdo, `Content-Type`, cache e resposta de sucesso são definidos por `express.static` e pelo arquivo servido, não por controller. Não existe endpoint de upload, nem validação de que um `imageUrl` de produto aponte para esse diretório. Um arquivo inexistente continua para o tratamento padrão de rota não encontrada.

## Formato e tratamento de erros

Erros do tipo `AppError` são processados pelo middleware global e retornam o status associado com exatamente este envelope:

```json
{ "message": "Descrição do erro" }
```

Erros que não são `AppError` são registrados no `console.error` como `Erro inesperado:` e retornam:

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json
```

```json
{ "message": "Erro de servidor" }
```

Não há envelope com código, detalhes de campos, stack trace, identificador de requisição ou lista de erros de validação.

### Rotas não encontradas, método e JSON inválido

- Não existe middleware próprio de `404` nem de `405`. Um path inexistente, um método sem handler para um path existente (por exemplo `PUT /api/products`) ou um arquivo ausente em `/uploads` termina no tratamento padrão do Express, que não segue o envelope JSON da API.
- `express.json()` é o parser global ativo antes das rotas, com seu limite padrão e sem configuração explícita de `limit`. Para JSON reconhecido pelo parser, o corpo é disponibilizado em `req.body`.
- Não há parser para formulário URL-encoded, XML ou `multipart/form-data`. Em particular, não há suporte HTTP para enviar arquivos.
- JSON malformado, corpo que exceda o limite padrão do parser ou outros erros produzidos pelo parser não têm mapeamento específico para `400`: alcançam o `errorHandler` como erro comum e recebem `500` com `{"message":"Erro de servidor"}`.
- Se o corpo não for analisado como JSON, os controllers de escrita veem os campos obrigatórios como ausentes e devolvem seus erros de validação `400` correspondentes.

## Middlewares

### Ativos

| Ordem | Middleware/montagem | Efeito |
| --- | --- | --- |
| 1 | `express.json()` | Analisa JSON antes das rotas com o limite padrão, sem configuração explícita. |
| 2 | `express.static(...)` em `/uploads` | Expõe os arquivos em `backend/uploads`. |
| 3 | Router de produtos em `/api` | Registra os seis endpoints de produtos e estoque. Cada controller assíncrono encaminha rejeições para `next`. |
| 4 | `errorHandler` | Serializa `AppError` e falhas inesperadas conforme a seção anterior. |

### Ausentes no código atual

Não estão registrados middleware de autenticação, autorização/perfis, CORS, rate limiting, upload, validação global por schema, logging HTTP estruturado, correlação de requisições, CSRF, compressão, versionamento de API, handler explícito de `404` ou handler de `405`.

Consequentemente, as rotas implementadas não exigem `Authorization` e o servidor não acrescenta cabeçalhos CORS. A ausência desses componentes descreve o estado atual; não implica que eles já estejam sendo aplicados por infraestrutura externa.

## Compatibilidade e diferenças de contrato

- O backend usa Express 4, Node.js/TypeScript e MySQL. O Dockerfile é multi-stage com `node:22-slim`, Corepack e pnpm; o runtime instala apenas dependências de produção e usa o usuário `node`. O Compose tem valores padrão de desenvolvimento e aceita personalização opcional ao copiar `.env.example` para `.env`.
- Clientes devem tratar IDs como strings opacas, datas como strings ISO e enums exatamente em maiúsculas. Não há negociação de versão, prefixo de versão (`/v1`) ou contrato OpenAPI implementado.
- A forma da resposta varia por endpoint: a criação não retorna `quantity`; a listagem não retorna `barCode` nem `movements`; detalhes omitem `productId` dentro de movimentos; e a listagem de movimentos o inclui.
- O tipo de `price` na criação é número porque vem do JSON da requisição. Para dados lidos do MySQL, `price` é uma coluna `DECIMAL(10,2)` e o repositório não faz conversão explícita. Clientes não devem depender sem teste de que leituras retornem `price` como número; a configuração padrão usual do `mysql2` devolve `DECIMAL` como string.
- Sem CORS registrado na aplicação, um cliente web em outra origem não recebe permissão CORS do backend. Um cliente mobile/nativo ou uma chamada same-origin não depende desse cabeçalho da mesma forma.
- `imageUrl` é apenas uma string opcional de produto. A compatibilidade com `/uploads` depende de o cliente usar uma URL alcançável e de o arquivo já existir; o backend não cria nem envia imagens por HTTP.

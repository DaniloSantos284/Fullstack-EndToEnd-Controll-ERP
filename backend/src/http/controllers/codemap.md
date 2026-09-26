# `backend/src/http/controllers/`

## Responsabilidade

Os controllers são adaptadores Express por endpoint. Cada classe recebe um caso de
uso no construtor, lê `req.params` e/ou `req.body`, realiza as verificações presentes
no próprio controller, chama `execute` e devolve a resposta HTTP. Eles não acessam
o banco diretamente.

Com exceção da validação de `id` em `GetProductDetailsController`, falhas esperadas
são lançadas como `AppError`. As rotas capturam a rejeição de `handle` e a encaminham
ao middleware de erro. `GetProductDetailsController` responde seu `400` diretamente.

## Controllers e fluxo para os casos de uso

| Controller | Entrada lida | Caso de uso e efeito | Resposta de sucesso |
| --- | --- | --- | --- |
| `ListProductsController` | nenhuma | `ListProductsUseCase.execute()` consulta todos os produtos e projeta resumo com saldo calculado. | `200` com array de resumos. |
| `GetProductDetailsController` | `params.id` | `GetProductDetailsUseCase.execute(id)` busca o agregado e projeta dados e movimentos. | `200` com detalhes do produto. |
| `CreateProductController` | `body.name`, `price`, `category`, `imageUrl`, `barCode` | `CreateProductUseCase.execute(input)` cria `Product` e chama `ProductRepository.save`. | `201` com o produto criado. |
| `AddStockEntryController` | `params.id`, `body.quantity` | `AddStockEntryUseCase.execute({ productId, quantity })` busca o produto, cria `StockMovement` `ENTRY` e persiste o movimento. | `201` com `{ "ok": true }`. |
| `AddStockExitController` | `params.id`, `body.quantity` | `AddStockExitUseCase.execute({ productId, quantity })` busca o produto, cria `EXIT`, rejeita saldo insuficiente e persiste. | `201` com `{ "ok": true }`. |
| `ListProductMovementsController` | `params.id` | `ListProductMovementsUseCase.execute({ productId })` confirma a existência do produto e lista seus movimentos. | `200` com array de movimentos. |

## Verificações e respostas locais

- **Criação:** requer `name` string, `price` number e `category` string. O
  controller limita `category` a `ProductCategory`: `FOOD`, `ELECTRONICS`,
  `CLOTHING`, `CLEANING`, `OFFICE` e `OTHER`. Campos opcionais só seguem para o
  caso de uso se forem strings. Nome em branco e preço negativo ainda são rejeitados
  pelo caso de uso.
- **Entrada e saída:** requerem `id` string não vazia e `quantity` number válido,
  não `NaN` e maior que zero. `AddStockEntryUseCase` repete apenas a verificação
  `quantity <= 0`; não repete a checagem de tipo nem de `NaN`. Já
  `AddStockExitUseCase` repete `typeof quantity`, `Number.isNaN(quantity)` e
  `quantity <= 0`. Ambos verificam que o produto existe, e a saída valida saldo pelo
  agregado `Product`.
- **Detalhe e movimentos:** exigem `id` não vazio. Para detalhes, o controller
  devolve diretamente `{ "message": "Id do produto inválido" }` com `400`; para
  movimentos, lança `AppError("Parâmetro id inválido.", 400)`. Essas verificações
  só são alcançadas para um segmento `:id` presente; segmento ausente não casa a
  rota parametrizada e segue o `404` padrão quando não houver outra rota aplicável.
- **Listagem de produtos:** não recebe entrada nem faz transformação além de
  serializar a projeção do caso de uso. Nenhum controller converte `price`; em
  leituras MySQL de `DECIMAL(10,2)`, esse valor tende a chegar como string por não
  haver `decimalNumbers: true` nem conversão no repositório. A criação devolve o
  `number` recebido no corpo.

## Dependências

- **Express:** `Request` e `Response` fornecem os dados de entrada e a resposta.
- **Aplicação:** cada controller depende apenas de seu caso de uso; os controllers
  que podem rejeitar a entrada importam `AppError`.
- **Domínio:** `CreateProductController` importa `ProductCategory` para conferir o
  enum. As demais regras de entidade, UUID e saldo pertencem aos casos de uso e às
  entidades, não aos controllers.
- **Rotas:** `products.routes.ts` constrói os controllers e encaminha falhas para
  `errorHandler` com `.catch(next)`.

## Contrato de falhas observado pelos controllers

As respostas de erro usam somente `message`. Para `AppError`, o status vem de sua
origem; mensagens comuns incluem `Parâmetro id inválido.`,
`Campo quantity inválido. Deve ser número > 0.`, `Categoria inválida.`,
`Produto não encontrado`, `Produto não encontrado.` e `Insufficient stock`.

Nas consultas por id, a origem também define a mensagem: falha na consulta SQL de
`findById` é convertida em `Erro ao procurar pelo id`, mas `findById` devolve
`mapRowToProduct` sem `await`. Assim, falha ao hidratar o produto ou seus movimentos
se propaga como `Erro ao buscar esse produto`, emitida pelo próprio mapeador. Em
`findAll`, o `await` dentro do laço faz erros de consulta e hidratação serem
encapsulados como `Erro ao buscar produtos no banco`.

Mensagens não previstas ou erros de infraestrutura não são tratados nos controllers:
seguem para o middleware como erro inesperado e retornam `500` com
`{ "message": "Erro de servidor" }`. Os detalhes por endpoint estão em
[`../routes/codemap.md`](../routes/codemap.md).

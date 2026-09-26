# `backend/src/http/routes/`

## Responsabilidade e composição

`products.routes.ts` é o único roteador do diretório. Ele cria um `Router` Express,
monta o grafo de dependências e registra os endpoints de produtos. O aplicativo o
monta com o prefixo `/api`; as URLs abaixo já incluem esse prefixo.

Na carga do módulo, o roteador cria, nesta sequência:

1. `MySqlStockMovementRepository`;
2. `MySqlProductRepository(stockMovementRepository)`;
3. os seis casos de uso;
4. os seis controllers correspondentes.

Cada handler usa `controller.handle(req, res).catch(next)`. Logo, uma rejeição do
controller ou do caso de uso segue para `errorHandler`; o roteador não transforma
erros nem adiciona resposta própria.

Para as rotas parametrizadas, o segmento `:id` precisa existir para que o handler
correspondente seja selecionado. Um segmento ausente não casa a rota e, quando não
há outra rota para o método/path, recebe o `404` padrão do Express. O `400` dos
controllers só se aplica a um segmento recebido que fique vazio após `trim`, como
um espaço codificado.

## Rotas e contratos

### `GET /api/products`

- **Fluxo:** `ListProductsController` → `ListProductsUseCase.execute()` →
  `ProductRepository.findAll()`.
- **Resposta `200`:** array de `{ id, name, price, category, imageUrl, quantity }`.
   `quantity` é a soma de entradas menos saídas. Quando `imageUrl` é `undefined`,
   `JSON.stringify` não inclui a propriedade. Em leituras MySQL, `price` tende a
   ser string: a coluna é `DECIMAL(10,2)`, o pool não usa `decimalNumbers: true` e
   o repositório não faz conversão.
- **Entrada:** não usa parâmetros, query nem corpo.
- **Falhas de repositório:** um erro na consulta ou na hidratação de qualquer linha
  (incluindo seus movimentos) é encapsulado por `findAll` como `400` com
  `Erro ao buscar produtos no banco`.

### `GET /api/products/:id`

- **Fluxo:** `GetProductDetailsController` →
  `GetProductDetailsUseCase.execute(id)` → `ProductRepository.findById(id)`.
- **Parâmetro:** `id` deve ser string não vazia após `trim`.
- **Resposta `200`:**

  ```json
  {
    "id": "uuid",
    "name": "Produto",
    "price": "12.50",
    "category": "FOOD",
    "imageUrl": "https://...",
    "barCode": "123",
    "quantity": 8,
    "movements": [
      { "id": "uuid", "type": "ENTRY", "quantity": 10, "createdAt": "data ISO" }
    ]
  }
  ```

  Campos opcionais com valor `undefined` são omitidos na serialização JSON. Os
  movimentos deste endpoint não incluem `productId` porque o caso de uso os projeta.
  O `price` lido do `DECIMAL(10,2)` tende a ser string pela ausência de conversão no
  pool/repositório.
- **Erro local de parâmetro:** `400` e `{ "message": "Id do produto inválido" }`
  somente para um segmento presente que fique vazio após `trim`.
- **Produto inexistente:** `404` e `{ "message": "Product not found" }`.
- **Falhas de repositório:** se a consulta SQL de `findById` falhar, retorna `400`
  com `Erro ao procurar pelo id`. `findById` retorna `mapRowToProduct` sem `await`;
  portanto, falha posterior na hidratação do produto ou dos movimentos retorna o
  `AppError` de `mapRowToProduct`, `400` com `Erro ao buscar esse produto`.

### `POST /api/products`

- **Fluxo:** `CreateProductController` →
  `CreateProductUseCase.execute(input)` → `ProductRepository.save(product)`.
- **Corpo JSON:**

  ```json
  {
    "name": "Produto",
    "price": 12.5,
    "category": "FOOD",
    "imageUrl": "https://...",
    "barCode": "123"
  }
  ```

  Obrigatórios: `name` string, `price` number e `category` string pertencente a
  `FOOD`, `ELECTRONICS`, `CLOTHING`, `CLEANING`, `OFFICE` ou `OTHER`.
  `imageUrl` e `barCode` só são encaminhados se forem strings.
- **Resposta `201`:** `{ id, name, price, category }`, com `imageUrl` e `barCode`
  quando definidos. O preço permanece o `number` recebido no corpo de criação;
  não passa por uma leitura `DECIMAL` nessa resposta.
- **Erros `400`:** tipo ausente/inválido (`Campo name inválido.`, `Campo preço
  inválido.`, `Campo categoria inválido.`), categoria fora do enum (`Categoria
  inválida.`), nome em branco (`Nome do produto é obrigatório.`), preço negativo ou
  `NaN` (`Preço inválido`) e falha encapsulada no salvamento MySQL (`Erro ao salvar
  no DB`).

### `POST /api/products/:id/stock/entry`

- **Fluxo:** `AddStockEntryController` →
  `AddStockEntryUseCase.execute({ productId: id, quantity })` → busca o produto,
  cria um `StockMovement` `ENTRY` com UUID e o salva em `StockMovementRepository`.
- **Entrada:** `id` string não vazia e corpo `{ "quantity": 3 }`, onde `quantity`
  é number, não é `NaN` e é maior que zero.
- **Resposta `201`:** `{ "ok": true }`.
- **Erros:** `400` para `id` inválido (`Parâmetro id inválido.`) ou quantidade
  inválida (`Campo quantity inválido. Deve ser número > 0.`); `404` para produto
  ausente (`Produto não encontrado`). Uma falha SQL em `findById` retorna `400`
  com `Erro ao procurar pelo id`; falha de hidratação retorna `400` com
  `Erro ao buscar esse produto`.

### `POST /api/products/:id/stock/exit`

- **Fluxo:** `AddStockExitController` →
  `AddStockExitUseCase.execute({ productId: id, quantity })` → busca o produto,
  cria um `StockMovement` `EXIT`, valida o saldo com `Product.addMovement` e salva
  o movimento.
- **Entrada:** mesmo formato da entrada: `id` não vazio e `{ "quantity": 3 }`
  com número maior que zero.
- **Resposta `201`:** `{ "ok": true }`.
- **Erros:** `400` para `id` inválido (`Parâmetro id inválido.`), quantidade inválida
  (`Campo quantity inválido. Deve ser número maior que 0.`) ou saldo insuficiente
  (`Insufficient stock`); `404` para produto ausente (`Produto não encontrado`).
  Falha SQL em `findById` retorna `400` com `Erro ao procurar pelo id`, enquanto
  falha de hidratação retorna `400` com `Erro ao buscar esse produto`.
- **Concorrência:** `Product.addMovement` protege apenas a saída individual contra
  o saldo do agregado carregado. Sem transação ou bloqueio, saídas concorrentes
  podem usar o mesmo saldo observado e excedê-lo após ambas serem persistidas.

### `GET /api/products/:id/movements`

- **Fluxo:** `ListProductMovementsController` →
  `ListProductMovementsUseCase.execute({ productId: id })` → verifica que o produto
  existe e chama `StockMovementRepository.findByProductId(id)`.
- **Parâmetro:** `id` deve ser string não vazia após `trim`.
- **Resposta `200`:** array de entidades serializadas como
  `{ id, productId, type, quantity, createdAt }`. `createdAt` é serializado como
  string ISO. O repositório MySQL ordena por `created_at DESC`.
- **Erros:** `400` com `Parâmetro id inválido.` ou `404` com
  `Produto não encontrado.`. Na verificação do produto, erro SQL de `findById`
  produz `400` com `Erro ao procurar pelo id`; uma falha de hidratação produz
  `400` com `Erro ao buscar esse produto`. Erro na consulta posterior e direta de
  movimentos não é convertido por esse repositório e chega ao middleware como `500`.

## Dependências externas e de camadas

- `express`: fornece `Router` e a assinatura dos handlers.
- `../controllers/*`: adapta cada endpoint ao caso de uso correspondente.
- `../../application/use-cases/*`: regras de criação, consulta e movimentação;
  `AppError` define falhas esperadas.
- `../../infra/db/mysql/repositories/*`: implementações concretas injetadas nos
  casos de uso. `MySqlProductRepository` também usa o repositório de movimentos ao
  reconstruir produtos consultados.
- `src/app.ts`: aplica o prefixo `/api` e instala o middleware de erro que recebe
  as rejeições encaminhadas por `next`.

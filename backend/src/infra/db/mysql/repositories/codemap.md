# `backend/src/infra/db/mysql/repositories/`

## Responsabilidade e contratos

- [`MySqlProductRepository.ts`](MySqlProductRepository.ts) implementa [`ProductRepository`](../../../../domain/repositories/ProductRepository.ts): `save`, `findById` e `findAll`.
- [`MySqlStockMovementRepository.ts`](MySqlStockMovementRepository.ts) implementa [`StockMovementRepository`](../../../../domain/repositories/StockMovementRepository.ts): `save` e `findByProductId`.

Ambos usam o pool global de [`../connection.ts`](../connection.ts) e SQL parametrizado com `db.execute`. `MySqlProductRepository` recebe uma implementação de `StockMovementRepository` no construtor para reconstruir o agregado; a composição atual injeta `MySqlStockMovementRepository` em [`backend/src/http/routes/products.routes.ts`](../../../../http/routes/products.routes.ts).

## Queries e fluxos

### Produtos

| Método | SQL/fluxo |
| --- | --- |
| `save(product)` | `INSERT INTO products (id, name, quantity, price, category, image_url, bar_code) VALUES (?, ..., ?)`; `imageUrl` e `barCode` ausentes viram `NULL`. A quantidade enviada é o getter calculado do agregado. |
| `findById(id)` | `SELECT * FROM products WHERE id = ? LIMIT 1`. Retorna `null` sem resultado; caso contrário chama `mapRowToProduct`. |
| `findAll()` | `SELECT * FROM products`, depois chama `mapRowToProduct` **sequencialmente** para cada linha. Não há `ORDER BY`, filtros ou paginação. |
| `mapRowToProduct(row)` | Cria `Product` a partir de `name`, `price`, `category`, `image_url` e `bar_code`; substitui o UUID criado pelo construtor via `(product as any).id = row.id`; busca `findByProductId(product.id)` e adiciona cada movimento ao agregado. `row.quantity` não é lido. |

`findById` faz duas queries quando encontra produto (produto + movimentos). `findAll` faz uma query de produtos mais uma query de movimentos por produto: N produtos resultam em **1 + N** queries, executadas em série. Para `GET /products/:id/movements`, o caso de uso primeiro chama `productRepository.findById` para verificar o produto e depois busca os movimentos novamente; para um produto existente são três queries e a última repete a query feita na hidratação.

### Movimentos

| Método | SQL/fluxo |
| --- | --- |
| `save(movement)` | Converte com [`../mappers/StockMovementMapper.ts`](../mappers/StockMovementMapper.ts) e executa `INSERT INTO stock_movements (id, product_id, type, quantity, created_at) VALUES (?, ..., ?)`. |
| `findByProductId(productId)` | `SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC`, então converte todas as linhas para domínio. Não há `LIMIT` ou paginação. |

## Hidratação e erros reais

- `mapRowToProduct` ignora `products.quantity`: o saldo devolvido pelo agregado é a soma dos movimentos. Como não existe `UPDATE products`, a coluna inserida pode ficar divergente do saldo real.
- A query de movimentos em ordem decrescente é incompatível com `Product.addMovement`: uma saída é validada contra os movimentos já adicionados. Históricos normais com saída mais recente que as entradas podem lançar `Insufficient stock` durante a leitura, mesmo que o saldo final seja válido.
- Os métodos de produto capturam **qualquer** erro de driver, mapper, entidade ou repositório de movimentos e lançam um novo `AppError` 400 genérico (`"Erro ao salvar no DB"`, `"Erro ao procurar pelo id"`, `"Erro ao buscar produtos no banco"` ou `"Erro ao buscar esse produto"`). A causa original e seu status são perdidos.
- Os métodos de movimentos não capturam erros: falhas do pool/SQL e validações do mapper/entidade são propagadas como recebidas. Portanto, o comportamento de erro não é uniforme entre os dois repositórios.
- Não há transação nem lock entre a leitura/hidratação de `Product` e o `INSERT` de um novo movimento. Duas saídas concorrentes podem ambas validar o mesmo saldo antes de persistirem.
- Linhas são tipadas como `any[]`, queries usam `SELECT *` e não há validação de schema. Alterações no banco podem falhar tardiamente ou hidratar dados incorretos.

# backend/src/infra/db/mysql/repositories/

## Produtos

`MySqlProductRepository` implementa `ProductRepository`:

| Método | Consulta e resultado |
| --- | --- |
| `save` | `INSERT INTO products` com `quantity` inicial e preço formatado a partir de `priceCents` em duas casas. |
| `findById` | `SELECT` por `id` com `LIMIT 1`; retorna `Product` ou `null`. |
| `findPage` | `ORDER BY id ASC LIMIT limit+1 OFFSET (page-1)*limit`; devolve entidades para a aplicação calcular `hasNext`. |

A linha é tipada como `ProductRow`, sem `SELECT *`. `mapRowToProduct` usa o `id` e o saldo persistidos, converte `DECIMAL` por `Number(row.price)` e valida os dados ao construir `Product`. A consulta de listagem faz uma única query, independentemente da quantidade de produtos retornados. As exceções não são encapsuladas como `AppError`.

## Movimentos

`MySqlStockMovementRepository.applyMovement` retorna `applied`, `product_not_found`, `insufficient_stock` ou `stock_limit_exceeded`. Após `beginTransaction`, a consulta `SELECT quantity FROM products WHERE id = ? FOR UPDATE` bloqueia o produto. A saída exige saldo suficiente; a entrada respeita o teto do `INT` assinado. Se válida, a operação atualiza `products.quantity` e insere `stock_movements` na mesma conexão antes do `commit`. Um retorno antecipado ou erro após iniciar a transação aciona `rollback`; a conexão é sempre liberada.

`findPageByProductId` filtra por `product_id`, ordena por `created_at DESC, id DESC` e usa `limit+1`/`offset` para paginação. Não verifica existência do produto; o caso de uso faz essa consulta. Erros do driver propagam até o middleware HTTP, que distingue indisponibilidade conhecida (`503`) de erro inesperado (`500`).

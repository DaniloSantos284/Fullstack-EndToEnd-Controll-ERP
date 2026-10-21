# backend/src/application/use-cases/

## Contratos

| Caso de uso | Entrada | Saída e efeito |
| --- | --- | --- |
| `CreateProductUseCase` | nome, preço, categoria e opcionais | Cria `Product`, persiste e devolve campos cadastrais. |
| `ListProductsUseCase` | `{ page, limit }` | `{ data, pagination }` com `id`, `name`, `price`, `category`, `imageUrl` e `quantity`. |
| `GetProductDetailsUseCase` | ID e `{ page, limit }` | Produto, página `movements` e `movementsPagination`. |
| `ListProductMovementsUseCase` | ID, `page` e `limit` | Página de `StockMovement` após confirmar o produto. |
| `AddStockEntryUseCase` | ID e quantidade | Cria `ENTRY` e chama `applyMovement`. |
| `AddStockExitUseCase` | ID e quantidade | Cria `EXIT` e chama `applyMovement`. |

Os casos recebem apenas `ProductRepository` e/ou `StockMovementRepository`. Listar produtos consulta `findPage`; detalhes e histórico consultam `findById` mais `findPageByProductId`. Não há consulta duplicada de movimentos na verificação de existência: `findById` hidrata o produto a partir de `products`, sem carregar histórico.

## Regras e falhas

`CreateProductUseCase` valida nome não vazio e preço não negativo antes de construir `Product`; a entidade valida também finitude, precisão monetária, categoria e limites de colunas. Entrada e saída exigem quantidade inteira positiva dentro do limite de `INT`; a entidade `StockMovement` repete essa invariante. `applyMovement` retorna `applied`, `product_not_found`, `insufficient_stock` ou `stock_limit_exceeded`. Os casos traduzem os três últimos para `AppError` com `404` ou `409`. Falhas SQL propagam até o middleware HTTP.

O saldo é armazenado em `products.quantity` e modificado atomicamente pelo repositório. `Product` não contém coleção de movimentos nem executa validação de saída; essa validação ocorre dentro da transação que bloqueia a linha do produto. Os casos retornam `price` numérico no JSON; a entidade guarda `priceCents` internamente.

## Paginação

As consultas MySQL devolvem até `limit+1` linhas, em ordem determinística. `pagination.ts` expõe no máximo `limit` itens e calcula `hasNext` pelo registro extra. No HTTP, `page` tem padrão `1` e máximo `1.000.000`; `limit` tem padrão `20` e máximo `100`. Os casos assumem parâmetros já validados pelo adaptador.

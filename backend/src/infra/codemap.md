# `backend/src/infra/`

## Responsabilidade

Adaptadores de infraestrutura. Atualmente o único adaptador é a persistência MySQL em [`backend/src/infra/db/mysql/`](db/mysql/): ele implementa os contratos do domínio usando `mysql2/promise`.

## Estrutura e integração

- [`db/mysql/connection.ts`](db/mysql/connection.ts) exporta o pool global `db`.
- [`db/mysql/repositories/`](db/mysql/repositories/) implementa `ProductRepository` e `StockMovementRepository`, definidos respectivamente em [`backend/src/domain/repositories/ProductRepository.ts`](../domain/repositories/ProductRepository.ts) e [`backend/src/domain/repositories/StockMovementRepository.ts`](../domain/repositories/StockMovementRepository.ts).
- [`db/mysql/mappers/`](db/mysql/mappers/) traduz a representação da tabela `stock_movements` para a entidade de domínio.

As instâncias concretas são compostas em [`backend/src/http/routes/products.routes.ts`](../http/routes/products.routes.ts): `MySqlStockMovementRepository` é criado primeiro e injetado em `MySqlProductRepository`, pois a leitura de um produto hidrata seus movimentos.

## Fluxo de persistência

Casos de uso dependem somente das interfaces de repositório. A implementação MySQL executa SQL parametrizado por `db.execute`, cria/hidrata entidades de domínio e devolve agregados `Product` ou movimentos `StockMovement`. A quantidade de um produto é calculada a partir dos movimentos, não obtida como fonte de verdade da coluna `products.quantity`.

Os detalhes do contrato do pool, SQL, hidratação e limitações estão nos codemaps de [`db/`](db/) e [`db/mysql/`](db/mysql/).

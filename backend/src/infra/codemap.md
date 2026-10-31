# backend/src/infra/

Os adaptadores de infraestrutura são MySQL em [db/mysql/](db/mysql/codemap.md) e verificação JWT em [security/](security/codemap.md). O adaptador MySQL traduz as portas de repositório do domínio para consultas `mysql2/promise` e mantém o pool compartilhado em `db/mysql/connection.ts`.

`MySqlProductRepository` grava e lê produtos com o saldo materializado da coluna `products.quantity`. `MySqlStockMovementRepository` aplica movimentos em uma transação com lock do produto e também consulta o histórico. `StockMovementMapper` traduz `ENTRY`/`EXIT` para `in`/`out`. Casos de uso dependem das interfaces do domínio; `http/routes/products.routes.ts` instancia os adaptadores concretos.

O DDL inicial e a migração de dados existentes ficam em `../../../db/`, fora de `backend/`. Não há ORM; as queries usam parâmetros posicionais. Erros de driver não são convertidos nos repositórios e chegam ao tratamento HTTP.

`JwksAccessTokenVerifier` implementa a porta `AccessTokenVerifier` da aplicação com `jose`, usando JWKS remoto configurado por ambiente. O endpoint HTTP decide qual escopo exigir pelo método original encaminhado pelo Nginx.

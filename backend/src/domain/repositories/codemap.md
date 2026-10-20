# Portas de repositório

`ProductRepository` fornece `save`, `findById` e `findPage({page,limit})`. `StockMovementRepository` fornece `applyMovement` e `findPageByProductId`. As consultas paginadas retornam até `limit+1` itens; a aplicação corta a linha extra e calcula `hasNext`.

`applyMovement` retorna `applied`, `product_not_found`, `insufficient_stock` ou `stock_limit_exceeded`. Sua implementação MySQL faz lock, validação e gravação de saldo/movimento numa única `PoolConnection` e transação. A aplicação não depende de SQL nem coordena commits.

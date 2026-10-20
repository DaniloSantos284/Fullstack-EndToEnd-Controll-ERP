# backend/src/infra/db/mysql/mappers/

`StockMovementMapper` converte entre a entidade `StockMovement` e as colunas `id`, `product_id`, `type`, `quantity` e `created_at` de `stock_movements`.

- `toPersistence` grava `ENTRY` como `in` e `EXIT` como `out`, preservando IDs, quantidade e data.
- `toDomain` converte `in` em `ENTRY` e qualquer outro valor em `EXIT`; constrói uma entidade que valida tipo, quantidade e data.

O tipo TypeScript `StockMovementRow` descreve a linha esperada do MySQL, mas não valida o conteúdo em tempo de execução. Assim, um valor persistido inesperado de `type` seria interpretado como saída. O `ENUM('in','out')` do schema evita esse caso em dados válidos. A ordenação e paginação pertencem à consulta do repositório, não ao mapper.

# backend/src/infra/db/mysql/mappers/

`StockMovementMapper` converte entre a entidade `StockMovement` e as colunas `id`, `product_id`, `type`, `quantity` e `created_at` de `stock_movements`.

- `toPersistence` grava `ENTRY` como `in` e `EXIT` como `out`, preservando IDs, quantidade e data.
- `toDomain` converte `in` em `ENTRY` e `out` em `EXIT`; rejeita com erro qualquer outro valor antes de construir a entidade, que também valida tipo, quantidade e data.

O tipo TypeScript `StockMovementRow` descreve a linha esperada do MySQL, mas o mapper também valida `type` em tempo de execução e rejeita dados inesperados. O `ENUM('in','out')` do schema evita esse caso em dados válidos. A ordenação e paginação pertencem à consulta do repositório, não ao mapper.

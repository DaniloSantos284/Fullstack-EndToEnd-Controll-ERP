# backend/src/domain/enums/

`ProductCategory` aceita `FOOD`, `ELECTRONICS`, `CLOTHING`, `CLEANING`, `OFFICE` e `OTHER`. A coluna `products.category` usa o mesmo conjunto como `ENUM` MySQL.

`StockMovementType` distingue `ENTRY` e `EXIT` no domínio e no JSON. `StockMovementMapper` converte esses valores para `in` e `out` na coluna `stock_movements.type`. A entidade `StockMovement` valida o enum em tempo de execução; o mapper de leitura rejeita com erro qualquer valor persistido diferente de `in` ou `out`, embora o schema MySQL já restrinja a coluna a esses valores.

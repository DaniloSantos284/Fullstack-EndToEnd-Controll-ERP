# `backend/src/infra/db/mysql/mappers/`

## Responsabilidade

Conversão entre a linha MySQL de `stock_movements` e [`StockMovement`](../../../../domain/entities/StockMovement.ts). Há um único mapper: [`StockMovementMapper.ts`](StockMovementMapper.ts). Produtos não possuem mapper; sua reconstrução está embutida em [`../repositories/MySqlProductRepository.ts`](../repositories/MySqlProductRepository.ts).

## Conversões

### `StockMovementMapper.toDomain(row)`

Espera uma linha com `id`, `product_id`, `type`, `quantity` e `created_at`. Cria `StockMovement` com:

- `product_id` -> `productId`;
- `"in"` -> `StockMovementType.ENTRY`;
- qualquer valor diferente de `"in"` -> `StockMovementType.EXIT`;
- `quantity` e `created_at` passados sem coerção.

O construtor da entidade valida `quantity > 0`; linhas com quantidade inválida fazem a leitura falhar. Embora o tipo local declare `created_at: Date`, o mapper não converte strings em `Date`, nem valida UUID, `product_id` ou tipo de movimento. Em especial, um valor persistido inválido para `type` é silenciosamente interpretado como saída em vez de causar erro.

### `StockMovementMapper.toPersistence(movement)`

Produz o objeto usado no `INSERT`: `id`, `product_id`, `type`, `quantity` e `created_at`. `movement.isEntry()` define `"in"`; todo outro tipo vira `"out"`. O valor de `createdAt` é o da entidade, sem normalização de timezone/data.

## Uso e limites

[`../repositories/MySqlStockMovementRepository.ts`](../repositories/MySqlStockMovementRepository.ts) chama `toPersistence` antes de salvar e passa `toDomain` diretamente para `Array.map` após buscar as linhas. Não há tipo de linha compartilhado com o driver, validação de schema ou captura/tradução de erros no mapper.

A ordem `created_at DESC` vem da query do repositório. Ao hidratar um `Product`, os movimentos dessa ordem são adicionados um a um e as saídas são validadas contra o saldo parcial; uma saída válida no histórico pode, assim, impedir a própria hidratação se suas entradas vierem depois na lista. O mapper não corrige nem sinaliza essa inconsistência de ordenação.

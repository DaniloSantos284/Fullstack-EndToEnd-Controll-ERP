# `backend/src/domain/repositories/`

## Responsabilidade

Declara as portas de persistência consumidas pelos casos de uso. As interfaces mantêm a aplicação dependente de `Product` e `StockMovement`, sem referenciar MySQL, SQL ou HTTP.

## Contratos e invariantes atuais

### `ProductRepository`

- `save(product: Product): Promise<void>` recebe um produto para gravação, sem retorno.
- `findById(id: string): Promise<Product | null>` retorna um produto ou `null` quando ausente.
- `findAll(): Promise<Product[]>` retorna uma lista de produtos.

### `StockMovementRepository`

- `save(movement: StockMovement): Promise<void>` recebe uma movimentação para gravação, sem retorno.
- `findByProductId(productId: string): Promise<StockMovement[]>` retorna as movimentações associadas a um produto.

As interfaces não acrescentam validação de entidade: elas pressupõem que os objetos recebidos já foram construídos conforme os contratos das entidades.

## Fluxos atuais

1. Criação de produto chama `ProductRepository.save`; listagem, detalhe e validação de entradas/saídas chamam `findAll` ou `findById`.
2. Entradas e saídas persistem o novo movimento por `StockMovementRepository.save` depois da validação no agregado. A listagem de movimentos usa `findByProductId` diretamente após confirmar que o produto existe.
3. `MySqlProductRepository` implementa a porta de produtos e, durante a reidratação, chama a porta de movimentos para montar o agregado. `MySqlStockMovementRepository` implementa a porta de movimentos com `StockMovementMapper`.

## Consumidores e integrações

- `CreateProductUseCase`, `ListProductsUseCase` e `GetProductDetailsUseCase` recebem `ProductRepository` por construtor.
- `AddStockEntryUseCase`, `AddStockExitUseCase` e `ListProductMovementsUseCase` recebem as duas interfaces.
- `http/routes/products.routes.ts` compõe `MySqlStockMovementRepository` e `MySqlProductRepository`, injeta o primeiro no segundo e fornece ambos aos casos de uso.
- As implementações MySQL usam a conexão `infra/db/mysql/connection`; a implementação de movimentos mapeia o contrato de domínio para as tabelas `stock_movements`, e a de produtos para `products`.

## Limitações reais

- Os contratos não especificam semântica de `save` (criação, atualização ou idempotência), nem regras de erro, ordenação, paginação, filtros ou remoção. A implementação MySQL atual de `save` em ambos os repositórios executa somente `INSERT`.
- Não há contrato nem implementação de transação que una a validação do saldo, a leitura do produto e a gravação do movimento. O contrato, portanto, não oferece proteção contra saídas concorrentes que ultrapassem o saldo.
- `findByProductId` não promete ordenação, embora a implementação MySQL retorne `created_at DESC`. `MySqlProductRepository` reaplica essa sequência ao reconstruir o agregado, fazendo a regra de saldo depender de uma ordem que a porta não define.
- `MySqlProductRepository.findAll` reidrata cada produto e consulta seus movimentos separadamente, resultando em uma consulta adicional por produto.
- O contrato de produtos não expõe uma forma de atualizar o saldo persistido; a implementação grava `products.quantity` no `INSERT`, enquanto os movimentos posteriores são inseridos apenas em `stock_movements`.

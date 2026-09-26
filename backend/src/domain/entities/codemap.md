# `backend/src/domain/entities/`

## Responsabilidade

Contém o agregado `Product` e a entidade `StockMovement`. Juntos, eles representam o catálogo mínimo e o histórico que determina o saldo de estoque.

## Contratos e invariantes atuais

### `Product`

- Recebe `name`, `price`, `category` e, opcionalmente, `imageUrl`, `barCode` e movimentos iniciais; gera `id` com `randomUUID()`.
- Rejeita nome ausente ou composto apenas por espaços e preço menor que zero, lançando `AppError` com status 400.
- `quantity` é calculada sob demanda pela soma de `movement.getSignedQuantity()`; não há campo de saldo na entidade.
- `addMovement` aceita uma entrada sem limite de quantidade. Para uma saída, só a inclui se o saldo calculado for suficiente; caso contrário, lança `AppError` 400.
- `movements` retorna uma nova matriz, evitando a alteração da coleção interna por operações sobre a matriz retornada.

### `StockMovement`

- Requer `id`, `productId`, `type` e quantidade maior que zero; `createdAt` é preenchido com `new Date()` quando não informado.
- `id` e `productId` são tipados como `string`, mas o construtor não valida formato UUID. Os casos de uso atuais de entrada e saída fornecem o `id` gerado por `randomUUID()`.
- Os campos são declarados `readonly`, restrição de reatribuição do TypeScript que não garante imutabilidade em runtime. Em especial, `createdAt` referencia um `Date` mutável. `isEntry`, `isExit` e `getSignedQuantity` derivam o comportamento de `StockMovementType`; somente `EXIT` gera quantidade negativa.

## Fluxos atuais

1. A criação do produto instancia `Product` sem movimentos e o persiste.
2. Os casos de uso de entrada e saída criam um `StockMovement`, chamam `product.addMovement` e, se a regra de saldo permitir, persistem apenas o movimento.
3. `MySqlProductRepository` recria o produto a partir da linha da tabela, busca seus movimentos via `StockMovementRepository` e os adiciona ao agregado. Consultas leem `quantity` e `movements` reconstruídos.

## Consumidores e integrações

- `CreateProductUseCase` instancia e expõe dados de `Product`.
- `AddStockEntryUseCase` e `AddStockExitUseCase` instanciam `StockMovement` e usam `Product.addMovement` para aplicar a regra de saldo.
- `ListProductsUseCase` e `GetProductDetailsUseCase` leem o saldo derivado; este último também serializa os movimentos. `ListProductMovementsUseCase` retorna movimentos do repositório.
- `MySqlProductRepository` reidrata `Product`; `MySqlStockMovementRepository` e `StockMovementMapper` persistem/reconstroem `StockMovement`.
- Ambas as entidades dependem de `AppError` definido em `application/use-cases/errors`.

## Limitações reais

- O construtor de `Product` não valida `NaN`, infinito nem a pertença de `category` a `ProductCategory`. Em JavaScript, `NaN < 0` é falso; chamadas diretas ao construtor podem criar um produto com esse preço.
- `Product` aceita movimentos iniciais diretamente, sem aplicar a verificação de saldo de `addMovement`. Também não verifica se `movement.productId` corresponde ao próprio `id` ao adicionar um movimento.
- Tipos de movimento inválidos em tempo de execução não são rejeitados: como apenas `EXIT` é tratado como saída, qualquer outro valor é contabilizado como entrada por `getSignedQuantity`.
- Embora `id` e `productId` sejam strings obrigatórias pelo tipo, a entidade não valida que sejam UUIDs nem que `createdAt` seja uma data válida. `createdAt` também pode ser mutado em runtime pela referência de `Date` exposta na entidade.
- `imageUrl` e `barCode` só são atribuídos quando forem valores truthy; strings vazias recebidas no construtor são descartadas. O nome validado também é preservado sem normalização.
- `price` e `category` são declarados `private`, embora casos de uso e o repositório MySQL os acessem externamente. Isso viola a visibilidade do TypeScript e impede a verificação de tipos sem ignorar esse erro.
- A reidratação MySQL altera `id`, declarado `readonly`, por meio de `(product as any)`. Além de contornar o tipo, ela depende da ordem de aplicação dos movimentos para a validação do agregado.

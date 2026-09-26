# `backend/src/domain/enums/`

## Responsabilidade

Centraliza os conjuntos nominais usados pelo domínio para classificar produtos e determinar o efeito de um movimento sobre o estoque.

## Contratos e invariantes atuais

- `ProductCategory` declara os valores literais `FOOD`, `ELECTRONICS`, `CLOTHING`, `CLEANING`, `OFFICE` e `OTHER`.
- `StockMovementType` declara `ENTRY` e `EXIT`.
- Uma entidade `StockMovement` é entrada somente quando seu tipo é `ENTRY` e saída somente quando é `EXIT`; o cálculo assinado torna toda saída negativa e os demais valores positivos.
- As enums fornecem tipagem TypeScript e valores de execução, mas não há função de validação neste diretório.

## Fluxos atuais

1. No fluxo HTTP de criação, `CreateProductController` rejeita categorias que não pertencem a `ProductCategory` antes de chamar o caso de uso; a categoria validada é então armazenada no `Product`.
2. Os casos de uso de estoque fixam o tipo como `ENTRY` ou `EXIT` ao criar um movimento.
3. `Product.quantity` consome esse tipo indiretamente por `StockMovement.getSignedQuantity`.
4. Na infraestrutura MySQL, `StockMovementMapper` converte `ENTRY`/`EXIT` para `in`/`out` na persistência e faz o caminho inverso na leitura; categorias são passadas ao banco e reconstruídas por asserção de tipo.

## Consumidores e integrações

- `Product` usa `ProductCategory`; `StockMovement` usa `StockMovementType` para suas regras de classificação.
- `CreateProductUseCase`, `ListProductsUseCase` e `GetProductDetailsUseCase` usam `ProductCategory` nos contratos de entrada ou saída.
- `AddStockEntryUseCase`, `AddStockExitUseCase` e `GetProductDetailsUseCase` usam `StockMovementType`.
- `MySqlProductRepository` converte `row.category` para `ProductCategory` apenas em nível de tipo. `StockMovementMapper` integra `StockMovementType` com os valores físicos `in` e `out`.

## Limitações reais

- Este diretório não fornece funções de validação em tempo de execução. No fluxo HTTP de criação, porém, `CreateProductController` valida a categoria contra `ProductCategory` e rejeita valores inválidos antes de construir o produto.
- `ProductCategory` não é validada por `Product`; assim, uma categoria inválida só alcança a entidade por chamadas internas que contornem o fluxo HTTP, por tipagem TypeScript burlada ou por dados persistidos. A asserção `row.category as ProductCategory` do repositório também não verifica o valor lido do banco.
- O mapper interpreta qualquer tipo persistido diferente de `"in"` como `EXIT`; portanto, um valor de banco inesperado é silenciosamente convertido em saída.
- O mapper grava `"out"` sempre que `movement.isEntry()` for falso. Assim, um tipo de movimento inválido em tempo de execução é persistido como saída, enquanto o cálculo de saldo da entidade o trata como entrada.

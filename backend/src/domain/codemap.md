# `backend/src/domain/`

## Responsabilidade

Define o modelo de domínio de produtos e movimentações de estoque, os vocabulários fechados usados por esse modelo e as portas de persistência. O estado de estoque é derivado dos movimentos; não há uma entidade de estoque ou um saldo mutável separado no domínio.

## Contratos e invariantes atuais

- `Product` possui UUID criado no construtor, nome obrigatório (não vazio após `trim()`), preço não negativo, categoria, campos opcionais de imagem/código de barras e uma coleção interna de movimentos.
- A quantidade de um produto é a soma das quantidades assinadas dos movimentos: entradas somam e saídas subtraem.
- `Product.addMovement` impede uma saída cuja quantidade seja maior que o saldo calculado naquele instante.
- `StockMovement` exige quantidade estritamente positiva, associa um `productId`, registra o instante de criação quando ausente e classifica-se como `ENTRY` ou `EXIT` pelos enums.
- `ProductRepository` expõe gravação, busca por id e listagem; `StockMovementRepository` expõe gravação e busca por produto. Ambos retornam `Promise` e não definem detalhes de banco.

## Fluxos atuais

1. `CreateProductUseCase` cria um `Product`, que gera seu id, e o envia para `ProductRepository.save`.
2. Nas entradas e saídas, os respectivos casos de uso carregam o produto, criam um `StockMovement` com UUID, adicionam-no ao agregado para validar o saldo e o gravam via `StockMovementRepository`.
3. Para consultas, a implementação MySQL de produtos reconstrói um `Product` e carrega seus movimentos. `quantity` e `movements` são então usados pelos casos de uso de listagem e detalhes.

## Consumidores e integrações

- Casos de uso: `CreateProductUseCase`, `AddStockEntryUseCase`, `AddStockExitUseCase`, `ListProductsUseCase`, `GetProductDetailsUseCase` e `ListProductMovementsUseCase` consomem as entidades, enums e/ou interfaces deste diretório.
- Infraestrutura: `MySqlProductRepository` e `MySqlStockMovementRepository` implementam as portas; `StockMovementMapper` traduz movimentos entre o domínio e os valores MySQL `in`/`out`.
- HTTP: `http/routes/products.routes.ts` instancia as implementações MySQL e injeta-as nos casos de uso que atendem as rotas de produtos e estoque.
- As entidades lançam `AppError`, importado de `application/use-cases/errors`; portanto, o domínio tem uma dependência direta da camada de aplicação para sinalizar violações.

## Limitações reais

- A reconstrução de `Product` pela implementação MySQL cria primeiro um UUID novo e depois altera o campo `readonly id` por meio de `(product as any)`, pois o construtor não recebe um id.
- O repositório MySQL busca movimentos em ordem decrescente de criação, mas os reaplica com `addMovement`. Assim, uma saída recente pode ser validada antes das entradas anteriores e fazer a reconstrução falhar por saldo insuficiente, mesmo que a sequência cronológica tenha saldo.
- A coluna `products.quantity` é escrita na criação, mas entradas e saídas gravam apenas `stock_movements`; o saldo usado pelo domínio é recalculado pelos movimentos e não atualiza essa coluna.
- As interfaces não estabelecem transação, ordenação de movimentos, paginação, atualização, remoção ou garantias de concorrência. Em particular, duas saídas concorrentes podem validar o mesmo saldo antes de persistirem seus movimentos.

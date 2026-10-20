# Domínio

`entities/` contém `Product` e `StockMovement`; `enums/` contém categorias e tipos; `repositories/` define portas para persistência e paginação; `errors/DomainError.ts` expressa invariantes inválidas sem depender de HTTP ou da aplicação.

`Product.quantity` reconstitui o saldo materializado. `priceCents` mantém valor monetário em centavos inteiros; o getter `price` serve ao contrato JSON. `StockMovement` representa entradas e saídas. A porta `applyMovement` comunica resultado de negócio (`applied`, produto ausente, saldo insuficiente, limite excedido) sem expor MySQL.

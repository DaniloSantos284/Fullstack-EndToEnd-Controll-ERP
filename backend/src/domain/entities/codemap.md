# Entidades

`Product` valida nome, categoria, preço com duas casas, limites de colunas e saldo de `INT`. Um produto novo começa com saldo zero; um produto lido do banco usa o saldo persistido. O preço é guardado em `priceCents` e exposto pelo getter `price`.

`StockMovement` valida ID, produto, tipo, quantidade positiva e data. `getSignedQuantity()` devolve a quantidade positiva para entrada e negativa para saída. As entidades lançam `DomainError`, que não conhece status HTTP; o adaptador HTTP traduz validação de comandos para `400`.

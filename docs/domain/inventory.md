# Domínio de estoque

`Product` guarda `id`, nome, categoria, preço em `priceCents`, quantidade materializada e metadados opcionais. `price` é um getter numérico para o contrato JSON existente. Um produto novo começa com quantidade zero; ao reconstituir uma linha do banco, a entidade recebe a quantidade persistida sem reaplicar movimentos.

`StockMovement` guarda ID, ID do produto, tipo `ENTRY`/`EXIT`, quantidade inteira positiva e data válida. Na persistência, os tipos são `in`/`out`. O mapper rejeita qualquer tipo de linha inesperado; não transforma silenciosamente em saída.

Invariantes:

- Nome não vazio, até 255 caracteres; categoria em `FOOD`, `ELECTRONICS`, `CLOTHING`, `CLEANING`, `OFFICE` ou `OTHER`.
- Preço entre 0 e 99.999.999,99, com até dois decimais. Saldo e preço persistido usam centavos inteiros; ponto flutuante aparece apenas na validação/conversão da entrada (`price * 100` com tolerância de `EPSILON`), nunca na aritmética de saldo.
- Quantidade e saldo inteiros de 0 a 2.147.483.647; cada movimento tem quantidade de 1 a 2.147.483.647.
- Uma saída não pode tornar o saldo negativo. Uma entrada não pode exceder o máximo da coluna MySQL.
- `products.quantity` é a fonte de verdade para leituras; movimentos preservam o histórico. Uma transação mantém ambos sincronizados para comandos da API.

Os casos de uso de entrada e saída não executam uma consulta prévia separada: chamam `StockMovementRepository.applyMovement`, que devolve `applied`, `product_not_found`, `insufficient_stock` ou `stock_limit_exceeded`. Isso evita a janela entre validação e gravação sob concorrência.

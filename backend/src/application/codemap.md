# backend/src/application/

A aplicação reúne seis casos de uso em `use-cases/`, o helper `pagination.ts` e a porta `security/AccessTokenVerifier.ts`. Os casos recebem portas de repositório do domínio pelo construtor; não conhecem Express nem SQL. O roteador HTTP compõe as implementações MySQL concretas. O verificador de token implementa uma porta separada, usada pelo endpoint interno do gateway.

| Operação | Dependências | Resultado |
| --- | --- | --- |
| Criar produto | `ProductRepository` | Dados do produto criado. |
| Listar produtos | `ProductRepository` | Página de resumos com saldo materializado. |
| Detalhar produto | Ambas as portas | Produto e página de movimentos. |
| Listar movimentos | Ambas as portas | Página de entidades `StockMovement`. |
| Entrada/saída | `StockMovementRepository` | Confirmação implícita após `applyMovement`. |

`pagination.ts` transforma um array de até `limit+1` registros em `{ data, pagination: { page, limit, hasNext } }`; o repositório busca o item extra e o helper o remove de `data`. A entrada HTTP limita `page` e `limit` antes de chamar os casos.

Os comandos de movimento criam a entidade e chamam `applyMovement`. Essa porta encapsula a atomicidade do saldo; os casos traduzem produto ausente para `404` e conflitos de saldo/limite para `409`. `AppError` representa falhas esperadas da aplicação; `DomainError` pertence ao domínio e `HttpError` ao adaptador HTTP.

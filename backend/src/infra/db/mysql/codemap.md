# `backend/src/infra/db/mysql/`

## Responsabilidade

Adaptador MySQL baseado em `mysql2/promise`. Contém o pool exportado por [`connection.ts`](connection.ts), o mapper de movimentos em [`mappers/`](mappers/) e implementações de portas do domínio em [`repositories/`](repositories/).

## Contrato do pool

`connection.ts` cria e exporta um único `Pool` como `db` no carregamento do módulo. Os consumidores usam diretamente `await db.execute(sql, params)`; não recebem uma conexão individual, não chamam `getConnection()` e não gerenciam `release()`.

Configuração efetivamente passada a `mysql.createPool`:

- `host`, `user`, `password` e `database` são lidos como `env.dbHost`, `env.dbUser`, `env.dbPassword` e `env.dbName`.
- `waitForConnections: true`, `connectionLimit: 10` e `queueLimit: 0` (fila sem limite) são fixos.
- Não há `port`, apesar de [`backend/src/config/env.ts`](../../../config/env.ts) validar `PORT_DB`; também ignora `DB_CONNECTION_LIMIT` e fixa o limite em 10.
- O `env` exportado usa nomes em maiúsculas (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`). Portanto, as quatro leituras em minúsculas não correspondem ao tipo nem aos valores validados. A inicialização de `env` ainda falha cedo se as variáveis obrigatórias não existirem.

O pool não abre uma conexão por repositório nem possui encerramento/health-check explícitos. Erros de conexão ou execução surgem no `execute` que os provoca, salvo nos métodos de produto que os encapsulam.

## Convenções de query e dados

- Queries de escrita usam `INSERT` com `?` e arrays de parâmetros. Não há `UPDATE`, `DELETE`, transações ou bloqueios.
- As leituras usam `SELECT *`, ficando acopladas aos nomes e tipos retornados pelo schema MySQL. Os repositórios tipam as linhas como `any[]`.
- `products` é lida/gravada com `id`, `name`, `quantity`, `price`, `category`, `image_url` e `bar_code`; `stock_movements` com `id`, `product_id`, `type`, `quantity` e `created_at`.
- A quantidade do agregado `Product` é derivada dos movimentos em [`backend/src/domain/entities/Product.ts`](../../../domain/entities/Product.ts). A coluna `products.quantity` é incluída no `INSERT`, mas ignorada na hidratação e nunca atualizada quando um movimento é inserido; ela não deve ser tratada como saldo confiável pelo código atual.

## Fluxos e limitações

`MySqlProductRepository.findById` realiza uma consulta do produto e, quando há resultado, consulta seus movimentos para reconstruir o agregado. `findAll` realiza uma consulta de produtos e depois uma consulta de movimentos por produto, em sequência: são **1 + N** queries (N+1), sem paginação e sem paralelismo. O detalhe está em [`repositories/`](repositories/).

Os movimentos são carregados por `created_at DESC`, mas a hidratação chama `Product.addMovement`, que valida saídas contra o saldo parcial. Como o agregado deveria ser reconstruído cronologicamente, uma saída recente pode ser aplicada antes das entradas anteriores e falhar com `Insufficient stock`; esse erro é posteriormente mascarado pelo repositório de produtos. Consulte [`mappers/`](mappers/) e [`repositories/`](repositories/) para as regras exatas.

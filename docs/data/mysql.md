# Persistência MySQL

Este documento descreve o estado atual observado em `db/init.sql` e na implementação MySQL do backend. As seções **Fatos atuais** relatam o código existente; a seção **Recomendações** não descreve funcionalidades implementadas.

## Schema

### Fatos atuais

O script começa com `USE stockdb`; portanto, pressupõe que esse banco já exista.

#### `products`

| Coluna | Definição atual |
| --- | --- |
| `id` | `VARCHAR(36)`, chave primária |
| `name` | `VARCHAR(255) NOT NULL` |
| `quantity` | `INT NOT NULL` |
| `price` | `DECIMAL(10,2) NOT NULL` |
| `category` | `VARCHAR(50) NOT NULL` |
| `image_url` | `VARCHAR(500)`, anulável |
| `bar_code` | `VARCHAR(100)`, anulável |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` |

#### `stock_movements`

| Coluna | Definição atual |
| --- | --- |
| `id` | `VARCHAR(36)`, chave primária |
| `product_id` | `VARCHAR(36) NOT NULL` |
| `type` | `ENUM('in', 'out') NOT NULL` |
| `quantity` | `INT NOT NULL` |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` |

O DDL cria o índice `idx_stock_movements_product_id` em `product_id`. Não declara explicitamente engine, charset ou collation.

## Relacionamento

### Fatos atuais

Há uma relação de um produto para muitos movimentos: `stock_movements.product_id` referencia `products.id`. A chave estrangeira `fk_stock_movements_product` usa `ON DELETE CASCADE`, de modo que o banco exclui os movimentos vinculados quando o produto é removido.

## Mapeamentos entre domínio e banco

### Fatos atuais

- `Product` não tem mapper dedicado. `MySqlProductRepository.save` grava diretamente `id`, `name`, `quantity`, `price`, `category`, `image_url` e `bar_code` em `products`.
- Ao reconstruir um produto, o repositório lê `name`, `price`, `category`, `image_url` e `bar_code`; instancia `Product` e substitui o UUID gerado pelo `id` da linha. `products.quantity`, `created_at` e `updated_at` não são usados nessa reconstrução.
- A categoria do domínio é `FOOD`, `ELECTRONICS`, `CLOTHING`, `CLEANING`, `OFFICE` ou `OTHER`; no banco ela é apenas `VARCHAR(50)`. O repositório faz apenas uma asserção de tipo TypeScript (`as ProductCategory`), sem validação do valor lido.
- `StockMovementMapper` converte `type = 'in'` para `StockMovementType.ENTRY` e `type = 'out'` para `StockMovementType.EXIT`. Na gravação, a conversão é inversa. Também mapeia `product_id`/`created_at` para `productId`/`createdAt`.
- A entidade `Product` valida nome não vazio e preço não negativo. `StockMovement` valida quantidade estritamente positiva. Essas são validações da aplicação; o DDL não contém `CHECK` equivalente.

## Origem atual da quantidade

### Fatos atuais

A quantidade exposta pela entidade é calculada em memória, e não é lida de `products.quantity`:

```text
quantity = soma(entrada.quantity) - soma(saída.quantity)
```

`Product.quantity` reduz a coleção de movimentos usando `getSignedQuantity()`. Ao criar um produto, não há movimentos iniciais, logo o `INSERT` grava `0` em `products.quantity`. Entradas e saídas inserem uma linha em `stock_movements`; não há `UPDATE products` nas implementações MySQL atuais. Consequentemente, a coluna `products.quantity` permanece como valor persistido inicial e pode divergir da quantidade calculada a partir dos movimentos.

Para saída, `Product.addMovement` rejeita o movimento quando a quantidade calculada já carregada é menor que a saída. A verificação é feita na aplicação antes do `INSERT` do movimento.

## Queries e carregamento

### Fatos atuais

- **Salvar produto:** `INSERT INTO products (...) VALUES (?, ..., ?)` com parâmetros posicionais. Os timestamps ficam a cargo dos defaults do banco.
- **Buscar por id:** `SELECT * FROM products WHERE id = ? LIMIT 1`; depois uma consulta de movimentos para o produto.
- **Listar produtos:** `SELECT * FROM products`, sem `ORDER BY`. Para cada linha, o repositório consulta seus movimentos individualmente. Assim, para `N` produtos há uma consulta inicial mais `N` consultas de movimentos.
- **Salvar movimento:** `INSERT INTO stock_movements (...) VALUES (?, ..., ?)`; o repositório envia explicitamente `created_at`, que vem da data criada na entidade.
- **Buscar movimentos:** `SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC`. Não há critério secundário de ordenação para empates de `created_at`.
- **Listar movimentos de um produto:** o caso de uso primeiro chama `findById`, que já carrega os movimentos para reconstruir o agregado, e depois executa `findByProductId` novamente para devolver a lista.

O carregamento do agregado usa a ordem decrescente retornada pela consulta e reaplica cada movimento com `product.addMovement`. Como esse método valida saídas contra o saldo parcial, um histórico cronologicamente válido cuja saída mais recente dependa de entradas mais antigas pode falhar ao ser carregado: a saída é aplicada antes da entrada que a cobria.

## Conexão

### Fatos atuais

- `connection.ts` cria um pool `mysql2/promise` com `waitForConnections: true`, `connectionLimit: 10` e `queueLimit: 0`.
- O módulo de ambiente valida as chaves `DB_HOST`, `PORT_DB`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` e `DB_CONNECTION_LIMIT` (esta última tem default `10`).
- Há incompatibilidade entre os nomes exportados pelo módulo de ambiente e os nomes lidos na criação do pool: o pool acessa `env.dbHost`, `env.dbUser`, `env.dbPassword` e `env.dbName`, enquanto o schema de ambiente define apenas chaves em maiúsculas. Além disso, `PORT_DB` e `DB_CONNECTION_LIMIT` não são passados ao pool; o limite é fixado em `10`.
- Não há configuração de porta, TLS/SSL, timezone ou charset no objeto de opções do pool.
- O `docker-compose.yml` monta `db/init.sql` como script de inicialização e cria o banco com o valor de `MYSQL_DATABASE`/`DB_DATABASE`. Como o SQL fixa `USE stockdb`, essas configurações precisam coincidir para o script operar sobre o banco esperado.
- `env.ts` importa `zod`, mas `backend/package.json` não o declara em `dependencies` nem em `devDependencies`.
- As operações de repositório observadas usam `db.execute`. Não há chamadas a `getConnection`, `beginTransaction`, `commit` ou `rollback`; transações de aplicação não estão implementadas nesse código.

## Limitações de integridade e migração

### Fatos atuais

- O banco não impõe quantidade positiva em `stock_movements.quantity`, preço não negativo em `products.price` nem saldo de estoque não negativo em `products.quantity`.
- Não há restrição de unicidade para `bar_code` e nem restrição de domínio no banco para `category` além do tamanho do `VARCHAR`.
- O banco não impõe que `products.quantity` corresponda à soma dos movimentos, e a persistência atual não faz essa sincronização.
- A validação de saldo para saídas ocorre após leitura do agregado, sem bloqueio ou transação explícita. O código não fornece uma garantia de integridade para saídas concorrentes.
- Em `db/` existe apenas `init.sql`; o `package.json` não possui script de migração, e o DDL usa `CREATE TABLE IF NOT EXISTS`. Isso inicializa tabelas ausentes, mas não contém passos versionados para alterar tabelas já existentes.

## Recomendações (não implementadas)

- Eleger uma fonte de verdade para o saldo: calcular por movimentos em consulta/visão, ou manter a coluna materializada com atualização atômica e regras de consistência.
- Carregar movimentos em ordem cronológica crescente para reconstruir o agregado, ou usar uma rotina de hidratação que não reaplique a regra de saída sobre histórico já persistido.
- Corrigir os nomes e o uso das variáveis de conexão, incluindo porta e limite de conexões quando forem configuráveis.
- Adicionar restrições adequadas (por exemplo, `CHECK` para valores positivos, domínio de categoria e unicidade de código de barras conforme a regra de negócio).
- Introduzir migrações versionadas para evoluir o schema e aplicar coordenação transacional/bloqueio apropriado às operações concorrentes de estoque.

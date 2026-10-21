# Persistência MySQL

O Compose usa `mysql:9.7`. `db/init.sql` cria `products`, `stock_movements` e `schema_migrations` em um volume novo. O schema usa InnoDB, `utf8mb4`, FK de movimento para produto, `DECIMAL(10,2)` para preço, CHECK de quantidade/preço/nome e índice `(product_id, created_at DESC, id DESC)` para o histórico. `products.quantity` tem padrão zero e não aceita negativo.

`db/init.sql` só roda na criação de um volume vazio. Em volume já existente, `db/migrations/migrate.sh` consulta `schema_migrations` e aplica `001_harden_inventory.sql` uma vez. A migração executa preflight de nomes, preços, categorias, quantidades e saldo derivado; aborta se houver dados não remediáveis. Datas nulas são reparadas e saldos são reconciliados com o histórico antes das novas constraints. DDL do MySQL não compõe uma transação única: faça backup antes de aplicar a migração a qualquer volume relevante.

Nesta branch não há banco persistente com dados reais a migrar. Para ambiente local descartável, um volume novo usa o schema final diretamente. Não execute `docker compose down --volumes` em um ambiente cujos dados precisam ser preservados.

O pool em `backend/src/infra/db/mysql/connection.ts` usa host, porta, usuário, senha, banco e limite de conexões do ambiente. `decimalNumbers: false` conserva valores DECIMAL como string. O repositório grava preço em string com dois decimais e reconstitui a entidade. A API nunca recebe senha root do MySQL.

Uma movimentação obtém uma conexão do pool e inicia transação. `SELECT ... FOR UPDATE` bloqueia o produto; após validar o saldo, a mesma conexão executa `UPDATE products` e `INSERT stock_movements`. `commit` finaliza os dois; qualquer erro executa rollback. `corepack pnpm --dir backend test:integration` verifica esse comportamento contra um MySQL descartável; a CI o executa após recriar um schema pré-hardening, aplicar a migração e confirmar o saldo reconciliado. A execução local dessa etapa depende de um Docker Engine disponível.

# backend/src/infra/db/

Existe apenas o adaptador [mysql/](mysql/codemap.md). O pool em `mysql/connection.ts` é criado uma vez ao carregar o módulo. Os repositórios usam `db.execute` para operações simples; a aplicação de um movimento obtém uma `PoolConnection` e a libera ao finalizar a transação.

A implementação de movimentos mantém `SELECT ... FOR UPDATE`, verificação de saldo, `UPDATE products.quantity` e `INSERT stock_movements` na mesma conexão. Um retorno antecipado ou uma falha provoca rollback; sucesso provoca commit. O código não oferece uma unidade de trabalho genérica nem transações para outros casos de uso.

O schema MySQL e as migrações pertencem ao diretório `../../../db/` da raiz do repositório. O backend assume que eles já foram aplicados antes de atender requisições.

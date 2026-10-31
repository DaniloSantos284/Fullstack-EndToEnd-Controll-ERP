# backend/src/infra/db/mysql/

## Pool

`connection.ts` cria um pool `mysql2/promise` com host, porta, usuário, senha, banco e limite de conexões de `config/env.ts`. Usa `waitForConnections: true`, `queueLimit: 0`, `charset: utf8mb4`, `timezone: Z` e `decimalNumbers: false`. O `server.ts` chama `db.end()` no encerramento gracioso.

## Dados e consultas

`MySqlProductRepository` lê a coluna `products.quantity` como saldo atual. `price` é mantido em centavos na entidade; a gravação produz texto decimal com duas casas, e a leitura converte o `DECIMAL` retornado pelo driver para número antes da validação/construção de `Product`. Listagem de produtos usa `ORDER BY id ASC LIMIT ? OFFSET ?` e busca um registro extra para calcular `hasNext`.

`MySqlStockMovementRepository.applyMovement` obtém conexão, inicia transação, bloqueia a linha do produto com `FOR UPDATE`, rejeita saída sem saldo ou entrada acima do limite de `INT`, atualiza o saldo e insere o movimento. Produto ausente, saldo insuficiente e limite excedido são estados retornados à aplicação. Falhas SQL provocam rollback e seguem como exceção. A leitura de histórico usa `ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?` e também busca um registro extra.

O [mapper](mappers/codemap.md) converte os enums do histórico. Os contratos e SQL detalhados estão em [repositories/](repositories/codemap.md). As leituras de produto não carregam movimentos; detalhes e histórico fazem uma consulta separada, sem N+1 na lista de produtos.

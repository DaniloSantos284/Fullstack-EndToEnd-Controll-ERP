# `backend/src/infra/db/`

## Responsabilidade

Ponto de entrada para implementações de banco. Só há o adaptador [`mysql/`](mysql/) no momento; não existe uma abstração genérica de driver, camada de migrações ou definição de schema neste diretório.

## Padrão de persistência

O domínio publica portas em [`backend/src/domain/repositories/`](../../domain/repositories/). As classes em [`mysql/repositories/`](mysql/repositories/) implementam essas portas com SQL manual e recebem dependências por construtor quando precisam compor um agregado. O pool compartilhado fica em [`mysql/connection.ts`](mysql/connection.ts), e conversões tabela--domínio específicas ficam em [`mysql/mappers/`](mysql/mappers/).

As consultas usam `db.execute(sql, valores)`, com placeholders posicionais `?`; não há interpolação de valores de negócio no SQL atual. Leituras retornam entidades de domínio, e gravações retornam `Promise<void>` conforme os contratos.

## Limites atuais

- Não há transaction boundary nesta camada. O fluxo de estoque lê produto e movimentos, valida em memória e depois insere um movimento; leituras concorrentes podem validar o mesmo saldo e permitir saídas incompatíveis.
- Não há lifecycle explícito (`db.end()`), teste de conectividade, retries, timeout configurado ou tradução uniforme de erros.
- O schema é apenas assumido pelas queries contra `products` e `stock_movements`; não há arquivos de DDL/migração sob `backend/`.
- A implementação MySQL contém um desalinhamento entre as propriedades exportadas por [`backend/src/config/env.ts`](../../config/env.ts) (`DB_HOST`, `DB_USER`, etc.) e as propriedades minúsculas lidas em `connection.ts` (`dbHost`, `dbUser`, etc.). Isso impede a tipagem correta e deixa a configuração de runtime incorreta até que os nomes sejam alinhados.

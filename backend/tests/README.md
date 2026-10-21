# Testes do backend

Jest 30.5.2 executa os testes TypeScript com `ts-jest`; Supertest exercita a aplicação Express sem abrir uma porta fixa. O projeto usa pnpm 12.14.0 e Node.js 22 LTS.

## Comandos

Execute no diretório `backend/` após `corepack pnpm install --frozen-lockfile`:

| Comando | Finalidade |
| --- | --- |
| `corepack pnpm test` | Executa as suítes unitárias e HTTP. |
| `corepack pnpm test:watch` | Executa Jest em modo watch. |
| `corepack pnpm test:coverage` | Gera cobertura V8 em `coverage/`. |
| `corepack pnpm test:ci` | Executa Jest sequencialmente, em modo CI, com cobertura. |
| `corepack pnpm test:typecheck` | Confere tipos de fontes e testes sem emitir arquivos. |
| `corepack pnpm test:integration` | Executa a verificação contra MySQL real; exige banco descartável configurado. |

## Escopo coberto

As suítes em `tests/unit/` exercitam invariantes de domínio, regras de estoque, preço e o repositório transacional simulado. As suítes em `tests/http/` cobrem contratos de produto, paginação, erros, request ID, healthchecks, autenticação de gateway, rate limit, `Cache-Control: no-store` e media type JSON.

`tests/integration/mysql-stock.ts` não é carregado pelo Jest. Ele abre uma conexão MySQL real, verifica concorrência de saídas, rollback após falha de insert, paginação e preço; a CI também o executa depois de aplicar a migração em um schema legado.

## Isolamento

`tests/setup-env.ts` define ambiente de teste e `tests/setup-jest.ts` substitui `src/infra/db/mysql/connection.ts` por `tests/helpers/database.ts` antes de importar `src/app.ts`. Assim, os testes unitários e HTTP não iniciam pool real nem leem `backend/.env`. Cada teste começa com mocks de consulta/transação sem resposta configurada, evitando sucesso simulado acidental.

Os testes com mocks não comprovam SQL, DDL ou locks do MySQL. Para essa evidência, use `test:integration` com o Compose descrito no [README do backend](../README.md).

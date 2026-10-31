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
| `corepack pnpm test:gateway` | Executor interno do E2E Nginx; deve ser chamado pelo serviço Compose `gateway-tests`, não diretamente no host. |

## Escopo coberto

As suítes em `tests/unit/` exercitam invariantes de domínio, regras de estoque, preço e o repositório transacional simulado. As suítes em `tests/http/` cobrem contratos de produto, paginação, erros, request ID, healthchecks, autenticação de gateway, rate limit, `Cache-Control: no-store` e media type JSON.

`tests/integration/mysql-stock.ts` não é carregado pelo Jest. Ele abre uma conexão MySQL real, verifica concorrência de saídas, rollback após falha de insert, paginação e preço; a CI também o executa depois de aplicar a migração em um schema legado.

`../db/migrations/tests/migrate.sh` é a matriz real do runner de migration e roda dentro do container `migrate` na CI. Ela cobre aplicação normal, rerun, failpoint após o SQL e antes do marker, recuperação verificada e timeout da trava MySQL; o job também inicia dois runners normais em paralelo.

`tests/integration/nginx-gateway.ts` também não é carregado pelo Jest. O overlay `docker-compose.gateway-test.yml` executa-o dentro da rede Docker: ele cria JWKS e tokens efêmeros, percorre HTTPS Nginx e `auth_request`, e valida `503` sem JWKS, `401` para tokens inválidos, `403` para escopo insuficiente e `200` com escopo de leitura. Não há chaves privadas estáticas ou provedor externo.

## Isolamento

`tests/setup-env.ts` define ambiente de teste e `tests/setup-jest.ts` substitui `src/infra/db/mysql/connection.ts` por `tests/helpers/database.ts` antes de importar `src/app.ts`. Assim, os testes unitários e HTTP não iniciam pool real nem leem `backend/.env`. Cada teste começa com mocks de consulta/transação sem resposta configurada, evitando sucesso simulado acidental.

Os testes com mocks não comprovam SQL, DDL ou locks do MySQL. Para essa evidência, use `test:integration` com o Compose descrito no [README do backend](../README.md).

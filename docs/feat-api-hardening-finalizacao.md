# Estado de `feat/api-hardening`

Este documento registra o estado de remediação antes do commit final. A revisão deve ocorrer sobre um SHA que inclua atomicamente os arquivos de hardening; não confunda alterações locais não commitadas com `e60f9fc`. Docker Desktop foi ativado no WSL2 e os gates locais de containers foram executados em um projeto Compose isolado, sem tocar nos serviços existentes.

## Escopo implementado no working tree

### Dependências, runtime e qualidade

- Node foi fixado em `>=22.13.0 <23` por `backend/package.json` e `.nvmrc`; pnpm é `12.14.0` via Corepack.
- `@types/node@^22.20.5` foi adicionado como dependência direta de desenvolvimento, e o lockfile foi atualizado sem edição manual.
- O override vulnerável de `qs` foi removido. O grafo resolvido usa `express@4.22.3`, `zod@4.6.7`, `handlebars@4.7.10` e `qs@6.16.2` em produção.
- ESLint 10 recebeu configuração explícita em `backend/eslint.config.mjs`; lint, typecheck, build e coverage fazem parte da CI.
- Jest exige globalmente 75% branches, 90% statements/lines e 95% functions.

### API, autenticação e paginação

- Validação Zod estrita, corpo JSON limitado, `415` para POST sem JSON, erros `{code,message,requestId}`, Helmet, `Cache-Control: no-store`, request ID e rate limit permanecem ativos.
- A paginação por offset limita `limit` a 100 e também rejeita `(page - 1) * limit > 10000` com `400`, antes de consultar SQL.
- `JwksAccessTokenVerifier` valida material JWKS, exige ao menos uma chave verificável RS256/ES256, recusa redirects, usa busca com timeout e diferencia indisponibilidade de infraestrutura de erro local de token.
- `VerifyGatewayTokenController` devolve `401` para token inválido, `403` para escopo insuficiente e `503` genérico apenas para `AuthenticationInfrastructureError`, sem expor detalhes do provedor.
- Token inteiramente malformado (`not-a-jwt`) é rejeitado localmente como `401`, mesmo quando o JWKS está indisponível. Um token estruturalmente válido com `kid` desconhecido pode exigir busca de JWKS e, se o provedor estiver fora, receber `503`; isso é o comportamento conservador para distinguir rotação legítima de indisponibilidade.

### Gateway Nginx e E2E

- `deploy/nginx/default.conf.template` aplica `auth_request`, remove `Authorization` antes de encaminhar para a rota de negócio, aplica o mesmo `JSON_BODY_LIMIT_KB` da API, adiciona HSTS e preserva `401`/`403`.
- Falha de infraestrutura no subrequest de autenticação é mapeada para `503` público por `auth_request_set` e uma named location; não há detalhes internos no cliente.
- O overlay `docker-compose.gateway-test.yml` e `backend/tests/integration/nginx-gateway.ts` montam um E2E real HTTPS → Nginx → Express → MySQL com JWKS efêmero na rede interna.
- O E2E previsto cobre preflight, bearer ausente, JWT malformado/expirado, issuer/audience/assinatura/sub inválidos, scopes, `401`/`403`/`503`, `200`/`201`, endpoints internos inacessíveis e remoção efetiva do bearer antes da API.
- A confirmação de remoção do bearer usa somente `GATEWAY_TEST_AUTHORIZATION_PROBE=true` com `NODE_ENV=test`; a API retorna apenas `present`/`absent`, nunca o token. A flag não integra o runtime público.

### MySQL e migrations

- O schema possui constraints, saldo materializado, histórico e transações de movimento com `SELECT ... FOR UPDATE`; a integração exercita concorrência, rollback por chave duplicada, saldo e paginação contra MySQL real quando Docker está disponível.
- A fixture `db/migrations/fixtures/legacy-pre-001-harden-inventory.sql` representa o schema antigo. A CI o carrega, cria histórico de saldo 12/5, executa a migration e exige saldo reconciliado igual a 7.
- `db/migrations/001_harden_inventory.sql` continua propositalmente não idempotente e seu DDL não é transacional. É uma migration one-shot e exige backup verificado antes de rodar em dados relevantes.
- `db/migrations/migrate.sh` mantém uma trava nomeada MySQL na **mesma sessão** durante leitura do marker, execução completa da SQL, verificação de invariantes e inserção do marker. O timeout padrão é 120 s (`MYSQL_MIGRATION_LOCK_TIMEOUT`); segundo runner aguarda, relê o marker e sai com sucesso sem reaplicar DDL. Se o SQL terminou sem marker, a recuperação só grava o marker após verificação final; estado parcial falha fechado.
- A workflow inicia dois `docker compose run --no-deps --rm migrate` em paralelo contra a fixture legada e falha se qualquer um falhar. Isso substitui a execução única e é a evidência prevista para serialização, sem sequencing baseado em `sleep`.

### CI e documentação

- `.github/workflows/backend-ci.yml` volta a limitar push a `main` e `develop`, e continua em pull request.
- A CI usa Node 22, pnpm 12.14.0, instalação frozen, lint, build, typecheck, Jest e audit completo **e** de produção com `--audit-level=high`.
- Ela valida Nginx renderizado, todos os overlays Compose relevantes, fixture/migration legada, integração MySQL e o gateway E2E com certificado temporário/JWKS efêmero.
- `backend/README.md`, `docs/api/http-api.md` e `docs/operations/runtime.md` foram alinhados com runtime, gateway, migration, limites e comandos de operação.

## Validações locais concluídas

| Verificação | Resultado |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | Passou. |
| `corepack pnpm lint`, `test:typecheck` e `build` | Passaram. |
| `corepack pnpm test:ci` | Passou: 9 suítes, 77 testes, 93,87% statements/lines, 84,39% branches e 98,52% functions. |
| `corepack pnpm audit --prod --audit-level=high` | Passou; sem vulnerabilidades conhecidas em produção. |
| `corepack pnpm audit --audit-level=high` | Passou; há 1 vulnerabilidade low e 2 moderate fora do threshold, sem aceite/supressão criado. |
| `sh -n db/migrations/migrate.sh`, `sh -n db/migrations/tests/migrate.sh` e `git diff --check` | Passaram. |
| MySQL 9.7 em Docker | Passou: matriz de migration, dois runners normais concorrentes, healthcheck da API e integração real. |
| HTTPS Nginx em Docker | Passou: gateway/JWKS efêmero, `401`/`403`/`503`, leitura/escrita autorizadas e remoção do bearer. |

## Gate restante

O workflow GitHub Actions deve rodar no SHA final criado após esta remediação. Ele repete os gates Docker locais com Node 22 e é a evidência de CI para o commit final.

## Estado de versionamento e cuidados de continuidade

- O working tree já estava sujo no início. Não executar `git reset --hard`, `git clean`, stash abrangente ou sobrescrever mudanças sem revisão.
- Mudanças necessárias ainda estão não commitadas. Arquivos novos indispensáveis a incluir em eventual commit: `.env.mock` (valores fictícios), `.nvmrc`, `backend/eslint.config.mjs`, `backend/src/application/security/AuthenticationInfrastructureError.ts`, `backend/tests/integration/nginx-gateway.ts`, `backend/tests/unit/env.test.ts` e `docker-compose.gateway-test.yml`.
- `.ignore` é untracked e não relacionado; não deve entrar no commit. `.slim/deepwork/` é progresso local ignorado e também não é artefato de entrega.
- Antes de criar um commit, revisar e stagear somente os arquivos de hardening. Nenhum commit/push/merge foi solicitado ou realizado nesta sessão.

## Comandos de revisão

```bash
# use Node 22 antes dos comandos abaixo
cd backend
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm test:typecheck
corepack pnpm test:ci
corepack pnpm build
corepack pnpm audit --audit-level=high
corepack pnpm audit --prod --audit-level=high
cd ..
sh -n db/migrations/migrate.sh
git diff --check
```

Nunca exponha a porta interna 4000 ou `/internal/auth/verify`; publicação pública continua exigindo OIDC/JWKS HTTPS, DNS e certificados reais.

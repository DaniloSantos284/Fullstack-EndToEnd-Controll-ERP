# Backend

Serviço HTTP de estoque em Express e TypeScript. Ele é executado como processo Node ou pelo Compose da raiz do repositório.

## Pré-requisitos

- Node.js 22 LTS (a mesma linha usada no Dockerfile e na CI).
- Corepack habilitado para usar pnpm 12.14.0.
- MySQL 9.7 para execução fora do Docker, ou Docker Engine com Compose para subir o ambiente descartável.

Na primeira instalação:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
```

O lockfile é a fonte de versões. Não use `npm install` nem gere `package-lock.json`.

## Configuração de ambiente

O módulo de configuração exige `DB_HOST`, `PORT_DB`, `DB_USER`, `DB_PASSWORD` e `DB_DATABASE`. Para desenvolvimento sem Docker, crie `backend/.env` (ignorado pelo Git):

```dotenv
NODE_ENV=development
PORT=3333
DB_HOST=127.0.0.1
PORT_DB=3307
DB_USER=stock_user
DB_PASSWORD=uma-senha-local
DB_DATABASE=stockdb
DB_CONNECTION_LIMIT=10
JSON_BODY_LIMIT_KB=64
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
TRUST_PROXY_HOPS=0
SHUTDOWN_TIMEOUT_MS=10000
```

Variáveis de JWT são necessárias somente para o endpoint interno usado pelo gateway: `JWT_ISSUER`, `JWT_AUDIENCE` e `JWT_JWKS_URL` devem ser configuradas juntas. Em produção, a URL JWKS deve usar HTTPS. `JWT_READ_SCOPE` e `JWT_WRITE_SCOPE` têm os padrões `inventory:read` e `inventory:write`.

## Banco e migrações

Para subir o MySQL local e disponibilizá-lo para o processo Node:

```bash
cd ..
cp .env.example .env
# Defina DB_ROOT_PASSWORD e DB_PASSWORD no .env.
docker compose -f docker-compose.yml -f docker-compose.db-port.yml up -d --build --wait
cd backend
```

Um volume novo recebe `db/init.sql`. Em um volume criado antes do hardening, o serviço `migrate` aplica `001_harden_inventory` uma vez, após validar e reconciliar o saldo com o histórico. Faça backup antes de migrar qualquer volume relevante: DDL MySQL não é transacional.

Para executar somente a migração contra um banco já iniciado pelo Compose:

```bash
cd ..
docker compose -f docker-compose.yml -f docker-compose.db-port.yml up --no-deps --exit-code-from migrate migrate
```

`docker compose down` preserva o volume. Use `docker compose down --volumes` apenas em ambiente descartável.

## Execução

Desenvolvimento com MySQL acessível conforme o bloco anterior:

```bash
corepack pnpm dev
```

Build e execução de produção como processo Node:

```bash
corepack pnpm build
NODE_ENV=production corepack pnpm start
```

Para a implantação pública, use o gateway em vez de expor a API diretamente:

```bash
cd ..
docker compose -f docker-compose.yml -f docker-compose.gateway.yml up --build --wait
```

Esse comando requer `DB_ROOT_PASSWORD`, `DB_PASSWORD`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_JWKS_URL`, `PUBLIC_HOSTNAME`, `TLS_CERT_PATH` e `TLS_KEY_PATH` no `.env`. O gateway expõe apenas `/api/`; liveness, readiness e `/internal/auth/verify` permanecem na rede privada. Não combine o overlay `docker-compose.local.yml` com o gateway público.

## Testes e validações

```bash
corepack pnpm test:ci
corepack pnpm test:typecheck
corepack pnpm build
corepack pnpm audit --prod --audit-level=critical
```

`test:ci` executa testes unitários e HTTP com Jest/Supertest e gera cobertura. Eles usam pool MySQL simulado. `test:integration` exige um MySQL descartável real já inicializado:

```bash
cd ..
docker compose -f docker-compose.yml -f docker-compose.db-port.yml up -d --build --wait
cd backend
NODE_ENV=test DB_HOST=127.0.0.1 PORT_DB=3307 \
  DB_USER=stock_user DB_PASSWORD=uma-senha-local DB_DATABASE=stockdb \
  corepack pnpm test:integration
```

O teste de integração verifica concorrência de saída, rollback, paginação e preço contra o banco real. A CI também recria um schema anterior à migração, aplica `001_harden_inventory` e verifica seu marker e saldo reconciliado antes desse teste.

Detalhes de HTTP, segurança, variáveis e operação estão em [`../docs/`](../docs/README.md). A documentação específica da suíte está em [`tests/README.md`](tests/README.md).

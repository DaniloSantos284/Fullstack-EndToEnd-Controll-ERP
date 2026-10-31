# Backend

Serviço HTTP de estoque em Express e TypeScript. Ele é executado como processo Node ou pelo Compose da raiz do repositório.

## Pré-requisitos

- Node.js 22 LTS, versão `>=22.13.0 <23` (`nvm use` lê `.nvmrc`; Dockerfile e CI selecionam a mesma linha 22 explicitamente).
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

Para um ambiente descartável já configurado com credenciais fictícias, use o arquivo `.env.mock` da raiz em vez de criar `.env`:

```bash
cd ..
docker compose --env-file .env.mock -f docker-compose.yml -f docker-compose.db-port.yml up -d --build --wait
cd backend
```

Ele não deve ser usado fora de desenvolvimento/testes. Para configurar senhas próprias, siga o fluxo abaixo.

Para subir o MySQL local e disponibilizá-lo para o processo Node:

```bash
cd ..
cp .env.example .env
# Defina DB_ROOT_PASSWORD e DB_PASSWORD no .env.
docker compose -f docker-compose.yml -f docker-compose.db-port.yml up -d --build --wait
cd backend
```

Um volume novo recebe `db/init.sql`. Em um volume criado antes do hardening, o serviço `migrate` aplica `001_harden_inventory` uma vez, após validar e reconciliar o saldo com o histórico. Execuções concorrentes são serializadas por uma trava nomeada mantida na mesma sessão MySQL; a segunda relê o marker e encerra sem reaplicar o DDL. Após uma queda antes do marker, o runner registra a recuperação somente se schema e dados já satisfizerem os invariantes finais; um estado parcial falha fechado para reparo/restauração manual. O tempo máximo de espera é 120 segundos (`MYSQL_MIGRATION_LOCK_TIMEOUT`). Faça backup antes de migrar qualquer volume relevante: DDL MySQL não é transacional.

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
corepack pnpm lint
corepack pnpm test:ci
corepack pnpm test:typecheck
corepack pnpm build
corepack pnpm audit --audit-level=high
corepack pnpm audit --prod --audit-level=high
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

O teste de integração verifica concorrência de saída, rollback, paginação e preço contra o banco real. A CI também recria um schema anterior à migração, exercita normal/rerun/failpoint/timeout e dois runners concorrentes de `001_harden_inventory`, então verifica marker e saldo reconciliado antes desse teste.

O gateway tem E2E próprio no overlay `docker-compose.gateway-test.yml`. Ele deve rodar em Docker porque o executor precisa alcançar o hostname interno `gateway`; a CI é a referência. Em um host Docker, gere certificados temporários e execute:

```bash
cd ..
cert_dir="$(mktemp -d)"
trap 'rm -rf "$cert_dir"' EXIT
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$cert_dir/server.key" -out "$cert_dir/server.crt" \
  -days 1 -subj '/CN=gateway.test'
TLS_CERT_PATH="$cert_dir/server.crt" TLS_KEY_PATH="$cert_dir/server.key" \
  docker compose --env-file .env.mock -f docker-compose.yml -f docker-compose.gateway.yml -f docker-compose.gateway-test.yml \
    up --build --abort-on-container-exit --exit-code-from gateway-tests gateway-tests
```

O executor usa chave e JWKS efêmeros, testa `401`, `403`, `503`, assinatura inválida, encaminhamento `200` e confirma que o bearer público não chega à aplicação. Seu JWKS HTTP é restrito à rede descartável e `NODE_ENV=test`. Produção continua exigindo JWKS HTTPS.

Detalhes de HTTP, segurança, variáveis e operação estão em [`../docs/`](../docs/README.md). A documentação específica da suíte está em [`tests/README.md`](tests/README.md).

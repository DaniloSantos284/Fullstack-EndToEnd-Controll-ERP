# backend/src/config/

## Responsibility

Centraliza o carregamento e a validação de variáveis de ambiente antes que o servidor ou o pool MySQL sejam usados.

## Entry point and contract

- `env.ts` é avaliado por importação. `import 'dotenv/config'` carrega o arquivo `.env` no ambiente do processo; em seguida, `envSchema.safeParse(process.env)` valida e exporta `env`.
- Contrato validado: `NODE_ENV` (`development`, `test` ou `production`, padrão `development`), `PORT` (número, padrão `3333`), `DB_HOST`, `PORT_DB`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` e `DB_CONNECTION_LIMIT` (número, padrão `10`). As cinco variáveis sem padrão — `DB_HOST`, `PORT_DB`, `DB_USER`, `DB_PASSWORD` e `DB_DATABASE` — são obrigatórias.
- Se a validação falhar, o módulo registra o erro formatado e lança `Error('Invalid environment variables.')`; o processo não chega ao bootstrap do Express.

## Design

- A configuração é um singleton de módulo, derivado uma vez de `process.env`, sem injeção de valores por chamada.
- Números são convertidos com `z.coerce.number()`; a validação não renomeia as chaves, portanto o valor exportado preserva nomes em maiúsculas.
- O carregamento é acoplado ao `dotenv/config` e à biblioteca de schema `zod`.

## Flow

1. `server.ts` importa `app`; a construção das rotas alcança `infra/db/mysql/connection.ts`, que importa este módulo.
2. O módulo carrega/valida o ambiente e retorna `env` ou interrompe a inicialização.
3. O servidor pretende usar a porta de `env`; o pool pretende usar os dados de banco de `env`.

## Integration

- `server.ts` importa `{ env }` para definir a porta HTTP.
- `infra/db/mysql/connection.ts` importa `{ env }` para criar o pool `mysql2/promise`.
- Em Compose, `api` recebe `env_file: .env` da raiz e sobrescreve/expõe explicitamente `DB_HOST` e `PORT_DB`; o serviço `db` recebe `DB_DATABASE`, `DB_USER` e `DB_PASSWORD` para inicialização do MySQL.

## Inconsistências observáveis

- `env.ts` importa `zod`, mas o pacote não aparece em `backend/package.json` nem no lockfile.
- O schema exporta `PORT`, `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_DATABASE`; `server.ts` acessa `env.port` e `connection.ts` acessa `env.dbHost`, `env.dbUser`, `env.dbPassword` e `env.dbName`.
- `PORT_DB` e `DB_CONNECTION_LIMIT` são validados, porém `connection.ts` não define `port` no pool e fixa `connectionLimit: 10`.
- O padrão HTTP é `3333`, enquanto `backend/Dockerfile` expõe `4000` e `docker-compose.yml` publica a porta interna `4000`.
- O schema recebe `DB_DATABASE`, mas `db/init.sql` seleciona literalmente `stockdb`; a conexão pretende usar o valor de configuração para o banco.

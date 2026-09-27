# Operação em tempo de execução

Este documento descreve o estado atual verificável do backend e do `docker-compose.yml`, não um plano de correção.

## Execução local

O pacote do backend está em `backend/` e declara os seguintes scripts:

| Comando | Efeito declarado |
| --- | --- |
| `pnpm dev` | Executa `tsx watch src/server.ts`. |
| `pnpm build` | Executa `tsc`. |
| `pnpm start` | Executa `node dist/server.js`. |

O Dockerfile habilita o Corepack e instala dependências com `pnpm install --frozen-lockfile`; portanto, para reproduzir a instalação local declarada, execute no diretório `backend/`:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Para a execução compilada, a sequência declarada é:

```bash
pnpm build
pnpm start
```

O módulo de configuração usa `dotenv/config` sem informar um caminho. Assim, a origem das variáveis depende do diretório de trabalho do processo; ao executar os scripts do pacote `backend/`, não há configuração no código que aponte explicitamente para o `.env` da raiz citado no README.

### Variáveis consumidas pelo backend

| Variável | Regra no schema |
| --- | --- |
| `NODE_ENV` | Opcional: `development`, `test` ou `production`; padrão `development`. |
| `PORT` | Opcional, numérica; padrão `3333`. |
| `DB_HOST` | Obrigatória, texto. |
| `PORT_DB` | Obrigatória, numérica. |
| `DB_USER` | Obrigatória, texto. |
| `DB_PASSWORD` | Obrigatória, texto. |
| `DB_DATABASE` | Obrigatória, texto. |
| `DB_CONNECTION_LIMIT` | Opcional, numérica; padrão `10`. |

`z.string()` aceita texto vazio. As coerções com `z.coerce.number()` convertem valores numéricos, mas não exigem inteiro, valor positivo ou uma faixa: o schema não encadeia validações para essas restrições.

Se a validação falhar, a aplicação registra as variáveis inválidas e lança `Error('Invalid environment variables.')` antes de iniciar o servidor.

### Rotas e arquivos servidos

A aplicação registra as rotas de produtos sob `/api` e serve arquivos estáticos em `/uploads`, a partir de `uploads` no diretório pai do arquivo compilado. Não há rota de healthcheck registrada em `src/app.ts`.

## Execução com Docker Compose

Na raiz do repositório, use o plugin Compose do Docker:

```bash
docker compose up -d --build
```

## Upgrade de dados existentes do MySQL 8.0

O volume nomeado `db_data` persiste o diretório físico do MySQL. As instalações normais usam MySQL 9.7 LTS (`mysql:9.7`), mas um `db_data` existente criado no MySQL 8.0 não pode ser atualizado diretamente para 9.7: a sequência suportada é 8.0 → 8.4 → 9.7. Consulte a política de releases do MySQL em https://dev.mysql.com/doc/refman/9.7/en/mysql-releases.html.

Durante todo o processo, **não execute `docker compose down -v`**, pois isso removeria o volume. A recuperação deve ser feita a partir do backup lógico em um novo volume de dados; não há downgrade suportado do diretório físico do MySQL.

1. Suba somente o banco com a sobreposição de manutenção MySQL 8.0, execute a verificação de todas as bases e gere no host o backup lógico do banco da aplicação:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.mysql-8.0-maintenance.yml up -d db
   docker compose -f docker-compose.yml -f docker-compose.mysql-8.0-maintenance.yml exec -T db sh -c 'mysqlcheck -u root -p"$MYSQL_ROOT_PASSWORD" --all-databases --check-upgrade'
   docker compose -f docker-compose.yml -f docker-compose.mysql-8.0-maintenance.yml exec -T db sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --databases "$MYSQL_DATABASE" --single-transaction --routines --events' > mysql-8.0-before-9.7.sql
   docker compose -f docker-compose.yml -f docker-compose.mysql-8.0-maintenance.yml down
   ```

2. Inicie o mesmo volume em MySQL 8.4, confirme a versão e pare os serviços sem remover volumes:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.mysql-8.4-upgrade.yml up -d db
   docker compose -f docker-compose.yml -f docker-compose.mysql-8.4-upgrade.yml exec -T db sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT VERSION();"'
   docker compose -f docker-compose.yml -f docker-compose.mysql-8.4-upgrade.yml down
   ```

3. Suba a configuração normal, agora em MySQL 9.7 LTS, e confirme a versão:

   ```bash
   docker compose up -d --build
   docker compose exec -T db sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT VERSION();"'
   ```

O Compose possui valores padrão para desenvolvimento e inicia sem um arquivo `.env`. Para personalizá-los, copie o template da raiz e edite os valores necessários:

```bash
cp .env.example .env
```

Quando presente, o `.env` da raiz substitui os valores padrão usados pelo Compose e pelo serviço `api`.

### Serviços, portas e rede

| Serviço | Imagem/build | Porta publicada | Rede | Reinício |
| --- | --- | --- | --- | --- |
| `db` | MySQL 9.7 LTS / `mysql:9.7` | Porta de desenvolvimento configurável | `internal` | `unless-stopped` |
| `api` | build de `./backend` | Porta de desenvolvimento configurável para `4000` no contêiner | `internal` | `unless-stopped` |

A rede `internal` é uma rede `bridge` definida pelo Compose. Os dois serviços participam dela. O nome não a torna uma rede Docker marcada como interna: a configuração contém apenas `driver: bridge`. Em implantações normais, `db` usa MySQL 9.7 LTS; um volume `db_data` existente do MySQL 8.0 exige a migração documentada acima antes dessa inicialização normal.

O Dockerfile usa `node:22-slim` em dois estágios. O estágio de build habilita o Corepack, instala dependências com pnpm e compila o TypeScript. O estágio de runtime habilita o Corepack novamente, instala somente dependências de produção, recebe `dist/` do build e executa `node dist/server.js` como o usuário `node`. Ele cria `uploads` com a propriedade desse usuário e expõe a porta `4000`. O Compose declara `deploy.resources.limits.memory: 512M` para `api`; esse limite só é efetivo em ambientes Compose/runtime que suportem essa configuração.

### Variáveis do Compose

O serviço `db` recebe:

- `DB_ROOT_PASSWORD` como `MYSQL_ROOT_PASSWORD`;
- `DB_DATABASE` como `MYSQL_DATABASE`;
- `DB_USER` como `MYSQL_USER`;
- `DB_PASSWORD` como `MYSQL_PASSWORD`;
- `PORT_DB` para publicar a porta do MySQL no host.

O serviço `api` recebe a configuração de ambiente a partir dos valores padrão de desenvolvimento ou das substituições definidas no `.env` da raiz.

### Volumes

| Volume/montagem | Destino | Finalidade configurada |
| --- | --- | --- |
| `db_data` (nomeado) | `/var/lib/mysql` no `db` | Persistência dos dados do MySQL 9.7 LTS nas instalações normais; dados existentes do MySQL 8.0 exigem a migração documentada acima. |
| `./db/init.sql` (bind, somente leitura) | `/docker-entrypoint-initdb.d/init.sql` no `db` | Disponibiliza o script de inicialização ao container MySQL. |
| `./backend/uploads` (bind) | `/usr/src/app/uploads` no `api` | Diretório versionado, persistido no host e servido estaticamente em `/uploads`. |

### Healthchecks e ordem de subida

Somente `db` tem healthcheck configurado. Ele executa:

```text
mysqladmin ping -h localhost -u${DB_USER} -p${DB_PASSWORD}
```

com intervalo de 30 segundos, timeout de 5 segundos e 5 tentativas. O serviço `api` depende de `db` com a condição `service_healthy`. Não há healthcheck Docker configurado para `api` e não há API de saúde implementada no arquivo de aplicação revisado.

`express.json()` é registrado sem limite explícito; portanto, usa o limite padrão do Express. Um erro de parsing de JSON não é tratado especificamente: como não é `AppError`, atualmente alcança o tratamento genérico e retorna `500`.

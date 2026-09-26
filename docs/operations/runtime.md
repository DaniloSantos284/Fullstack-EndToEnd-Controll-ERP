# Operação em tempo de execução

Este documento descreve o estado atual verificável do backend e do `docker-compose.yml`, não um plano de correção. Ele não pressupõe a existência de arquivo de exemplo de variáveis nem de endpoints de saúde.

## Execução local

O pacote do backend está em `backend/` e declara os seguintes scripts:

| Comando | Efeito declarado |
| --- | --- |
| `npm run dev` | Executa `tsx watch src/server.ts`. |
| `npm run build` | Executa `tsc`. |
| `npm start` | Executa `node dist/server.js`. |

O Dockerfile instala dependências com `npm install`; portanto, para reproduzir a instalação local declarada, execute no diretório `backend/`:

```bash
npm install
npm run dev
```

Para a execução compilada, a sequência declarada é:

```bash
npm run build
npm start
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

Na raiz do repositório, o README indica:

```bash
docker-compose up -d --build
```

O Compose requer variáveis de interpolação no ambiente ou no arquivo `.env` da raiz. O serviço `api` também carrega esse arquivo por meio de `env_file: .env`. No checkout atual, não há `.env`, `.env.example` nem o diretório versionado `backend/uploads`.

### Serviços, portas e rede

| Serviço | Imagem/build | Porta publicada | Rede | Reinício |
| --- | --- | --- | --- | --- |
| `db` | `mysql:8.0` | `${PORT_DB}:3306` | `internal` | `unless-stopped` |
| `api` | build de `./backend` | `${PORT_APP}:4000` | `internal` | `unless-stopped` |

A rede `internal` é uma rede `bridge` definida pelo Compose. Os dois serviços participam dela. O nome não a torna uma rede Docker marcada como interna: a configuração contém apenas `driver: bridge`.

O Dockerfile atual usa `node:20-slim` em estágio único: copia os manifestos, executa `npm install`, copia o código, compila o TypeScript e inicia `node dist/server.js`. As `devDependencies` permanecem no runtime e não há instrução `USER`; o processo usa o usuário root padrão da imagem. O Dockerfile expõe a porta `4000`. O Compose declara `deploy.resources.limits.memory: 512M` para `api`; esse limite só é efetivo em ambientes Compose/runtime que suportem essa configuração.

### Variáveis do Compose

O serviço `db` recebe:

- `DB_ROOT_PASSWORD` como `MYSQL_ROOT_PASSWORD`;
- `DB_DATABASE` como `MYSQL_DATABASE`;
- `DB_USER` como `MYSQL_USER`;
- `DB_PASSWORD` como `MYSQL_PASSWORD`;
- `PORT_DB` para publicar a porta do MySQL no host.

O serviço `api` recebe todas as variáveis do `.env` por `env_file` e declara adicionalmente `DB_HOST=${DB_HOST}` e `PORT_DB=${PORT_DB}`. A publicação da API usa `PORT_APP`, variável que não integra o schema do backend.

### Volumes

| Volume/montagem | Destino | Finalidade configurada |
| --- | --- | --- |
| `db_data` (nomeado) | `/var/lib/mysql` no `db` | Persistência dos dados do MySQL. |
| `./db/init.sql` (bind, somente leitura) | `/docker-entrypoint-initdb.d/init.sql` no `db` | Disponibiliza o script de inicialização ao container MySQL. |
| `./backend/uploads` (bind) | `/usr/src/app/uploads` no `api` | Persiste os arquivos estáticos servidos em `/uploads`. |

### Healthchecks e ordem de subida

Somente `db` tem healthcheck configurado. Ele executa:

```text
mysqladmin ping -h localhost -u${DB_USER} -p${DB_PASSWORD}
```

com intervalo de 30 segundos, timeout de 5 segundos e 5 tentativas. O serviço `api` depende de `db` com a condição `service_healthy`. Não há healthcheck Docker configurado para `api` e não há API de saúde implementada no arquivo de aplicação revisado.

`express.json()` é registrado sem limite explícito; portanto, usa o limite padrão do Express. Um erro de parsing de JSON não é tratado especificamente: como não é `AppError`, atualmente alcança o tratamento genérico e retorna `500`.

## Bloqueios e inconsistências verificáveis

1. **Build TypeScript bloqueado pelo nome da porta:** o schema exporta a propriedade `PORT`, mas `src/server.ts` usa `env.port`. A propriedade em minúsculas não existe no tipo inferido pelo schema; consequentemente, o comando `npm run build` (`tsc`) não pode compilar esse acesso como está.
2. **Dependência ausente do manifesto:** `src/config/env.ts` importa `zod`, mas `zod` não consta em `dependencies` nem em `devDependencies` de `backend/package.json`. Uma instalação limpa a partir desse manifesto não declara essa dependência necessária à compilação/execução.
3. **Porta interna divergente:** o backend define `PORT` com padrão `3333`, enquanto o Dockerfile expõe `4000` e o Compose encaminha `${PORT_APP}` para a porta interna `4000`. O Compose não define `PORT=4000`. Mesmo após corrigir o acesso `env.port`, seria necessário alinhar explicitamente a porta usada pelo processo com a porta publicada pelo container.
4. **Localização do `.env` não alinhada:** o README instrui configurar `.env` na raiz, mas o carregamento local não informa caminho e os scripts pertencem a `backend/`. Já no Docker Compose, o `.env` da raiz é usado tanto para interpolação quanto pelo `env_file` do serviço `api`.

Enquanto os dois primeiros itens permanecerem, o build executado pelo Dockerfile (`RUN npm run build`) também fica bloqueado; por isso `docker-compose up -d --build` não é uma inicialização funcional do backend no estado atual.

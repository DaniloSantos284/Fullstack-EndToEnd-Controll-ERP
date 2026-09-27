# backend/

## Responsibility

Serviço REST de estoque em Node.js, Express e TypeScript. Expõe operações de produto e movimentação de estoque, com persistência MySQL. O banco e a orquestração estão fora deste diretório, em `../db/init.sql` e `../docker-compose.yml`.

## Entry points and execution

- `pnpm dev` executa `tsx watch src/server.ts`; `pnpm build` compila `src/` para `dist/`; `pnpm start` executa `dist/server.js`.
- Testes: Jest e ts-jest são configurados em `jest.config.cjs`, com testes em `tests/unit/` e `tests/http/`. Supertest acessa a aplicação Express pelo helper `tests/helpers/http-client.ts`; o setup do Jest substitui o módulo de conexão por um mock, sem MySQL real. Os scripts incluem execução, watch, cobertura, CI e checagem de tipos separada com `tsconfig.test.json`. Convenções, versões e limites estão em [`tests/README.md`](tests/README.md).
- `src/server.ts` é o ponto de entrada: obtém `app` e `env`, então chama `app.listen(env.port)`.
- O `Dockerfile` é multi-stage com `node:22-slim`: nos dois estágios habilita o Corepack; o build instala dependências e compila o TypeScript, enquanto o runtime instala somente dependências de produção, recebe `dist/` e executa como o usuário `node`. O Compose constrói este diretório como o serviço `api`, é operado com `docker compose`, usa valores padrão de desenvolvimento sem exigir `.env` e aceita suas substituições por meio de `.env.example` copiado para `.env`.

## Design

- Organização em camadas: `domain` contém entidades, enums e contratos de repositório; `application/use-cases` orquestra regras; `infra/db/mysql` implementa os contratos; `http` adapta Express a casos de uso.
- A composição de dependências é manual em `src/http/routes/products.routes.ts`: um único `MySqlStockMovementRepository` é compartilhado pelo repositório de produtos e pelos seis casos de uso; controllers são instanciados no carregamento do módulo.
- `Product` é um agregado com quantidade derivada dos movimentos em memória; `StockMovementMapper` converte os valores persistidos `in`/`out` para `ENTRY`/`EXIT`.
- Erros previstos usam `AppError` com `statusCode`; os handlers assíncronos nas rotas encaminham rejeições a `errorHandler`.

## Flow

1. Carregar `server.ts` importa `app`; as rotas importam repositórios MySQL, cuja conexão importa e valida `config/env` durante a inicialização.
2. `app.ts` instala JSON, serviço estático em `/uploads`, o router em `/api` e o middleware global de erro; então `server.ts` inicia a escuta.
3. Uma requisição percorre `route -> controller -> use case -> repository -> mysql2/promise` e retorna JSON. Consultas reconstituem `Product` com seus movimentos; entradas e saídas persistem somente um novo `stock_movements`.

Rotas publicadas: `GET`/`POST /api/products`, `GET /api/products/:id`, `POST /api/products/:id/stock/entry`, `POST /api/products/:id/stock/exit` e `GET /api/products/:id/movements`.

## Integration

- Dependências diretas: `express`, `mysql2/promise` e `dotenv`; o código de configuração também importa `zod`.
- O Compose publica a porta de desenvolvimento configurável para `4000` no contêiner, monta o diretório versionado `backend/uploads` e conecta a API à rede do serviço MySQL `db`. O schema cria `products` e `stock_movements`; a infraestrutura usa essas duas tabelas.
- Não há cliente web ou mobile versionado neste repositório; os consumidores atuais são o contrato HTTP acima e os arquivos de Compose/banco.

## Inconsistências observáveis

- `products.quantity` é inserido, mas leituras calculam o saldo a partir de `stock_movements`; entradas e saídas não atualizam a coluna. Não há transação envolvendo validação de saldo e gravação do movimento.

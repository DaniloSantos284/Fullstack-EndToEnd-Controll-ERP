# backend/src/

## Responsibility

Implementa o processo HTTP da API de estoque: bootstrap Express, configuração de ambiente, regras de produto/movimento, persistência MySQL e adaptadores HTTP.

## Entry points and initialization

- `server.ts` é executável e inicia a aplicação na porta lida de `config/env`.
- `app.ts` cria a instância Express, registra `express.json()`, serve `../uploads` em `/uploads`, monta as rotas de produtos em `/api` e registra `errorHandler` por último.
- A importação de `app` já avalia `products.routes.ts`: nela são construídos repositórios, casos de uso e controllers. A criação do pool MySQL importa `config/env`, que carrega `.env`, valida `process.env` e pode interromper o bootstrap antes de `listen`.

## Design

- `domain/`: entidades `Product` e `StockMovement`, enums e interfaces de repositório. `Product.quantity` reduz a coleção de movimentos com sinal e bloqueia saída acima do saldo atual.
- `application/use-cases/`: comandos de criação e movimentação e consultas de produtos/histórico. Recebem interfaces de repositório por construtor e projetam respostas HTTP sem depender de Express.
- `infra/db/mysql/`: pool `mysql2/promise`, repositórios SQL e mapper de movimentos. `MySqlProductRepository` hidrata cada produto com seus movimentos.
- `http/`: router como composition root, controllers com método `handle(req, res)` e middleware que transforma `AppError` em `{ "message" }`; os demais erros recebem `500`.
- As rotas não usam container de DI nem schemas HTTP centralizados: validam parâmetros e bodies nos próprios controllers/use cases e conectam promessas a `next` manualmente.

## Flow

### Escrita

`POST /api/products` valida campos, cria `Product` com UUID e insere uma linha. As rotas de entrada/saída obtêm o produto com movimentos, criam `StockMovement` com UUID, aplicam a regra de saldo no agregado e inserem o movimento.

### Leitura

`GET /products` consulta as linhas de produtos e, para cada uma, consulta seus movimentos; o saldo exposto é calculado. `GET /products/:id` devolve produto e movimentos. `GET /products/:id/movements` primeiro confirma o produto e depois consulta os movimentos novamente. Datas são serializadas pelo Express a partir de `Date`.

## Integration

- `routes/products.routes.ts` integra HTTP, casos de uso e as implementações MySQL; todas as rotas recebem o prefixo `/api` de `app.ts`.
- `connection.ts` consome `config/env`; os repositórios usam as tabelas `products` e `stock_movements` criadas em `../../db/init.sql`.
- A representação de movimento atravessa as camadas como `ENTRY`/`EXIT` no domínio e como `in`/`out` no MySQL. A pasta de uploads é apenas servida estaticamente; não há rota de upload.

## Inconsistências observáveis

- A configuração não compõe com seus consumidores: o tipo de `env` tem campos em maiúsculas e os consumidores usam nomes camelCase. Além disso, `zod` não é dependência declarada.
- O projeto não passa na checagem de tipos com o código atual: `price` e `category` privados de `Product` são lidos por `ListProductsUseCase`, `GetProductDetailsUseCase`, `CreateProductUseCase` e `MySqlProductRepository`.
- `findAll` executa uma consulta de movimentos por produto; a rota de movimentos carrega esses movimentos durante `findById` e os consulta uma segunda vez para a resposta.
- Os movimentos são carregados em ordem `created_at DESC` e reconstituídos via `Product.addMovement`, que aplica a validação de saída como se fosse um comando novo. Assim, uma saída mais recente pode ser avaliada antes das entradas históricas que a sustentam.
- A tabela armazena `products.quantity`, mas a aplicação não a usa na hidratação e não a atualiza ao registrar movimentos; as operações de saída fazem leitura, validação e inserção sem transação SQL.

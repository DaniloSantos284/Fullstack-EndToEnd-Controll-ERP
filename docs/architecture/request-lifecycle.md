# Ciclo de request até a persistência

> **Estado documentado:** fluxo implementado hoje. Os caminhos descritos dependem de o processo receber uma configuração de ambiente válida; a execução local e em contêiner está documentada em [runtime](../operations/runtime.md).

## Visão do fluxo comum

Depois do bootstrap, a aplicação registra o router de produtos em `/api`. Uma chamada para uma rota conhecida percorre o caminho abaixo:

```text
Cliente HTTP
  -> express.json() (quando aplicável)
  -> Router /api
  -> callback da rota: controller.handle(...).catch(next)
  -> controller
  -> caso de uso
  -> interface de repositório do domínio
  -> repositório MySQL e pool mysql2/promise
  -> MySQL (products e/ou stock_movements)
  -> caso de uso/controller
  -> resposta JSON

Erros rejeitados -> next(error) -> errorHandler
```

`express.json()` é executado antes das rotas. Não existem middlewares de autenticação, autorização, CORS, correlação de request, rate limit ou validação declarativa de schema. A rota estática `/uploads` é montada antes de `/api` e não atravessa controllers ou casos de uso.

Os callbacks das rotas retornam a promessa de `controller.handle(...).catch(next)`, pois são expressões arrow. O Express 4 ignora esse retorno, mas o `.catch(next)` encaminha explicitamente rejeições assíncronas dos controllers ao middleware global `errorHandler`.

## Bootstrap que prepara o caminho

O ciclo de requests só existe após a seguinte sequência de carregamento:

1. [`server.ts`](../../backend/src/server.ts) importa `app` e `env`.
2. [`app.ts`](../../backend/src/app.ts) importa o router de produtos e o middleware de erro.
3. O módulo de rotas importa repositórios MySQL. A importação de `connection.ts` carrega `config/env.ts`, que importa `dotenv/config`, valida `process.env` e cria o pool MySQL no carregamento do módulo.
4. Ainda no módulo de rotas, repositórios, casos de uso e controllers são instanciados manualmente uma única vez.
5. A aplicação Express instala, nesta ordem: parser JSON, arquivos estáticos `/uploads`, router `/api` e middleware de erro.
6. `server.ts` tenta chamar `app.listen(env.port)`.

O módulo de configuração valida o ambiente com Zod, e `server.ts` inicia a escuta com a porta normalizada exportada por esse módulo. O fluxograma descreve a sequência de inicialização implementada.

## Entrada e validação HTTP

### Criação de produto

`POST /api/products` segue este caminho:

1. `CreateProductController` extrai `name`, `price`, `category`, `imageUrl` e `barCode` de `req.body ?? {}`.
2. O controller exige `name` string, `price` number e `category` string. Ele verifica que categoria pertence a `ProductCategory`; somente `imageUrl` e `barCode` strings são repassados.
3. `CreateProductUseCase` valida novamente nome não vazio e preço numérico, não `NaN` e não negativo.
4. O caso de uso cria `Product`, que gera um UUID e também valida nome e preço.
5. `MySqlProductRepository.save` executa `INSERT INTO products` com ID, dados cadastrais e `product.quantity` (zero para o novo agregado sem movimentos).
6. O caso de uso projeta o produto para DTO e o controller responde `201`.

O corpo não é validado por schema compartilhado, não há rejeição explícita de campos desconhecidos, não há limite de tamanho configurado para JSON e o banco não recebe validações de categoria, formato de UUID ou precisão monetária além de suas próprias colunas.

### Leituras de produto

#### `GET /api/products`

1. `ListProductsController` chama `ListProductsUseCase.execute()` sem entrada.
2. `MySqlProductRepository.findAll` executa `SELECT * FROM products` sem `ORDER BY`, paginação ou limite.
3. Para cada linha, `mapRowToProduct` cria `Product`, altera o ID gerado com `(product as any).id` e consulta os movimentos daquele produto.
4. Os movimentos são buscados com `SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC`, mapeados e adicionados um a um ao produto.
5. O caso de uso devolve `id`, `name`, `price`, `category`, `imageUrl` e `quantity`, cujo valor vem da soma dos movimentos em memória.
6. O controller responde `200` com o array.

Cada produto causa uma consulta adicional de movimentos, em série. Logo, a lista tem uma consulta inicial mais uma por produto; esse é o padrão N+1 vigente.

#### `GET /api/products/:id`

1. `GetProductDetailsController` lê `req.params.id`. Se não for string não vazia, responde diretamente `400` com `{ "message": "Id do produto inválido" }`.
2. `GetProductDetailsUseCase` chama `ProductRepository.findById`.
3. O repositório busca uma linha de `products` por ID, reconstitui o agregado e carrega os movimentos como na listagem.
4. Sem produto, o caso de uso lança `AppError("Product not found", 404)`.
5. Com produto, ele monta a resposta contendo campos cadastrais, saldo derivado e movimentos. `createdAt` é um `Date`; o serializador JSON do Express o converte para string ISO.
6. O controller devolve `200`.

### Movimento de estoque

As rotas de entrada e saída têm o mesmo formato de entrada: `POST /api/products/:id/stock/entry` ou `POST /api/products/:id/stock/exit`, com `{ "quantity": number }`.

O fluxo comum é:

1. O controller valida `id` como string não vazia e `quantity` como número, não `NaN` e maior que zero. Falhas lançam `AppError` com status `400`.
2. O caso de uso correspondente valida a quantidade novamente (a validação de entrada não verifica explicitamente `typeof`/`NaN`, mas o controller já o faz no caminho HTTP).
3. `productRepository.findById` busca o produto e carrega todo o seu histórico de movimentos.
4. Se não houver produto, o caso de uso lança `AppError` com `404`.
5. O caso de uso cria `StockMovement` com UUID novo, ID do produto, quantidade e tipo `ENTRY` ou `EXIT`. A entidade também exige quantidade positiva.
6. `product.addMovement` acrescenta a entrada; para saída, calcula o saldo existente e lança `AppError("Insufficient stock", 400)` se o valor solicitado for maior.
7. `stockMovementRepository.save` mapeia o enum para `in` ou `out` e executa um `INSERT INTO stock_movements`.
8. Se a inserção resolver, o controller responde `201` com `{ "ok": true }`.

O produto modificado em memória não é salvo após esse passo. Em particular, `products.quantity` não é atualizado; o resultado que a API exibe nas leituras posteriores é calculado novamente com os movimentos persistidos.

#### Entrada e saída, em detalhe

```text
POST /api/products/:id/stock/{entry|exit}
  -> controller: valida id e quantity
  -> use case: busca Product agregado
      -> SELECT products por id
      -> SELECT stock_movements por product_id
  -> cria StockMovement (UUID, tipo, quantidade, data atual)
  -> Product.addMovement
      -> saída: valida saldo derivado
  -> INSERT stock_movements
  -> 201 { ok: true }
```

Não há transação que una a leitura do saldo, a validação de saída e o `INSERT`. Duas saídas concorrentes podem carregar o mesmo saldo e ambas satisfazer a validação antes de persistirem. O banco também não possui uma atualização condicional do saldo que pudesse impedir esse cenário.

### Listagem de movimentos

`GET /api/products/:id/movements` usa uma sequência distinta:

1. `ListProductMovementsController` valida o ID e chama `ListProductMovementsUseCase`.
2. O caso de uso chama `productRepository.findById` apenas para confirmar a existência. Essa chamada já busca e reconstitui os movimentos.
3. Existindo o produto, o caso de uso chama `stockMovementRepository.findByProductId` outra vez.
4. O controller devolve `200` com as próprias entidades `StockMovement`.

Na serialização, os campos públicos da entidade chegam como `id`, `productId`, `type`, `quantity` e `createdAt`; a data é convertida em ISO pelo JSON. Não há DTO específico, paginação ou ordenação com desempate. A consulta SQL ordena apenas por `created_at DESC`, portanto movimentos com mesmo timestamp não têm ordem determinística adicional.

## Reconstituição e cálculo de saldo

O repositório de produto não toma o valor da coluna `products.quantity` como o saldo do domínio. Para cada leitura:

```text
linha products
  -> new Product(nome, preço, categoria, opcionais)
  -> troca do UUID recém-gerado pelo id da linha usando any
  -> movimentos da tabela stock_movements, por data decrescente
  -> product.addMovement(movimento) para cada item
  -> product.quantity = soma de entradas menos saídas
```

Isso torna `stock_movements` a fonte de cálculo efetivamente usada nas respostas, enquanto `products.quantity` permanece como uma representação persistida não sincronizada depois da criação. Há ainda um efeito importante: usar `addMovement` para hidratar histórico aplica a regra de uma operação nova. Como os movimentos vêm em ordem decrescente, uma saída mais recente pode ser processada antes da entrada anterior e causar erro de estoque insuficiente durante uma leitura, mesmo se o histórico total for coerente.

## Persistência SQL e fronteira de infraestrutura

O pool é exportado como singleton por `connection.ts` e os repositórios usam `db.execute`. Não há passagem de `PoolConnection`, transação explícita, retry, timeout por operação, circuit breaker ou mapeamento consistente de exceções de infraestrutura.

| Operação | SQL/caminho principal | Observação |
| --- | --- | --- |
| Criar produto | `INSERT INTO products` | Persiste saldo inicial derivado (zero). O repositório converte qualquer erro em `AppError` `400`. |
| Buscar produto | `SELECT * FROM products WHERE id = ? LIMIT 1` + movimentos | Reconstitui agregado e pode encapsular falhas como `400`. |
| Listar produtos | `SELECT * FROM products` + movimentos por linha | Sem `ORDER BY` e sujeito a N+1. |
| Gravar movimento | `INSERT INTO stock_movements` | Não atualiza `products.quantity`, não cria transação e não traduz erros. |
| Buscar movimentos | `SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC` | Mapper converte `in` em entrada e qualquer outro tipo em saída. |

As tabelas são criadas por `db/init.sql` quando o volume MySQL é inicializado. `stock_movements.product_id` tem chave estrangeira para `products.id` e índice em `product_id`; não há constraint SQL para impedir quantidade negativa/zero, preço negativo ou saldo negativo em movimentos acumulados.

## Respostas e erros

O tratamento é parcialmente centralizado:

- Controllers que lançam `AppError`, e casos de uso que o fazem, chegam a `errorHandler` pelo `.catch(next)` das rotas.
- `errorHandler` devolve `error.statusCode` e `{ "message": error.message }` para `AppError`.
- Erros que não são `AppError` são escritos com `console.error` e respondem `500` com `{ "message": "Erro de servidor" }`.
- `GetProductDetailsController` trata ID inválido diretamente, sem `AppError`, mas devolve a mesma forma de mensagem com status `400`.
- JSON malformado, rota inexistente, erros de banco e erros de parser não têm mapeamento específico. Em especial, erros de banco podem virar `400` no repositório de produto ou `500` genérico no de movimentos.

Não há códigos de erro, request ID, estrutura de log ou distinção explícita entre validação, conflito de saldo, indisponibilidade de banco e falha inesperada. A saída por estoque insuficiente é hoje um `400`, não um conflito específico.

## Pontos de atenção por request

- Toda leitura de produto carrega o histórico completo para calcular saldo; produtos com muitos movimentos aumentam custo e tamanho de resposta em detalhes.
- Listar produtos executa consultas por produto e não pagina o resultado.
- A listagem de movimentos busca os mesmos movimentos duas vezes no caminho bem-sucedido.
- `products.quantity` pode ser lido diretamente por outros consumidores do banco, mas não representa necessariamente o saldo que a API calcula.
- A validação de saldo acontece fora de transação; o resultado pode ficar incorreto sob concorrência.
- Campos opcionais de produto são incluídos na criação apenas se forem strings não vazias no caso de uso; não há normalização geral de payload ou contrato único de resposta.

Para a visão de componentes, composição manual e demais limitações, consulte a [Visão geral da arquitetura](overview.md). Consulte também o [contrato HTTP atual](../api/http-api.md), o [modelo e a persistência MySQL](../data/mysql.md) e o [registro de decisões arquiteturais](decisions.md).

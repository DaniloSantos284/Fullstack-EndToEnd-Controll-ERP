# backend/src/application/use-cases/

## Responsibility

Implementa seis operações de aplicação para produtos e estoque:

| Caso de uso | Entrada -> saída | Responsabilidade |
| --- | --- | --- |
| `CreateProductUseCase` | dados do produto -> DTO do produto | valida e cria um produto, depois o persiste. |
| `ListProductsUseCase` | sem entrada -> DTOs resumidos | lista produtos e seus saldos calculados. |
| `GetProductDetailsUseCase` | `productId` -> DTO detalhado | consulta um produto com movimentos. |
| `ListProductMovementsUseCase` | `{ productId }` -> `StockMovement[]` | confirma que o produto existe e lista seus movimentos. |
| `AddStockEntryUseCase` | `{ productId, quantity }` -> `void` | registra uma entrada. |
| `AddStockExitUseCase` | `{ productId, quantity }` -> `void` | registra uma saída, delegando a verificação de saldo ao agregado. |

Os tipos de entrada e saída são locais aos arquivos; não são exportados.

## Design

Todos os colaboradores são injetados pelo construtor como interfaces, e não como
classes MySQL:

| Caso de uso | Interfaces injetadas | Operações chamadas |
| --- | --- | --- |
| `CreateProductUseCase` | `ProductRepository` | `save` |
| `ListProductsUseCase` | `ProductRepository` | `findAll` |
| `GetProductDetailsUseCase` | `ProductRepository` | `findById` |
| `ListProductMovementsUseCase` | `ProductRepository`, `StockMovementRepository` | `findById`, `findByProductId` |
| `AddStockEntryUseCase` | `ProductRepository`, `StockMovementRepository` | `findById`, `save` |
| `AddStockExitUseCase` | `ProductRepository`, `StockMovementRepository` | `findById`, `save` |

A composição concreta em `http/routes/products.routes.ts` usa
`MySqlStockMovementRepository` e `MySqlProductRepository`. Este último recebe o
repositório de movimentos para reidratar os produtos com seus movimentos. Os
casos de uso, porém, só podem assumir o contrato declarado pelas interfaces;
esse contrato não expressa a hidratação necessária para calcular o saldo.

`CreateProductUseCase` cria `Product`. Os dois casos de estoque geram um UUID
com `randomUUID()`, criam `StockMovement` com `ENTRY` ou `EXIT`, chamam
`product.addMovement(...)` e persistem o movimento. A quantidade é derivada de
movimentos pelo agregado, não atualizada diretamente por estes casos de uso.

## Flow

### Sequências de execução

1. **Criar produto** — rejeita `name` vazio/em branco; rejeita `price` que não
   seja `number`, seja `NaN` ou negativo; constrói `Product` com os campos
   opcionais somente se forem *truthy*; chama `productRepository.save`; devolve
   o DTO com o UUID gerado pela entidade.
2. **Listar produtos** — chama `productRepository.findAll`; mapeia cada entidade
   para `id`, `name`, `price`, `category`, `imageUrl` e `quantity`. Com a
   implementação MySQL atual, `price` pode ser string em runtime: a coluna é
   `DECIMAL(10,2)` e não há `decimalNumbers: true` nem conversão no repositório.
3. **Detalhar produto** — chama `productRepository.findById(productId)`;
   quando encontra o produto, mapeia seus campos, `quantity` e a cópia de
   `product.movements` para um DTO de detalhes. Seu `price` tem a mesma ressalva
   de leitura `DECIMAL(10,2)`: pode ser string em runtime sem conversão MySQL.
4. **Listar movimentos** — valida `productId` não vazio/apenas espaços; consulta
   o produto; se existir, chama
   `stockMovementRepository.findByProductId(input.productId)` e devolve as
   entidades retornadas.
5. **Registrar entrada** — rejeita quantidade `<= 0`; busca o produto; cria o
   movimento `ENTRY`; adiciona-o ao agregado; chama
   `stockMovementRepository.save`.
6. **Registrar saída** — exige que a quantidade seja `number`, não seja `NaN` e
   seja maior que zero; busca o produto; cria o movimento `EXIT`; adiciona-o ao
   agregado (que rejeita saldo insuficiente); chama
   `stockMovementRepository.save`.

Na composição MySQL atual, buscar um produto também busca seus movimentos para
reconstruir o agregado. Por isso, `ListProductMovementsUseCase` faz uma consulta
de movimentos ao buscar o produto e faz outra ao chamar explicitamente
`findByProductId`.

### Erros produzidos

| Caso de uso | Condição | `AppError` (mensagem, status) |
| --- | --- | --- |
| Criar produto | nome vazio/em branco | `Nome do produto é obrigatório.`, 400 |
| Criar produto | preço não numérico, `NaN` ou negativo | `Preço inválido`, 400 |
| Detalhar produto | repositório retorna `null` | `Product not found`, 404 |
| Listar movimentos | `productId` vazio/em branco | `Parâmetro productId inválido.`, 400 |
| Listar movimentos | repositório retorna `null` | `Produto não encontrado.`, 404 |
| Entrada | quantidade `<= 0` | `A quantidade deve ser maior que zero.`, 400 |
| Entrada | repositório retorna `null` | `Produto não encontrado`, 404 |
| Saída | quantidade não numérica, `NaN` ou `<= 0` | `A quantidade deve ser maior que zero.`, 400 |
| Saída | repositório retorna `null` | `Produto não encontrado`, 404 |
| Saída | `Product.addMovement` detecta saldo menor que a saída | `Insufficient stock`, 400 |

Erros lançados por entidades ou repositórios não são capturados nem traduzidos
pelos casos de uso: são propagados ao chamador. `ListProductsUseCase` não lança
`AppError` diretamente.

## Integration

Controllers HTTP recebem uma instância do caso de uso correspondente e chamam
`execute`; as rotas encaminham as rejeições ao `errorHandler`. `AppError` é
convertido ali em `{ message }` com o status associado.

Limitações verificáveis:

- `AddStockEntryUseCase` não verifica `typeof quantity` nem `Number.isNaN`.
  Portanto, diferentemente da saída, `NaN` não é rejeitado por sua condição
  `quantity <= 0` (nem pelo construtor de `StockMovement`, que usa a mesma
  comparação). Os controllers de entrada evitam esse valor na rota HTTP, mas um
  chamador direto do caso de uso não recebe essa proteção.
- entrada e saída não validam o formato ou conteúdo de `productId`; dependem da
  busca no repositório. `GetProductDetailsUseCase` também não o valida. A rota
  HTTP valida o parâmetro antes de chamar esses casos.
- `CreateProductUseCase` tipa `category` como `ProductCategory`, mas não faz
  validação de enum em tempo de execução; essa validação existe no controller.
  O preço `Infinity` também não é rejeitado pela validação do caso de uso.
- entre `findById`, `addMovement` e `save` não há transação nem atualização do
  produto. A garantia contra saldo insuficiente é somente a verificação no
  agregado carregado em memória; chamadas concorrentes não são sincronizadas
  por este código e podem aprovar saídas que, juntas, excedem o saldo;
- a implementação MySQL devolve movimentos em ordem decrescente de criação e
  `MySqlProductRepository` os reaplica nessa ordem ao construir `Product`. Uma
  saída recente pode, assim, ser avaliada antes das entradas anteriores e fazer
  a reidratação falhar; o repositório a encapsula como `AppError` com mensagem
  `Erro ao buscar esse produto` e status 400. Mais amplamente, em `findById` a
  falha da consulta SQL é convertida em `Erro ao procurar pelo id`, mas o método
  retorna `mapRowToProduct` sem `await`; falhas de hidratação mantêm a mensagem
  `Erro ao buscar esse produto`. Em `findAll`, o `await` no laço captura falhas de
  consulta e de hidratação como `Erro ao buscar produtos no banco`.

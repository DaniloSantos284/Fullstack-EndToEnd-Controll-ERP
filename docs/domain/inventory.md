# Domínio de inventário

## Escopo e estado implementado

O domínio atual modela estoque como um agregado `Product` e um histórico de
`StockMovement`. Há dois tipos de movimento: `ENTRY` (entrada) e `EXIT`
(saída). As rotas HTTP estão sob `/api`.

| Elemento | Estado implementado |
| --- | --- |
| `Product` | Produto com `id`, `name`, `price`, `category`, `imageUrl` opcional, `barCode` opcional e movimentos em memória. O `id` é gerado com UUID na criação. |
| `StockMovement` | Evento com `id`, `productId`, `type`, `quantity` e `createdAt`. Os comandos geram seu UUID e usam o instante corrente. |
| Categorias | `FOOD`, `ELECTRONICS`, `CLOTHING`, `CLEANING`, `OFFICE` e `OTHER`. |
| Tipos de movimento | `ENTRY` e `EXIT`. No MySQL eles são persistidos, respectivamente, como `in` e `out`. |
| Persistência | Tabelas `products` e `stock_movements`, com FK de movimento para produto e `ON DELETE CASCADE`. |

O produto não mantém uma quantidade mutável no modelo. A propriedade
`quantity` é calculada sempre a partir de `stockMovements`:

```text
quantity = Σ movimento.getSignedQuantity()
getSignedQuantity() = -quantity, se EXIT; +quantity, nos demais casos
```

Assim, para movimentos válidos, entradas somam e saídas subtraem. A ordem não
altera essa soma, mas altera a validação de saldo quando movimentos são
adicionados um a um.

## Invariantes atualmente aplicados

### Produto

- `name` é obrigatório e não pode ser vazio após `trim`; o valor armazenado não
  é normalizado, portanto os espaços nas extremidades permanecem.
- `price` não pode ser menor que zero no construtor. Zero é aceito.
- `addMovement` recusa uma saída quando a quantidade calculada antes dela é
  menor que a quantidade solicitada; logo, no agregado carregado corretamente,
  uma saída não deveria reduzir o saldo abaixo de zero.
- O getter `movements` retorna uma cópia do array. Isso protege a coleção contra
  `push` externo, mas não torna os objetos retornados imutáveis em runtime.
  `readonly` só restringe reatribuições na checagem do TypeScript; em particular,
  `createdAt` é um `Date` mutável e pode ser alterado por quem detenha a referência.

### Movimento

- A quantidade precisa ser maior que zero no construtor.
- `createdAt` recebe `new Date()` se não for fornecido.
- `id` e `productId` são recebidos como strings, sem validação de formato UUID.
  Os casos de uso atuais de entrada e saída geram o `id` com `randomUUID()`.
- Não há validação da associação entre um movimento e o produto que o recebe, nem
  validação explícita de que `type` pertence ao enum. Um tipo inválido é tratado
  como entrada pelo cálculo, pois somente `EXIT` recebe sinal negativo.

### Validações na camada de aplicação/HTTP

- A criação HTTP valida categoria contra `ProductCategory`; o caso de uso de
  criação não a valida em tempo de execução.
- Criação valida que o preço é `number`, não é `NaN` e não é negativo. Não exige
  número finito.
- As duas rotas de entrada e saída validam `quantity` como `number`, não `NaN`
  e maior que zero. A saída repete essa validação no caso de uso; a entrada, no
  caso de uso, testa apenas `quantity <= 0`.

## Comandos

| Caso de uso / rota | Entrada | Efeito e resposta |
| --- | --- | --- |
| `CreateProductUseCase` / `POST /api/products` | `name`, `price`, `category`, `imageUrl?`, `barCode?` | Cria e insere o produto. A rota responde `201` com `id`, nome, preço, categoria e campos opcionais informados. O estoque inicial é zero, pois não há movimentos. |
| `AddStockEntryUseCase` / `POST /api/products/:id/stock/entry` | `quantity` e `:id` | Confere a existência do produto, cria `ENTRY`, adiciona-o ao agregado em memória e insere o movimento. Resposta HTTP: `201 { "ok": true }`. |
| `AddStockExitUseCase` / `POST /api/products/:id/stock/exit` | `quantity` e `:id` | Confere a existência, cria `EXIT`, e só persiste se `product.addMovement` aprovar o saldo. Resposta HTTP: `201 { "ok": true }`. |

Nos comandos de movimento, produto inexistente resulta em `404`; quantidade
inválida e saldo insuficiente resultam em `400`. Os comandos não retornam o
movimento criado, o novo saldo, nem um identificador de correlação.

## Consultas

| Caso de uso / rota | Resultado |
| --- | --- |
| `ListProductsUseCase` / `GET /api/products` | Lista `id`, `name`, `price`, `category`, `imageUrl` e `quantity` calculada. Não expõe `barCode` nem movimentos. |
| `GetProductDetailsUseCase` / `GET /api/products/:id` | Retorna os dados do produto, `barCode`, quantidade calculada e movimentos com `id`, `type`, `quantity` e `createdAt`. Produto ausente resulta em `404`. |
| `ListProductMovementsUseCase` / `GET /api/products/:id/movements` | Valida a existência do produto e retorna diretamente os movimentos do repositório, incluindo `productId`. Na implementação MySQL, a ordem é `created_at DESC`. |

As interfaces não especificam ordenação, paginação, filtros ou limites. A
consulta de produtos faz uma consulta para os produtos e uma consulta de
movimentos para cada produto (`N+1`). A consulta exclusiva de movimentos carrega
o produto — o que já carrega seus movimentos — e depois faz outra consulta de
movimentos; portanto duplica essa leitura no adaptador MySQL atual.

## Contratos de repositório

```ts
interface ProductRepository {
  save(product: Product): Promise<void>;
  findById(id: string): Promise<Product | null>;
  findAll(): Promise<Product[]>;
}

interface StockMovementRepository {
  save(movement: StockMovement): Promise<void>;
  findByProductId(productId: string): Promise<StockMovement[]>;
}
```

Os contratos expõem apenas inserção e leitura. Eles não definem transações,
bloqueio, atualização, exclusão, ordenação, paginação, filtros ou semântica de
idempotência.

No adaptador MySQL, ambos os métodos chamados `save` executam somente `INSERT`;
eles não são *upsert*. `MySqlProductRepository.findById/findAll` reconstroem o
produto e carregam os movimentos. Como o construtor sempre gera UUID, a
reconstituição sobrescreve `id` depois da criação por meio de `(product as any)`.

O banco possui `products.quantity INT NOT NULL`, preenchido com
`product.quantity` na criação do produto. Esse campo não é atualizado quando um
movimento é gravado e também não é usado para reconstruir ou calcular o saldo:
no estado atual, é uma cópia persistida que fica em zero após a criação, enquanto
o saldo efetivo da aplicação vem de `stock_movements`.

## Limitações e inconsistências concretas

1. **Hidratação em ordem incompatível com a regra de saldo.**
   `findByProductId` usa `ORDER BY created_at DESC`, e a reconstituição adiciona
   cada movimento com `product.addMovement`. Uma saída recente pode ser carregada
   antes da entrada anterior que a cobria e ser rejeitada como estoque
   insuficiente. Por exemplo: entrada de 10 ontem e saída de 5 hoje. A soma seria
   5, mas a hidratação tenta a saída com saldo inicial 0 e falha.
2. **Concorrência permite sobrevenda.** A verificação de saldo é feita em memória
   após leitura dos movimentos e antes de um `INSERT` independente. Não há
   transação, bloqueio ou operação condicional no banco. Duas saídas concorrentes
   podem observar o mesmo saldo e ambas serem aceitas.
3. **Divergência entre o saldo e a coluna `products.quantity`.** A aplicação trata
   os movimentos como fonte de cálculo, mas a coluna de quantidade não acompanha
   entradas e saídas. Consultas ou integrações que leiam essa coluna diretamente
   obterão um valor obsoleto.
4. **Regras numéricas incompletas.** Nem entidade nem casos de uso exigem valores
   inteiros ou finitos. A entrada por chamada direta pode aceitar `NaN`, pois
   `NaN <= 0` é falso; preço e saída também aceitam `Infinity`. Isso diverge das
   colunas `INT` de quantidade e `DECIMAL(10,2)` de preço. O banco também não
   declara `CHECK` para proibir quantidades/preços negativos em escrita externa.
5. **Consistência do agregado não é completamente protegida.**
   `Product.addMovement` não verifica se `movement.productId === product.id`.
   Além disso, ao receber `stockMovements` no construtor, o produto os atribui sem
   reaplicar a regra de saldo.
6. **Contratos de leitura não fixam ordenação.** O MySQL retorna movimentos em
   ordem decrescente de data, sem desempate para datas iguais; outro adaptador
   pode retornar outra ordem. A resposta de detalhes depende da ordem da coleção
   carregada, enquanto a lista de movimentos usa uma nova leitura.
7. **Inconsistência de encapsulamento e tipagem.** `Product.price` e
   `Product.category` são `private`, mas os casos de uso de criação, listagem e
   detalhes os acessam diretamente. Em TypeScript, esses acessos violam a
   visibilidade declarada e impedem a checagem de tipos. O domínio também importa
   `AppError` da camada de aplicação, invertendo a dependência entre as camadas.
8. **Metadados sem garantias de domínio.** Não há unicidade para `bar_code`,
   validação de categoria no banco (a coluna é `VARCHAR`), nem validação de UUID,
   data, razão ou documento de origem do movimento. `imageUrl` e `barCode` vazios
   são descartados por testes de valor *truthy*, e não por uma regra explícita.
9. **Operações ausentes nos contratos.** Não há edição ou exclusão de produto,
   ajuste/inventário, estorno, cancelamento ou correção de movimento. A exclusão
   em cascata existe no schema, mas não há comando de exclusão na aplicação.

## Decisões ainda pendentes

As escolhas abaixo não estão definidas pelo código atual; não representam
comportamento implementado.

- Definir uma única fonte de verdade para saldo: histórico derivado de movimentos
  ou coluna materializada `products.quantity`; se materializada, definir sua
  atualização atômica e reconciliação.
- Definir a semântica temporal da regra de saldo e a ordem canônica de
  hidratação/listagem dos movimentos, inclusive desempate de timestamps.
- Definir unidade e precisão: quantidades inteiras ou fracionárias, moeda e
  arredondamento do preço, e o tratamento de valores não finitos.
- Definir controle de concorrência e idempotência para entradas e saídas.
- Definir se categoria, código de barras, URLs, IDs e datas devem ter validação
  e/ou restrições de unicidade no domínio e no banco.
- Definir o ciclo de vida do histórico: ajustes, estornos, exclusões, motivo,
  documento de origem e auditoria.
- Definir o contrato de consulta para ordenação, paginação, filtros e formato
  uniforme dos movimentos nas duas consultas expostas.

# backend/src/application/

## Responsibility

Camada de aplicação do backend. Atualmente contém somente `use-cases/`: classes que
orquestram criação, consulta de produtos e registro/consulta de movimentos de
estoque. Elas recebem dados já extraídos pelos controllers, chamam o domínio e
persistem ou consultam por meio de repositórios.

Não há uma abstração comum de caso de uso, container de injeção ou transação
definidos neste diretório.

## Design

Cada caso de uso expõe `execute(...)` assíncrono e recebe suas dependências no
construtor. As dependências de persistência são as interfaces do domínio:

- `ProductRepository`: `save`, `findById` e `findAll`;
- `StockMovementRepository`: `save` e `findByProductId`.

Assim, os casos de uso não importam os repositórios MySQL concretos e podem ser
instanciados com outra implementação compatível. A composição de produção é
explícita em `src/http/routes/products.routes.ts`: cria
`MySqlStockMovementRepository`, injeta-o em `MySqlProductRepository` e fornece
essas instâncias aos casos de uso e, depois, aos controllers.

Os casos criam/agregam entidades `Product` e `StockMovement`, usam os enums
`ProductCategory` e `StockMovementType`, e devolvem DTOs em algumas consultas.
`ListProductMovementsUseCase` é a exceção: devolve entidades `StockMovement`
diretamente.

`AppError`, localizado em `use-cases/errors/`, é o erro esperado da aplicação.
Embora seja usado pelos casos de uso, ele também é importado por entidades e por
um repositório MySQL; portanto, na implementação atual o domínio e a
infraestrutura conhecem esse tipo da aplicação.

## Flow

Fluxo típico: controller valida parcialmente a requisição -> caso de uso executa
suas validações e regras de orquestração -> entidade aplica invariantes de
produto/movimento -> repositório injetado lê ou grava -> caso de uso retorna
`void`, DTO ou entidade. `AppError` sobe para o middleware HTTP, que responde
com `statusCode` e `message`.

Para estoque, o saldo é calculado por `Product.quantity` a partir dos movimentos
que o `Product` possui em memória. A implementação MySQL de
`ProductRepository.findById/findAll` reconstrói o produto carregando seus
movimentos. As operações de entrada e saída salvam apenas o novo movimento;
elas não chamam `ProductRepository.save` após `product.addMovement`.

Na implementação MySQL atual, `products.price` é `DECIMAL(10,2)`, mas o pool não
usa `decimalNumbers: true` e o repositório não converte esse campo. Portanto,
produtos lidos podem carregar/serializar `price` como string, apesar dos DTOs de
leitura o declararem como `number` no TypeScript. A criação preserva o `number`
recebido antes de qualquer releitura do banco.

## Integration

`http/routes/products.routes.ts` é o ponto de composição utilizado pelo sistema:
ele instancia os seis casos de uso, injeta-os nos controllers e encaminha
rejeições assíncronas para o middleware de erro. As implementações concretas
estão em `infra/db/mysql/`.

Limitações observáveis no código atual:

- as interfaces não exigem que um `Product` retornado esteja hidratado com
  movimentos; porém, saldo, detalhes e a proteção contra saída sem estoque
  dependem disso;
- não há transação, bloqueio ou compensação coordenados entre consultar o
  produto, calcular o saldo e salvar o movimento. Uma falha no `save` não
  desfaz a alteração feita apenas no objeto em memória; em particular, saídas
  concorrentes podem aprovar individualmente o mesmo saldo carregado e, juntas,
  excedê-lo;
- `MySqlStockMovementRepository.findByProductId` ordena movimentos por
  `created_at DESC`, e `MySqlProductRepository` os reaplica nessa mesma ordem
  com `Product.addMovement`. Como uma saída é validada contra o saldo parcial,
  uma sequência válida cujo movimento mais recente seja uma saída pode falhar
  durante a reidratação com `Insufficient stock`, que o repositório converte em
  `Erro ao buscar esse produto` (400);
- erros de persistência não são uniformemente convertidos pelos casos de uso:
  eles são propagados da implementação injetada. O middleware HTTP transforma
  somente instâncias de `AppError` em resposta conhecida; os demais erros viram
  HTTP 500. Em `MySqlProductRepository.findById`, erro da consulta SQL é capturado
  como `Erro ao procurar pelo id`, mas o retorno de `mapRowToProduct` não recebe
  `await`; por isso, falha posterior de hidratação preserva o `AppError`
  `Erro ao buscar esse produto`. Em `findAll`, o `await` do laço encapsula tanto a
  consulta quanto a hidratação como `Erro ao buscar produtos no banco`.

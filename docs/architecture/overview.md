# Visão geral da arquitetura

> **Estado documentado:** implementação atual do repositório. Este documento descreve o que o código faz e as limitações observáveis; não é uma especificação de arquitetura futura.

## Propósito e contexto

O backend é uma API REST de controle de produtos e movimentações de estoque. Ele expõe operações para criar e consultar produtos, registrar entradas e saídas e consultar o histórico de movimentos. A API está no pacote [`backend/`](../../backend/) e usa Node.js, Express e TypeScript; a persistência prevista é MySQL.

O repositório também contém o script de inicialização do banco em [`db/init.sql`](../../db/init.sql) e a orquestração em [`docker-compose.yml`](../../docker-compose.yml). Não existe frontend, autenticação, módulo de usuários nem fluxo de upload implementado no backend: há apenas a exposição estática da pasta `backend/uploads` em `/uploads`.

As rotas atualmente registradas sob o prefixo `/api` são:

| Método | Caminho | Responsabilidade |
| --- | --- | --- |
| `GET` | `/products` | Listar produtos com saldo calculado. |
| `GET` | `/products/:id` | Obter produto, saldo e histórico. |
| `POST` | `/products` | Criar produto. |
| `POST` | `/products/:id/stock/entry` | Registrar entrada. |
| `POST` | `/products/:id/stock/exit` | Registrar saída, desde que o saldo em memória seja suficiente. |
| `GET` | `/products/:id/movements` | Listar movimentos do produto. |

Para condições operacionais, variáveis e inconsistências de execução já registradas, consulte a documentação de [runtime](../operations/runtime.md). O fluxo detalhado de uma chamada está em [Ciclo de request até a persistência](request-lifecycle.md).

## Organização por camadas

O código segue uma separação de diretórios próxima a uma arquitetura em camadas. As dependências, contudo, não são estritamente unidirecionais: `Product` e `StockMovement`, no domínio, importam `AppError` da aplicação.

| Camada | Diretório | Componentes atuais | Papel efetivo |
| --- | --- | --- | --- |
| Bootstrap e configuração | `backend/src/server.ts`, `app.ts`, `config/` | `server`, instância Express, schema de ambiente | Carrega módulos, configura Express e inicia a escuta HTTP. |
| HTTP | `backend/src/http/` | rota de produtos, seis controllers, `errorHandler` | Converte `Request`/`Response` Express em chamadas de caso de uso; faz validações mínimas de HTTP. |
| Aplicação | `backend/src/application/use-cases/` | seis casos de uso e `AppError` | Orquestra regras e contratos de repositório. |
| Domínio | `backend/src/domain/` | `Product`, `StockMovement`, enums e interfaces de repositório | Representa produto e movimento, calcula saldo e aplica algumas invariantes. |
| Infraestrutura | `backend/src/infra/db/mysql/` | pool `mysql2`, dois repositórios MySQL e mapper | Executa SQL e converte linhas de `stock_movements` em entidades. |

O caminho de dependências usado em uma requisição é, em geral:

```text
Express route -> Controller -> Use case -> interface de repositório
                                           -> repositório MySQL -> pool MySQL
                             ^
                         entidades e enums do domínio
```

As interfaces `ProductRepository` e `StockMovementRepository` ficam no domínio e são recebidas pelos casos de uso nos construtores. As implementações concretas ficam na infraestrutura. Essa inversão é aplicada na maior parte das operações, mas a composição das concretas é feita diretamente no módulo de rotas, como descrito adiante.

## Componentes e responsabilidades

### Domínio

- `Product` recebe nome, preço, categoria e campos opcionais. O construtor rejeita nome vazio e preço negativo, gera um UUID e mantém movimentos em memória.
- O getter `quantity` soma `getSignedQuantity()` de todos os movimentos: entrada é positiva e saída é negativa.
- `addMovement` não permite adicionar uma saída quando o saldo calculado corrente é menor que a quantidade solicitada.
- `StockMovement` recebe `id` e `productId` como strings, exige quantidade positiva e guarda tipo e data; não valida o formato UUID. Nos comandos de estoque, os casos de uso fornecem o ID com `randomUUID()`.
- As categorias aceitas pelo controller de criação são os valores de `ProductCategory`: `FOOD`, `ELECTRONICS`, `CLOTHING`, `CLEANING`, `OFFICE` e `OTHER`.

### Aplicação

| Caso de uso | Dependências | Efeito |
| --- | --- | --- |
| `CreateProductUseCase` | `ProductRepository` | Valida nome e preço, instancia `Product`, salva-o e devolve um DTO. |
| `ListProductsUseCase` | `ProductRepository` | Busca todos os produtos e projeta o saldo derivado de movimentos. |
| `GetProductDetailsUseCase` | `ProductRepository` | Busca o agregado; devolve `404` via `AppError` se ele não existir. |
| `AddStockEntryUseCase` | Ambos os repositórios | Busca o produto, cria movimento `ENTRY`, adiciona-o ao agregado e grava apenas o movimento. |
| `AddStockExitUseCase` | Ambos os repositórios | Faz o mesmo para `EXIT`; a regra de saldo é executada por `Product.addMovement`. |
| `ListProductMovementsUseCase` | Ambos os repositórios | Valida a existência do produto e consulta seus movimentos. |

`AppError` contém somente `message` e `statusCode`. O middleware HTTP reconhece essa classe e a serializa como `{ "message": "..." }`; outros erros são registrados no console e retornam `500` com `{ "message": "Erro de servidor" }`.

### HTTP

`products.routes.ts` associa cada endpoint a uma instância de controller. Os handlers envolvem as promessas de `handle` com `.catch(next)`, encaminhando rejeições ao middleware global de erro do Express 4.

Os controllers leem `req.params` e `req.body`, validam apenas tipos e algumas condições básicas, chamam o caso de uso e devolvem JSON. Eles não usam um schema único para parâmetros ou corpos. `express.json()` é o único parser registrado. Para detalhes dos caminhos de leitura e escrita, veja o [ciclo de request](request-lifecycle.md).

### Persistência

O banco possui duas tabelas previstas:

- `products`, com dados cadastrais e uma coluna `quantity` obrigatória;
- `stock_movements`, com `product_id`, tipo `in`/`out`, quantidade e data, ligada a `products` por chave estrangeira.

`MySqlProductRepository.save` grava um produto, incluindo `product.quantity`, que é zero para um produto recém-criado sem movimentos. `findById` e `findAll` buscam linhas de `products`, reconstituem um `Product` e carregam seus movimentos por `StockMovementRepository`. Assim, as leituras expostas pela API derivam o saldo do histórico; as operações de entrada e saída não atualizam a coluna `products.quantity`.

`MySqlStockMovementRepository` grava e lista movimentos. `StockMovementMapper` traduz `ENTRY`/`EXIT` para `in`/`out` na gravação e faz o caminho inverso na leitura.

## Dependências e recursos externos

| Dependência/recurso | Uso no código atual |
| --- | --- |
| Node.js e `crypto.randomUUID` | Inicia o processo e gera IDs de produtos e movimentos. |
| Express 4 | Servidor, router, JSON, arquivos estáticos e middleware de erro. |
| TypeScript | Compilação para `dist/`, conforme `tsconfig.json`. |
| `mysql2/promise` | Cria um `Pool` e executa SQL com `execute`. |
| MySQL 8 | Serviço `db` configurado no Compose e destino das tabelas. |
| `dotenv/config` | Carrega variáveis de ambiente antes da validação. |
| Zod | É importado em `config/env.ts` para validar ambiente. Não está declarado no `package.json` nem no lockfile atuais. |
| Docker/Compose | O Dockerfile compila o backend; o Compose inicia `db` e `api`, monta `init.sql` e `uploads`. |

O módulo de conexão cria um único `Pool` durante o carregamento. Ele não recebe conexão por request e os repositórios usam esse pool global.

## Composição manual de objetos

Não há contêiner de injeção de dependência nem módulo de composição dedicado. Ao carregar `src/http/routes/products.routes.ts`, o módulo instancia, uma única vez:

```text
MySqlStockMovementRepository
        ↓
MySqlProductRepository(stockMovementRepository)
        ↓
casos de uso
        ↓
controllers
        ↓
callbacks das rotas Express
```

As mesmas instâncias de repositório e de casos de uso são reutilizadas por todas as requisições do processo. Os casos de uso dependem dos contratos do domínio em seus construtores, mas, na execução normal, recebem implementações MySQL. Para testes unitários, eles podem ser instanciados diretamente com implementações alternativas; não há fábrica ou configuração de teste no repositório atual.

## Fluxo de bootstrap

O caminho codificado de inicialização é:

1. O processo executa `src/server.ts` (em desenvolvimento via `tsx` ou a versão compilada em `dist/server.js`).
2. O carregamento de `app.ts` importa as rotas; as rotas importam os repositórios MySQL; a conexão importa `config/env.ts`.
3. `config/env.ts` carrega `dotenv/config`, valida as variáveis com Zod e, em caso de falha, lança erro antes de o servidor escutar uma porta.
4. Se essa etapa prosseguir, `connection.ts` cria o pool MySQL. Em seguida, o módulo de rotas faz a composição manual de repositórios, casos de uso e controllers.
5. `app.ts` cria o Express, aplica `express.json()`, expõe `/uploads`, monta o router em `/api` e registra o `errorHandler` após as rotas.
6. `server.ts` chama `app.listen(...)` com a porta que espera obter da configuração.

Esse é o fluxo presente no código, mas ele não se conclui de forma compilável/executável em uma instalação limpa pelos bloqueios listados abaixo. A documentação de [runtime](../operations/runtime.md) registra em detalhe a divergência de variáveis e portas entre aplicação, Dockerfile e Compose.

## Limitações arquiteturais relevantes

### Inicialização, configuração e entrega

- `env.ts` produz chaves em maiúsculas (`PORT`, `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_DATABASE`), enquanto `server.ts` e `connection.ts` acessam propriedades camelCase inexistentes, como `env.port` e `env.dbHost`. Isso é erro de tipo e impede a compilação TypeScript.
- `zod` é importado, mas não é dependência declarada no manifesto ou lockfile. Uma instalação limpa não contém uma dependência necessária ao módulo de configuração.
- O schema exige `PORT_DB`, mas a criação do pool não envia `port`; usa limite de conexão fixo `10`, ignorando `DB_CONNECTION_LIMIT` validado.
- A porta padrão do processo é `3333`, enquanto Dockerfile e Compose expõem/encaminham a porta interna `4000`; o Compose não define `PORT=4000`.
- A leitura de `.env` não fixa caminho. A execução local do pacote `backend` e a orientação de usar `.env` na raiz não estão alinhadas.
- Não há tratamento de encerramento gracioso do servidor nem fechamento explícito do pool.

### Modelo de domínio e persistência

- `Product.price` e `Product.category` são privados, mas casos de uso e repositório os acessam externamente. Além de violar o encapsulamento declarado, são erros de compilação TypeScript.
- Na reconstituição, `MySqlProductRepository` cria um novo `Product` (que gera UUID) e então substitui seu `id` usando `(product as any).id`. Não há factory ou caminho de reconstituição tipado.
- A reconstituição adiciona movimentos com `Product.addMovement`. Como a consulta traz os movimentos em ordem decrescente de data, uma saída histórica pode ser validada antes das entradas que a sustentam e falhar apesar de o histórico persistido ser válido.
- A coluna persistida `products.quantity` e o saldo derivado de `stock_movements` coexistem. Somente a criação grava a coluna; entradas e saídas não a atualizam, e leituras a ignoram. As duas representações podem divergir.
- Saídas fazem leitura, cálculo e inserção em operações separadas, sem transação, lock ou condição atômica no banco. Requisições concorrentes podem validar o mesmo saldo e persistir saídas incompatíveis com a regra de não negatividade.
- Não há constraints de banco para quantidade positiva, preço não negativo ou consistência do saldo derivado.
- `findAll` faz uma consulta de movimentos por produto, sequencialmente (padrão N+1). A listagem não tem paginação, ordem explícita nem limites.
- `GET /products/:id/movements` primeiro reconstitui o produto — o que já carrega os movimentos — e depois consulta os movimentos novamente.
- O mapper trata qualquer tipo de linha diferente de `in` como saída, sem validar valor inesperado; as linhas de banco também são tipadas como `any` nos repositórios.

### Fronteira HTTP e operação

- Não existem autenticação, autorização, CORS configurado, rate limiting, limite explícito de corpo, headers de segurança, request ID ou logging estruturado.
- `/uploads` é público e não há upload implementado que controle a origem ou o acesso aos arquivos.
- O middleware de erro não distingue erros de JSON inválido, infraestrutura, validação ou conflitos de estoque; vários erros de banco do repositório de produtos são convertidos em `400`, e erros do repositório de movimentos podem terminar como `500` genérico.
- Não há resposta JSON específica para rota inexistente, endpoint de healthcheck nem healthcheck do serviço `api`.
- Não há script de testes nem testes automatizados no pacote atual.
- O domínio importa `AppError` da aplicação, invertendo a direção de dependência sugerida pela divisão em camadas.

## Documentação relacionada

- [Ciclo de request até a persistência](request-lifecycle.md)
- [Operação em tempo de execução](../operations/runtime.md)
- [Levantamento de hardening e bloqueios](../feat-api-hardening-finalizacao.md)
- [README do repositório](../../README.md)

Referências complementares:

- [Contrato HTTP atual](../api/http-api.md)
- [Modelo e persistência MySQL](../data/mysql.md)
- [Registro de decisões arquiteturais](decisions.md)

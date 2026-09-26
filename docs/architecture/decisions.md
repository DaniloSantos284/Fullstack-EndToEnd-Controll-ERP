# Registro de decisões arquiteturais

Este registro separa as decisões inferidas do código das escolhas que permanecem abertas. As decisões observadas descrevem a implementação atual; não são ADRs formalmente aprovados. As pendências não devem ser lidas como funcionalidades já entregues.

## Decisões observadas no código

### Camadas não estritas

O código está organizado em `http`, `application`, `domain` e `infra`, com interfaces de repositório no domínio e implementações MySQL na infraestrutura. A direção não é estrita: as entidades do domínio importam `AppError` localizado na aplicação. A composição concreta também fica em `http/routes/products.routes.ts`, e não em um módulo externo às camadas.

### Composição manual nas rotas

Ao carregar `products.routes.ts`, o módulo cria uma instância de `MySqlStockMovementRepository`, injeta-a em `MySqlProductRepository`, instancia os seis casos de uso e seus controllers. Essas instâncias são reutilizadas pelas requisições do processo. Não há contêiner de injeção de dependência ou fábrica de composição dedicada.

### MySQL com pool global

`connection.ts` exporta um único `Pool` de `mysql2/promise`, criado no carregamento do módulo. Os repositórios executam `db.execute(...)` diretamente; não recebem conexão individual, nem há limite transacional explícito, fechamento coordenado do pool ou abstração de driver adicional.

### Saldo efetivamente derivado nas leituras

As leituras reconstituem `Product` com `stock_movements`, e `Product.quantity` soma entradas e saídas em memória. Embora `products.quantity` seja gravada na criação, ela não é usada na hidratação nem atualizada pelos comandos de movimentação. Portanto, o saldo efetivamente exposto pelas leituras é derivado dos movimentos.

## Decisões ainda pendentes

As decisões abaixo são questões abertas. O código atual não fixa uma resposta confiável para elas.

### Fonte canônica do saldo

Definir se o saldo canônico será derivado exclusivamente de `stock_movements` ou materializado em `products.quantity`, incluindo invariantes, atualização atômica e reconciliação quando aplicável.

### Contrato de preço entre TypeScript e JSON

Definir representação monetária, precisão, moeda e serialização de `price`. O banco usa `DECIMAL(10,2)` e os tipos TypeScript/a criação tratam o valor como `number`, mas o repositório não normaliza o valor retornado pelo driver: leituras atuais podem serializar `price` como string. O contrato JSON de leitura, portanto, ainda é inconsistente.

### Exposição e autenticação

Definir se a API será restrita à rede privada ou exposta a clientes externos e, conforme essa decisão, onde autenticação e autorização serão aplicadas. Não há autenticação ou autorização implementada nas rotas atuais.

### CORS

Definir se há consumidor browser, quais origens, métodos e headers são permitidos e em qual fronteira a política será aplicada. Não há middleware CORS registrado no backend atual.

### Paginação e compatibilidade de contratos

Definir paginação, filtros, ordenação estável e versão/compatibilidade para listagens e respostas. As consultas atuais não têm paginação, e as formas de produto e movimento variam entre endpoints.

### Banco persistido e migrações

Definir a estratégia para dados já persistidos, migrações versionadas, backup, rollback e reconciliação. O repositório contém apenas `db/init.sql`, que inicializa tabelas ausentes e não evolui volumes existentes.

### Topologia e rate limiting

Definir número de instâncias da API e onde rate limiting será aplicado. Não há rate limit no código; se houver múltiplas réplicas, um mecanismo somente em memória não fornece limite global.

## Referência de pendências

O detalhamento de bloqueios, decisões a tomar, roadmap e critérios de aceite está em [Finalização de `feat/api-hardening`](../feat-api-hardening-finalizacao.md). Esse documento é um plano de hardening; não registra ADRs aprovados nem altera o estado observado acima.

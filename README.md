<div width="100%" align="center" >
  <img src="https://hermes.dio.me/tracks/a2d3983e-01db-4cfb-9402-fdedae795af0.png"
      width="32%"
      style="margin-right: 13px;"
      height="300px"
      >
  <img src="https://assets.dio.me/FV3XVabllLqNMPpWnxtpGda6rrmOZUhH40sf8HwHkrc/f:webp/q:80/L2FydGljbGVzL2NvdmVyLzA1M2EwODFlLTY0N2UtNGM3OS1iOTJhLWU5ZTA4MWJlY2UyOS5wbmc"
      width="32%"
      height="300px"
      style="border-radius: 10px;"
      >
  <img src="https://hermes.dio.me/tracks/48e9f018-f7c9-4f0f-b524-cd9223579626.png"
      width="32%"
      height="300px"
      >
</div>

---

# **Sistema de ERP fullstack, praticando as expecializações feitas na [dio](https://www.dio.me/)**

API REST para controle de produtos e movimentações de estoque, escrita em **Node.js + Express + TypeScript**, usando **MySQL** como banco de dados e **Docker Compose** para orquestração de serviços. O frontend será em com o framework **[expo go](https://docs.expo.dev/)[(react-native)](https://reactnative.dev/docs/getting-started).**

## Visão geral do que existe hoje

- **Backend** em `backend/`
  - Node.js + Express
  - TypeScript
  - Camadas de **domínio**, **casos de uso (application/use-cases)**, **infraestrutura (MySQL)** e **HTTP (controllers, rotas, middlewares)**
- **Banco de dados MySQL** em `db/`
  - Script de criação de tabelas: `db/init.sql`
  - Tabelas: `products` e `stock_movements`
- **Docker Compose** na raiz (`docker-compose.yml`)
  - Serviço `db` (MySQL 8.0)
  - Serviço `api` (build do diretório `backend/`)
  - Volume para dados do banco e pasta `uploads` do backend

> Não há, neste repositório, app mobile React Native ou front-end web. O foco atual é a **API de estoque** e a infraestrutura de banco de dados.

---

## Sistema ERP – visão futura e integração Mobile

O **mobile** (React Native / Expo) será a **parte visual** do Sistema ERP em desenvolvimento: a API em `backend/` é o núcleo de dados e regras de negócio; o app consumirá essa API para cadastro de produtos, movimentação de estoque, histórico e, no futuro, autenticação, usuários e demais módulos do ERP.

### Como deve funcionar a integração (front ↔ back)

- **Backend como única fonte de verdade**  
  O mobile não persiste dados críticos localmente além de cache/offline opcional. Todas as operações de criação, alteração e consulta passam pela API REST.

- **Comunicação via REST + JSON**  
  Contratos estáveis em JSON: mesmos nomes de campos e formatos (datas em ISO 8601, enums como string, números sem formatação). Assim front e back podem evoluir com documentação e tipos compartilhados.

- **Interfaces compartilhadas (contratos)**
  - **DTOs de request/response**: definir formatos únicos para cada endpoint (ex.: `CreateProductRequest`, `ProductResponse`, `StockMovementResponse`).
  - **Enums alinhados**: as mesmas categorias e tipos de movimento no back (`ProductCategory`, `StockMovementType`) devem ser replicados no mobile (TypeScript/JavaScript ou código gerado).

- **Autenticação e autorização (futuro)**
  - Login retornará um **token** (JWT ou similar); o mobile envia esse token no header (ex.: `Authorization: Bearer <token>`) em todas as requisições autenticadas.
  - A API deve validar o token e, quando houver perfis (roles), verificar permissão por rota ou recurso.

- **Upload de imagens (futuro)**
  - Endpoint dedicado para upload (ex.: `POST /api/uploads` ou `POST /api/products/:id/photo`) retornando a URL do arquivo.
  - O mobile envia a foto (multipart); o backend grava em disco ou storage e devolve `imageUrl` para ser salvo no produto.

- **Tratamento de erros e offline**
  - Respostas de erro padronizadas (ex.: `{ "message": "..." }`) como já existe; no mobile, exibir mensagens amigáveis e, se desejado, retry ou fila de sincronização quando voltar online.

### Endpoints que já temos (API atual)

| Método | Endpoint                        | Descrição                                                                |
| ------ | ------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/products`                 | Lista todos os produtos (id, name, price, category, imageUrl, quantity). |
| GET    | `/api/products/:id`             | Detalhes do produto + lista de movimentações.                            |
| POST   | `/api/products`                 | Cria produto (name, price, category, imageUrl?, barCode?).               |
| POST   | `/api/products/:id/stock/entry` | Registra entrada de estoque (body: `{ "quantity": number }`).            |
| POST   | `/api/products/:id/stock/exit`  | Registra saída de estoque (body: `{ "quantity": number }`).              |
| GET    | `/api/products/:id/movements`   | Lista movimentações do produto.                                          |

Arquivos estáticos: `GET /uploads/*` para imagens já referenciadas por URL.

### Endpoints que devemos criar para o ERP funcionar

- **Autenticação**
  - `POST /api/auth/login` – email/senha (ou usuário/senha); retorna `{ "token": "...", "user": { "id", "email", "name", ... } }`.
  - `POST /api/auth/refresh` – renova o token usando refresh token (opcional).
  - `POST /api/auth/logout` – invalida o token no servidor (opcional, se houver blacklist/sessão).

- **Usuários (gestão básica)**
  - `GET /api/users/me` – dados do usuário logado (protegido pelo token).
  - `PATCH /api/users/me` – atualizar nome, email ou senha (conforme regras do ERP).
  - Se houver admin: `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`, etc.

- **Proteção das rotas atuais**
  - Middleware que exige `Authorization: Bearer <token>` em todas as rotas de produtos e movimentações (exceto login/refresh).
  - Retornar `401` quando o token estiver ausente ou inválido.

- **Upload de imagens**
  - `POST /api/uploads` ou `POST /api/products/:id/photo` – receber multipart, salvar em `uploads/`, retornar URL para preencher `imageUrl` do produto.

- **Extensões possíveis do ERP**
  - Relatórios/dashboard: `GET /api/dashboard/summary` (total de produtos, estoque total, alertas de estoque baixo).
  - Outros módulos (pedidos, fornecedores, etc.) conforme escopo futuro; todos seguindo o mesmo padrão REST e contratos compartilhados com o mobile.

Com isso, o mobile passa a ser a interface do ERP (login, produtos, estoque, histórico e, depois, demais telas), e o backend concentra regras, persistência e segurança, com uma lista clara do que já existe e do que falta implementar.

---

## Arquitetura da API

- **Camada HTTP (`src/http`)**
  - `routes/products.routes.ts`: define as rotas sob o prefixo `/api`
  - `controllers`: classes responsáveis por receber `Request`, chamar o caso de uso e devolver o `Response`
  - `middlewares/errorHandler.ts`: middleware global para tratar erros de domínio (`AppError`) e erros inesperados

- **Camada de Aplicação (`src/application/use-cases`)**
  - `CreateProductUseCase`: criação de produtos
  - `ListProductsUseCase`: listagem de produtos com quantidade em estoque calculada
  - `GetProductDetailsUseCase`: detalhes do produto + histórico de movimentações
  - `AddStockEntryUseCase`: registro de entrada de estoque
  - `AddStockExitUseCase`: registro de saída de estoque
  - `ListProductMovementsUseCase`: listagem de movimentações de um produto

- **Camada de Domínio (`src/domain`)**
  - `entities/Product`
    - Garante regras como: nome obrigatório, preço não negativo
    - Mantém uma lista de movimentações em memória e calcula a **quantidade atual** a partir delas
  - `entities/StockMovement`
    - Representa uma entrada ou saída de estoque (tipo, quantidade, data)
  - `enums/ProductCategory`
    - Categorias suportadas: `FOOD`, `ELECTRONICS`, `CLOTHING`, `CLEANING`, `OFFICE`, `OTHER`
  - `enums/StockMovementType`
    - Tipos de movimento: `ENTRY` (entrada) e `EXIT` (saída)
  - `repositories`
    - Contratos para persistência de `Product` e `StockMovement`

- **Camada de Infraestrutura (`src/infra/db/mysql`)**
  - `connection.ts`: criação do pool de conexões MySQL usando `mysql2/promise`
  - `repositories/MySqlProductRepository`: implementação de `ProductRepository` para MySQL
  - `repositories/MySqlStockMovementRepository`: implementação de `StockMovementRepository` para MySQL
  - `mappers/StockMovementMapper`: conversão entre linhas do banco e entidades de domínio

- **Bootstrap da aplicação**
  - `src/app.ts`: criação da instância do Express, middlewares, rotas e pasta estática `/uploads`
  - `src/server.ts`: sobe o servidor usando as variáveis de ambiente definidas em `src/config/env.ts`

---

## Banco de dados (MySQL)

O script `db/init.sql` cria as tabelas:

### Tabela `products`

- `id` (`VARCHAR(36)`, PK)
- `name` (`VARCHAR(255)`, obrigatório)
- `quantity` (`INT`, obrigatório – armazenado, mas o domínio calcula a quantidade com base nas movimentações)
- `price` (`DECIMAL(10, 2)`, obrigatório)
- `category` (`VARCHAR(50)`, obrigatório)
- `image_url` (`VARCHAR(500)`, opcional)
- `bar_code` (`VARCHAR(100)`, opcional)
- `created_at` (`TIMESTAMP`, default `CURRENT_TIMESTAMP`)
- `updated_at` (`TIMESTAMP`, default `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)

### Tabela `stock_movements`

- `id` (`VARCHAR(36)`, PK)
- `product_id` (`VARCHAR(36)`, FK para `products(id)`)
- `type` (`ENUM('in','out')`)
- `quantity` (`INT`, obrigatório)
- `created_at` (`TIMESTAMP`, default `CURRENT_TIMESTAMP`)
- Índice em `product_id` para melhorar consultas

No código de domínio, os tipos de movimento são representados por `StockMovementType` (`ENTRY` / `EXIT`), e o cálculo do estoque usa `getSignedQuantity()` para somar entradas e saídas.

---

## Como rodar com Docker

Pré-requisitos:

- Docker
- Docker Compose

Passos:

1. Garanta que o arquivo `.env` na raiz esteja configurado (os valores padrão já funcionam para desenvolvimento local).
2. Na raiz do projeto, execute:

```bash
docker-compose up -d --build
```

3. A API ficará disponível em:

- `http://localhost:*****/api` (usando os valores padrão do `.env`)

4. O MySQL ficará disponível em:

- Host: `localhost`
- Porta: `***` (variável `PORT_DB`)
- Usuário: `***`
- Senha: `*****`
- Banco: `*****`

Os dados do banco são persistidos em um volume Docker (`db_data`).  
A pasta `backend/uploads` é montada dentro do container e servida estaticamente pela API em `/uploads`.

---

## Endpoints da API

Todas as rotas abaixo estão sob o prefixo **`/api`**.

### Listar produtos

- **GET** `/api/products`
- **Resposta 200** – array de produtos:
  - `id`, `name`, `price`, `category`, `imageUrl`, `quantity`

### Criar produto

- **POST** `/api/products`
- **Body (JSON)**:

```json
{
  "name": "Camiseta",
  "price": 59.9,
  "category": "CLOTHING",
  "imageUrl": "http://localhost:2000/uploads/camiseta.png",
  "barCode": "1234567890"
}
```

- **Regras**:
  - `name`: obrigatório, string não vazia
  - `price`: número, não negativo
  - `category`: string válida do enum `ProductCategory` (`FOOD`, `ELECTRONICS`, `CLOTHING`, `CLEANING`, `OFFICE`, `OTHER`)
- **Resposta 201** – produto criado:
  - `id`, `name`, `price`, `category`, `imageUrl?`, `barCode?`

### Detalhes de um produto

- **GET** `/api/products/:id`
- **Resposta 200** – objeto com:
  - `id`, `name`, `price`, `category`, `imageUrl`, `barCode`, `quantity`
  - `movements`: lista de movimentações (`id`, `type`, `quantity`, `createdAt`)

### Registrar entrada de estoque

- **POST** `/api/products/:id/stock/entry`
- **Body (JSON)**:

```json
{
  "quantity": 10
}
```

- **Regras**:
  - `quantity` deve ser número > 0
  - Produto precisa existir
- **Resposta 201** – `{ "ok": true }`

### Registrar saída de estoque

- **POST** `/api/products/:id/stock/exit`
- **Body (JSON)**:

```json
{
  "quantity": 5
}
```

- **Regras**:
  - `quantity` deve ser número > 0
  - Produto precisa existir
  - Não permite deixar o estoque negativo (validação em `Product.addMovement`)
- **Resposta 201** – `{ "ok": true }`

### Listar movimentações de um produto

- **GET** `/api/products/:id/movements`
- **Resposta 200** – array de movimentações com:
  - `id`, `productId`, `type`, `quantity`, `createdAt`

---

## Regras de negócio principais

- **Produto**
  - Nome obrigatório e não vazio
  - Preço não pode ser negativo
  - Categoria precisa estar entre os valores do enum `ProductCategory`
- **Movimentações de estoque**
  - Quantidade sempre > 0
  - Saída (`EXIT`) não pode deixar o estoque negativo
- **Tratamento de erros**
  - Erros de domínio usam `AppError` e retornam JSON no formato:

```json
{
  "message": "Descrição do erro"
}
```

Com o status HTTP apropriado (400, 404, 500, etc.).

---

## Estrutura de pastas (resumo)

```text
.
├── backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── src
│       ├── app.ts
│       ├── server.ts
│       ├── config
│       │   └── env.ts
│       ├── domain
│       │   ├── entities
│       │   ├── enums
│       │   └── repositories
│       ├── application
│       │   └── use-cases
│       └── infra
│           └── db
│               └── mysql
│                   ├── connection.ts
│                   ├── repositories
│                   └── mappers
├── db
│   └── init.sql
├── docker-compose.yml
└── .env
```

Este README descreve o que **está implementado hoje** na API de estoque e na infraestrutura Docker/MySQL e, na seção **Sistema ERP – visão futura e integração Mobile**, como deve funcionar a integração com o app mobile e quais endpoints ainda precisam ser criados (autenticação, usuários, upload, etc.) para o ERP funcionar de ponta a ponta.

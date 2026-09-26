# `backend/src/http/`

Camada de transporte HTTP do serviço de estoque. Ela recebe requisições Express,
monta os casos de uso com repositórios MySQL, converte entradas HTTP nos argumentos
dos casos de uso e serializa as respostas.

## Registro no aplicativo

`src/app.ts` instala os componentes nesta ordem:

1. `express.json()` desserializa corpos JSON.
2. `GET /uploads/*` é atendido por `express.static`, a partir de
   `backend/uploads`.
3. `productsRoutes` é montado sob `/api`.
4. `errorHandler` é instalado após as rotas.

Assim, as rotas declaradas como `/products` no roteador são expostas como
`/api/products`. O módulo não define rotas fora do recurso de produtos e de suas
movimentações.

## Endpoints expostos

| Método e URL | Controller → caso de uso | Sucesso |
| --- | --- | --- |
| `GET /api/products` | `ListProductsController` → `ListProductsUseCase` | `200` com a lista de produtos e quantidade calculada pelos movimentos. |
| `GET /api/products/:id` | `GetProductDetailsController` → `GetProductDetailsUseCase` | `200` com o produto, quantidade e seus movimentos. |
| `POST /api/products` | `CreateProductController` → `CreateProductUseCase` | `201` com o produto criado. |
| `POST /api/products/:id/stock/entry` | `AddStockEntryController` → `AddStockEntryUseCase` | `201` com `{ "ok": true }`. |
| `POST /api/products/:id/stock/exit` | `AddStockExitController` → `AddStockExitUseCase` | `201` com `{ "ok": true }`. |
| `GET /api/products/:id/movements` | `ListProductMovementsController` → `ListProductMovementsUseCase` | `200` com os movimentos do produto. |

Veja os contratos detalhados em [`routes/codemap.md`](routes/codemap.md) e o
comportamento de cada adaptador em [`controllers/codemap.md`](controllers/codemap.md).

## Fluxo de execução

Para cada rota de API, o roteador instancia os repositórios uma vez ao carregar o
módulo e encadeia `controller.handle(req, res).catch(next)`. O controller extrai
parâmetros/corpo e invoca o caso de uso injetado. Os casos de uso operam sobre as
interfaces `ProductRepository` e `StockMovementRepository`; as instâncias usadas
em produção são `MySqlProductRepository` e `MySqlStockMovementRepository`.

`MySqlProductRepository` recebe o repositório de movimentos porque, ao consultar
um produto, reconstrói o agregado carregando seus movimentos. Portanto, tanto a
quantidade retornada por consultas quanto a verificação de saldo para uma saída
dependem das linhas de `stock_movements` já persistidas.

## Contrato de erro atual

Erros encaminhados por `next` chegam a `errorHandler`:

```json
{ "message": "<mensagem do erro>" }
```

- `AppError` preserva o `statusCode` definido na origem (principalmente `400` e
  `404`) e expõe sua mensagem nesse formato.
- Qualquer outro erro é registrado no console como `Erro inesperado:` e retorna
  `500` com `{ "message": "Erro de servidor" }`.
- `GET /api/products/:id` trata o `id` vazio diretamente no controller e também
  responde `400` no mesmo formato, sem passar pelo middleware.
- Erros de parsing JSON e falhas não convertidas dos repositórios de movimentos
  são tratados como erros não reconhecidos e, portanto, recebem o retorno `500`.

Não há envelope adicional, código de erro, campo de detalhes ou rastreio exposto
na resposta.

## Dependências

- **Express**: `Router`, `Request`, `Response`, `express.json`, arquivos estáticos
  e encadeamento de erros.
- **Aplicação**: os seis casos de uso e `AppError`.
- **Domínio**: `ProductCategory`, entidades e contratos de repositório usados
  indiretamente pelos casos de uso.
- **Infraestrutura**: implementações MySQL criadas em `products.routes.ts`; elas
  usam o pool `mysql2/promise` configurado em `infra/db/mysql/connection.ts`.
- **Node.js**: o `path` usado para publicar `/uploads`.

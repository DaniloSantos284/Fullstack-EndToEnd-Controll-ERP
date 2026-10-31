# API HTTP

Base: `/api`. As respostas da aplicação são JSON; recusas geradas pelo gateway podem ter corpo diferente. Não há `/uploads`. A aplicação e o gateway respondem com `Cache-Control: no-store`. Na implantação pública, o frontend envia `Authorization: Bearer <JWT>` ao Nginx; seu `auth_request` consulta um verificador interno antes de encaminhar a chamada à API. Se o frontend web estiver em outra origem, configure `FRONTEND_ORIGIN` no gateway para permitir o preflight CORS sem JWT.

## Convenções

- IDs de rota: UUID. Datas de movimentos: ISO 8601 em UTC.
- `page`: inteiro decimal de 1 a 1.000.000; `limit`: inteiro decimal de 1 a 100. Padrões: `page=1`, `limit=20`. Para evitar OFFSET profundo, `(page - 1) * limit` não pode exceder 10.000; combinações acima do teto recebem `400`. Parâmetros extras recebem `400`.
- Listas retornam `{ "data": [...], "pagination": { "page": 1, "limit": 20, "hasNext": false } }`. A ordem é estável: produtos por `id ASC`; movimentos por `createdAt DESC, id DESC`. `hasNext` vem de uma linha extra buscada pelo repositório.
- `price` é número JSON não negativo, com no máximo duas casas decimais e teto de `99999999.99`. O domínio conserva centavos inteiros; MySQL usa `DECIMAL(10,2)`. A moeda ainda não foi definida como campo do contrato.
- Quantidade de movimento é inteiro de 1 a 2.147.483.647. Saldo não pode ficar negativo nem exceder o limite de `INT`.
- O servidor gera `X-Request-Id` para cada requisição; não aceita um ID enviado pelo cliente como identidade confiável.

## Produtos

`GET /api/products?page=1&limit=20` retorna `200` com `data` contendo `id`, `name`, `price`, `category`, `imageUrl` quando presente e `quantity`. `barCode` não faz parte da lista.

`POST /api/products` recebe `Content-Type: application/json` e exatamente os campos abaixo; retorna `201` com `id`, `name`, `price`, `category` e os opcionais enviados. O saldo inicial é zero.

```json
{"name":"Caderno","price":12.50,"category":"OFFICE","imageUrl":"https://example.test/item.png","barCode":"123"}
```

`name` tem 1 a 255 caracteres após remoção de espaços nas bordas; `imageUrl` aceita string vazia para compatibilidade ou URL `http:`/`https:` de até 500 caracteres. Esquemas como `javascript:` e `data:` são rejeitados. `barCode` tem até 100 caracteres. Valores extras ou tipos incorretos são rejeitados. Categorias: `FOOD`, `ELECTRONICS`, `CLOTHING`, `CLEANING`, `OFFICE`, `OTHER`.

`GET /api/products/:id?page=1&limit=20` retorna `200` com os campos do produto, `barCode` quando presente, `quantity`, `movements` e `movementsPagination`. `page` e `limit` paginam apenas `movements`, não o produto. Produto inexistente retorna `404`.

## Estoque

`POST /api/products/:id/stock/entry` e `POST /api/products/:id/stock/exit` recebem `Content-Type: application/json` e `{ "quantity": 2 }`, retornam `201` com `{ "ok": true }` e rejeitam campos extras. Produto inexistente retorna `404`; saldo insuficiente ou overflow retorna `409`. Cada comando persiste saldo e movimento na mesma transação.

`GET /api/products/:id/movements?page=1&limit=20` retorna uma lista paginada. Cada movimento contém `id`, `productId`, `type` (`ENTRY` ou `EXIT`), `quantity` e `createdAt`.

## Erros e proteção

Formato de erro: `{ "code": "VALIDATION_ERROR", "message": "Dados da requisição inválidos.", "requestId": "..." }`. O header `X-Request-Id` tem o mesmo valor. Respostas não incluem stack, SQL, headers sensíveis nem segredos.

| Status | Situação |
| --- | --- |
| 400 | Validação, UUID, query ou JSON inválidos. |
| 404 | Rota ou produto ausente. |
| 409 | Estoque insuficiente ou limite de saldo. |
| 413 | JSON maior que `JSON_BODY_LIMIT_KB` (64 KiB por padrão). |
| 415 | `Content-Type` ausente/não JSON, charset ou codificação do corpo JSON não suportados. |
| 429 | Limite local da aplicação excedido; inclui `Retry-After`. O limite de borda do Nginx também pode responder `429`, sem prometer esse header. |
| 503 | Banco, JWKS/provedor de autenticação reconhecidamente indisponível ou readiness negativa. |
| 500 | Falha inesperada, com mensagem genérica. |

Helmet define headers de proteção. O limitador em memória cobre `/api` por endereço IP e só é global para uma instância; o gateway precisa impor limite compartilhado no ambiente público. Por padrão, apenas o endereço do socket é confiável (`TRUST_PROXY_HOPS=0`).

## Saúde

- `GET /health/live`: `200 { "status": "ok" }`, independente do banco.
- `GET /health/ready`: `200 { "status": "ok" }` após `SELECT 1`; `503` no contrato de erro durante indisponibilidade ou shutdown.

O gateway deve manter readiness fora de rotas públicas ou protegê-la. A resposta não revela host, credenciais nem erro SQL.

## Autenticação do gateway

O Nginx é configurado para publicar somente `/api/`. Seu subrequest interno chama `GET /internal/auth/verify` com `Authorization` e `X-Original-Method`; o endpoint responde `204` quando o JWT é válido e tem `inventory:read` para GET/HEAD ou `inventory:write` para POST. Token ausente, malformado, expirado, com assinatura, emissor, audiência ou chave inválidos resulta em `401`; escopo insuficiente em `403`; indisponibilidade, timeout ou JWKS inválido do provedor retorna `503` genérico quando uma busca ou atualização de JWKS é necessária. Uma chave conhecida em cache pode continuar validando tokens durante uma indisponibilidade. O verificador aceita assinaturas `RS256`/`ES256` via JWKS HTTPS em produção, exige `iss`, `aud`, `sub` e `exp`, e aceita escopos em `scope` ou `permissions`.

Esse endpoint não deve ser publicado pelo gateway. O provedor OIDC que emitirá os JWTs ainda não foi escolhido; a implantação pública exige `JWT_ISSUER`, `JWT_AUDIENCE` e `JWT_JWKS_URL` válidos.

O gateway aplica o mesmo `JSON_BODY_LIMIT_KB` da aplicação (64 KiB por padrão), envia HSTS em HTTPS e remove o bearer antes de encaminhar a rota de negócio. O E2E em Compose confirma essa remoção no processo da API. Ele responde a `OPTIONS /api/` com `204` e permite apenas os métodos `GET`, `HEAD` e `POST`, com headers `Authorization` e `Content-Type`, para a origem configurada. O preflight não alcança o verificador JWT; chamadas de negócio continuam exigindo token. Sem `FRONTEND_ORIGIN`, não há acesso CORS a partir de outra origem.

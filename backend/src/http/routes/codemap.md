# Rotas

`products.routes.ts` é o ponto de composição de repositórios MySQL, casos de uso e controllers. Cada handler assíncrono entrega rejeições ao middleware global.

| Método | Caminho | Resposta |
| --- | --- | --- |
| GET | `/api/products` | `{data,pagination}` |
| POST | `/api/products` | Produto criado, `201` |
| GET | `/api/products/:id` | Produto e `movementsPagination` |
| POST | `/api/products/:id/stock/entry` | `{ok:true}`, `201` |
| POST | `/api/products/:id/stock/exit` | `{ok:true}`, `201` |
| GET | `/api/products/:id/movements` | `{data,pagination}` |

GETs com histórico aceitam `page` e `limit`; o schema limita `page` a 1.000.000 e `limit` a 100, com padrões 1/20. IDs devem ser UUID. A rota interna `/internal/auth/verify` e healthchecks são montados em `app.ts`. Consulte `docs/api/http-api.md` na raiz para os campos e códigos.

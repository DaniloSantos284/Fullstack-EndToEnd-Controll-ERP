# Arquitetura do backend

O backend separa regras de estoque dos detalhes de HTTP e MySQL. O fluxo de estoque é `HTTP → caso de uso → porta de repositório → adaptador MySQL`. As entidades do domínio dependem apenas de enums e `DomainError`; os casos de uso recebem interfaces; os controllers fazem parse com Zod e chamam os casos. Os repositórios são compostos em `src/http/routes/products.routes.ts`; o verificador JWT, em `src/app.ts`.

| Camada | Diretório | Responsabilidade |
| --- | --- | --- |
| Domínio | `backend/src/domain` | `Product`, `StockMovement`, enums, invariantes, portas. |
| Aplicação | `backend/src/application` | Comandos e consultas, paginação, tradução de resultados esperados. |
| HTTP | `backend/src/http` | Schemas, controllers, roteamento, headers, logs, erros e limites. |
| Infraestrutura | `backend/src/infra` | Pool, SQL, transações, mapeamento de linhas e verificação JWT/JWKS. |

`products.quantity` é o saldo materializado. A escrita usa uma `PoolConnection`, inicia transação, bloqueia a linha do produto com `FOR UPDATE`, valida saldo e limite de `INT`, atualiza quantidade, grava movimento e faz commit. Um erro entre atualização e insert causa rollback. Os índices de `stock_movements` suportam a ordem do histórico.

Listagens usam `LIMIT limit+1 OFFSET (page-1)*limit`. `hasNext` é calculado sem uma consulta `COUNT(*)`; a lista de produtos faz apenas uma consulta para a página, sem carregar movimentos por produto. Detalhes e histórico consultam o produto e, separadamente, sua página de movimentos.

Preço é recebido como número JSON com até duas casas decimais, guardado em centavos inteiros no domínio, enviado como string decimal ao MySQL e armazenado em `DECIMAL(10,2)`. O pool mantém DECIMAL como string na leitura; o mapper reconstitui a entidade. Linhas persistidas inválidas são tratadas como falhas internas, não como erro de entrada do cliente.

O Express aplica `Cache-Control: no-store`, request ID, Helmet, rate limit por IP, exigência de JSON em POSTs `/api`, limite de corpo, rotas e middleware de erro. Os logs são JSON e omitem body, query, headers, SQL e mensagens de erro inesperado. `/health/live` e `/health/ready` são separados. `server.ts` marca readiness negativa no shutdown, fecha HTTP e encerra o pool.

No acesso público, o Nginx usa `auth_request` para chamar o verificador interno. A porta `AccessTokenVerifier` fica na aplicação e sua implementação `JwksAccessTokenVerifier` fica na infraestrutura; a decisão de escopo pelo método original fica no controller HTTP. O gateway só encaminha a rota de negócio após resposta `204` do verificador.

Testes Jest/Supertest usam um pool simulado; o teste de integração em `tests/integration/mysql-stock.ts` usa MySQL descartável para verificar concorrência, rollback e SQL de paginação. A CI também aplica a migração em um fixture legado e verifica o saldo reconciliado antes da integração.

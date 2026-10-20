# Backend: mapa do código

`src/app.ts` monta Express, request ID, Helmet, limite JSON, saúde, verificação JWT interna, rate limit e rotas. `src/server.ts` inicia HTTP e encerra servidor/pool em SIGINT/SIGTERM. `src/config/env.ts` valida o ambiente sem registrar segredos.

- `src/domain/`: entidades, enums, erro de domínio e portas de repositório.
- `src/application/`: casos de uso, paginação e porta de verificação de token.
- `src/http/`: schemas Zod, controllers, roteador, contrato de erro, logs e limites.
- `src/infra/db/mysql/`: pool, consultas paginadas, transação de movimentos e mappers.
- `src/infra/security/`: verificação JWT com JWKS remoto.
- `tests/unit/` e `tests/http/`: Jest e Supertest com banco simulado; `tests/integration/`: MySQL real descartável.

`products.quantity` é o saldo materializado. Uma movimentação usa `SELECT ... FOR UPDATE`, `UPDATE products` e `INSERT stock_movements` na mesma transação. Preço é centavos inteiros no domínio, DECIMAL no banco e número no JSON. Consulte os `codemap.md` locais e a documentação da raiz para os contratos completos.

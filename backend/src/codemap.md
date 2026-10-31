# Código-fonte

`app.ts` compõe o Express e `server.ts` controla sua vida útil. `config/env.ts` valida variáveis e é carregado antes da criação do pool MySQL. Importar `app.ts` não inicia um servidor; Supertest pode usá-lo diretamente com o pool simulado.

O fluxo principal é `http → application → domain/repository ports → infra`. A aplicação do movimento bloqueia a linha do produto numa transação MySQL. As listas usam SQL paginado e uma linha extra para `hasNext`. O domínio não importa a camada de aplicação; seus erros são `DomainError`.

O HTTP centraliza validação Zod, headers, logs, erros e proteção. A autenticação de rotas públicas é aplicada pelo Nginx; `GET /internal/auth/verify` verifica o JWT em subrequests privados, com emissor/JWKS configurados por ambiente. Saúde e shutdown ficam em `app.ts`/`server.ts`.

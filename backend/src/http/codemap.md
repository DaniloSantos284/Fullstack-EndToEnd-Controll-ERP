# Adaptador HTTP

`routes/products.routes.ts` liga seis rotas de produtos aos controllers e casos de uso. `controllers/` faz parse de params, query e body via `schemas/products.schemas.ts`, sem validar SQL. `middlewares/` gera request ID, logs estruturados, rate limit e resposta central de erros. `errors/HttpError.ts` representa falhas de transporte.

`app.ts` aplica Helmet, JSON de até 64 KiB por padrão, `/health/live`, `/health/ready`, `/internal/auth/verify` e `/api`. `/uploads` não é servido. O endpoint interno valida JWT para o `auth_request` do Nginx; Nginx publica apenas `/api/` no overlay público. Sem provedor JWT configurado, a verificação interna responde `503`.

Erros usam `{code,message,requestId}`; o header `X-Request-Id` coincide. JSON inválido `400`, payload grande `413`, rota ausente `404`, rate limit `429`, banco indisponível reconhecido `503` e erro inesperado `500`. Logs omitem bodies, queries, headers e mensagens SQL.

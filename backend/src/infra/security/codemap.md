# Verificação JWT por JWKS

`JwksAccessTokenVerifier` implementa `application/security/AccessTokenVerifier` com `jose`. Usa URL JWKS fixa por ambiente, aceita RS256/ES256 e exige `iss`, `aud`, `sub` e `exp`. Extrai escopos de `scope` ou `permissions`; o controller HTTP exige o escopo correspondente ao método original. A URL deve ser HTTPS em produção e a configuração pública é obrigatória no overlay do gateway.

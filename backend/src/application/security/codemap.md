# Porta de verificação de token

`AccessTokenVerifier` define `verify(token)` e devolve sujeito e conjunto de escopos após validação criptográfica. A aplicação não conhece JWKS, Express ou Nginx. A implementação fica em `infra/security/`; o controller HTTP decide se a operação exige o escopo de leitura ou de escrita.

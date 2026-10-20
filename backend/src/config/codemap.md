# Configuração de ambiente

`env.ts` carrega `.env` do diretório de trabalho e valida `process.env` com Zod. Expõe propriedades camelCase para porta HTTP, MySQL, tamanho JSON, rate limit, proxies confiáveis, prazo de shutdown e JWT. Erros de configuração registram apenas nomes de campos inválidos, sem valores.

No Compose, `PORT=4000`, `DB_HOST=db` e `PORT_DB=3306`. `DB_PUBLISHED_PORT` só vale para o overlay opcional do host. `JWT_ISSUER`, `JWT_AUDIENCE` e `JWT_JWKS_URL` devem ser fornecidos juntos; em produção, JWKS exige HTTPS. Sem os três, a rota interna de verificação de token falha fechada com `503`. O overlay público exige todos os valores e certificados TLS.

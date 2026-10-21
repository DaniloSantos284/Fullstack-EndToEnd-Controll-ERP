# Operação

## Ambientes e comandos

Use Node 22 LTS e pnpm 12.14.0. Em `backend/`, `corepack pnpm install --frozen-lockfile`, `corepack pnpm dev`, `corepack pnpm build`, `corepack pnpm start`, `corepack pnpm test:ci` e `corepack pnpm test:typecheck` cobrem o fluxo local. `corepack pnpm test:integration` precisa de um MySQL descartável com o schema inicializado e variáveis `DB_*`. Jest/Supertest substituem o pool por mocks; o teste de integração real verifica concorrência e rollback.

Na raiz, copie `.env.example` para `.env`, defina `DB_ROOT_PASSWORD` e `DB_PASSWORD` com valores privados e inicie o desenvolvimento:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build --wait
```

A API fica em `127.0.0.1:${PORT_APP:-4000}`. O banco não publica porta. Se precisar acessar MySQL no host, acrescente `-f docker-compose.db-port.yml`; a porta fica em `127.0.0.1:${DB_PUBLISHED_PORT:-3307}`. `docker compose down` preserva o volume; `down --volumes` apaga o banco e deve ser usado apenas em ambiente descartável.

Para executar `pnpm --dir backend dev` fora do container, use um MySQL acessível no host (por exemplo, o overlay `docker-compose.db-port.yml`) e configure `backend/.env` com `DB_HOST=127.0.0.1`, `PORT_DB=3307`, `DB_USER`, `DB_PASSWORD` e `DB_DATABASE`. Esse arquivo é ignorado pelo Git. Não use a porta 4000 simultaneamente para o processo local e o container `api`.

## Variáveis da API

| Nome | Uso / padrão |
| --- | --- |
| `NODE_ENV` | `development`, `test` ou `production`. |
| `PORT` | Porta HTTP interna; 3333 fora do Compose, 4000 no container. |
| `DB_HOST`, `PORT_DB`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` | Conexão MySQL; no Compose, host `db` e porta interna `3306`. |
| `DB_CONNECTION_LIMIT` | Máximo de conexões do pool; padrão 10. |
| `JSON_BODY_LIMIT_KB` | Limite do corpo JSON; padrão 64 KiB. |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` | Limite por IP na instância; padrão 60 s / 100. |
| `TRUST_PROXY_HOPS` | Quantos proxies Express confia; padrão 0, gateway Compose usa 1. |
| `SHUTDOWN_TIMEOUT_MS` | Prazo para fechar HTTP e pool; padrão 10 s. |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_JWKS_URL` | Exigidos juntos para validar JWT no endpoint interno; URL JWKS deve ser HTTPS em produção. |
| `JWT_READ_SCOPE`, `JWT_WRITE_SCOPE` | Escopos esperados; padrões `inventory:read` e `inventory:write`. |

O Compose exige `DB_ROOT_PASSWORD` e `DB_PASSWORD` não vazios; a senha root não é fornecida à API. `DB_PUBLISHED_PORT` só vale no overlay opcional e não altera `PORT_DB=3306` dentro da rede Docker. `dotenv/config` lê `.env` do diretório de trabalho quando o backend roda fora do Compose.

## Manutenção de versões MySQL

`docker-compose.mysql-8.0-maintenance.yml` e `docker-compose.mysql-8.4-upgrade.yml` apenas substituem a imagem do serviço `db`; eles não fazem backup, upgrade nem downgrade automaticamente. Não são parte do fluxo normal de desenvolvimento ou publicação.

Use o overlay 8.0 somente para manutenção de uma cópia de volume compatível com 8.0. Para qualquer mudança entre versões, faça backup verificado, teste em uma cópia descartável, siga a matriz oficial de compatibilidade do MySQL e valide migração, healthchecks e integração antes de tocar no volume original. Nunca tente abrir um volume já atualizado por uma versão mais nova com uma imagem mais antiga.

## Gateway público com Nginx

O Compose base não publica a API. `docker-compose.gateway.yml` adiciona Nginx em HTTPS e exige `PUBLIC_HOSTNAME`, `TLS_CERT_PATH`, `TLS_KEY_PATH`, `JWT_ISSUER`, `JWT_AUDIENCE` e `JWT_JWKS_URL` não vazios. O provedor OIDC e seus valores ainda não foram definidos; escolha um provedor que forneça JWKS HTTPS e JWTs de acesso com `iss`, `aud`, `sub`, `exp` e os escopos de estoque antes de ligar o overlay público. Para um frontend web em outra origem, configure também `FRONTEND_ORIGIN` como origem HTTPS exata, sem barra final; o gateway libera apenas o preflight `OPTIONS` sem JWT.

```bash
docker compose -f docker-compose.yml -f docker-compose.gateway.yml up --build --wait
```

O frontend envia o JWT no header `Authorization: Bearer ...` ao Nginx. Para cada chamada `/api/`, `auth_request` chama `/internal/auth/verify` na rede privada. O verificador aceita `RS256` ou `ES256`, confere assinatura, emissor, audiência e expiração, e exige `inventory:read` em GET/HEAD ou `inventory:write` em POST. Nginx não encaminha o bearer token à rota de negócio. O gateway aplica um limite adicional por IP; para várias réplicas ou quotas por usuário, configure um mecanismo compartilhado na borda.

Aplicação e gateway usam `Cache-Control: no-store`. Chamadas POST da API exigem `Content-Type: application/json`; media type ausente ou não JSON retorna `415` e ainda consome a quota do limitador.

Monte certificados TLS legíveis para o container do Nginx. Não acrescente `docker-compose.local.yml` ao comando público: esse overlay expõe a API em loopback e permite contornar `auth_request` a partir do host. Garanta que firewalls e orquestração não publiquem a porta interna 4000 ou `/internal/auth/verify`. O gateway publica somente `/api/`; liveness/readiness ficam na rede privada. A autenticação de usuários e a emissão de JWT são externas a este repositório.

## Saúde, logs e desligamento

`GET /health/live` responde quando o processo HTTP está ativo. `GET /health/ready` consulta MySQL e retorna `503` sem detalhes internos se o banco estiver indisponível ou se o processo estiver encerrando. O Compose usa readiness para o healthcheck da API. Ao receber SIGINT/SIGTERM, `server.ts` para de aceitar conexões e fecha o pool, com prazo configurável.

Logs são linhas JSON com evento, status, duração e ID de requisição. Não incluem body, query, Authorization, SQL ou mensagens de erros inesperados. Erros HTTP respondem `{code,message,requestId}`. O ID também sai em `X-Request-Id`.

## CI

O workflow `.github/workflows/backend-ci.yml` roda em push e pull request com permissão somente de leitura. Ele instala pelo lockfile, executa auditoria crítica das dependências de produção, build, typecheck e Jest; valida o template Nginx e os overlays Compose; recria um schema legado, aplica `001_harden_inventory`, confere o saldo reconciliado e roda a integração MySQL. A execução do workflow é a evidência do caminho Docker, pois ele não substitui a validação local sem Engine disponível.

## Context7 no Codex

O arquivo `.codex/config.toml` da raiz registra o MCP remoto do Context7. Ele não armazena chave: se `CONTEXT7_API_KEY` já estiver no ambiente do processo Codex, o cliente a encaminha como header; caso contrário, o endpoint remoto continua disponível sem credencial. Abra uma nova sessão do Codex para carregar a configuração de projeto. `codex mcp list` deve mostrar `context7`. Não copie a chave para `.env`, arquivos versionados ou comandos de diagnóstico.

# API de controle de estoque

API REST de produtos e movimentações de estoque, escrita em Node.js, Express, TypeScript e MySQL. O foco atual do repositório é o backend: não há frontend web ou aplicativo mobile versionado aqui.

## Estado atual

- Contrato HTTP com validação estrita, paginação e erros `{ code, message, requestId }`.
- Saldo materializado e movimentos protegidos por transação MySQL com `SELECT ... FOR UPDATE`.
- Liveness, readiness, desligamento gracioso, Helmet, limites de corpo/requisições, `Cache-Control: no-store` e logs redigidos.
- Gateway Nginx opcional com TLS, CORS explícito, limite na borda e JWT/OIDC via JWKS.
- Testes Jest/Supertest e integração MySQL; a CI valida migração de um schema legado, build, tipos, testes, Nginx e Compose.

## Início rápido com Docker

Pré-requisitos: Docker Engine com o plugin Compose.

```bash
cp .env.example .env
# Edite .env e defina DB_ROOT_PASSWORD e DB_PASSWORD com valores privados.
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build --wait
```

O overlay `docker-compose.local.yml` expõe a API apenas em `127.0.0.1:${PORT_APP:-4000}`. O Compose base não publica portas. Para publicar MySQL localmente em `127.0.0.1:${DB_PUBLISHED_PORT:-3307}`, acrescente `-f docker-compose.db-port.yml`.

Consulte o [guia do backend](backend/README.md) para configuração sem Docker, migrações, testes e produção.

## Documentação

- [Contrato HTTP](docs/api/http-api.md)
- [Arquitetura](docs/architecture/overview.md) e [ciclo de requisição](docs/architecture/request-lifecycle.md)
- [Persistência e migração MySQL](docs/data/mysql.md)
- [Operação e gateway](docs/operations/runtime.md)
- [Estado de `feat/api-hardening`](docs/feat-api-hardening-finalizacao.md)
- [Roadmap do ERP](docs/roadmap.md)

O gateway exige um emissor OIDC externo, JWKS HTTPS e certificados TLS reais. Não publique diretamente a porta interna da API em uma implantação pública.

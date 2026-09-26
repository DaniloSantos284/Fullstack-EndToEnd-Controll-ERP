# Atlas Mestre — erp_full_stack

## Propósito atual

`erp_full_stack` contém, no estado atual, uma API REST de estoque. O backend em Node.js, Express e TypeScript expõe produtos e suas movimentações; a persistência prevista é MySQL. O repositório também versiona o DDL de inicialização e a orquestração Docker Compose. Não há frontend ou cliente mobile versionado.

Este mapa é o ponto de orientação do repositório. Para detalhes de uma área, siga o codemap do diretório correspondente; para comportamento, operação e limites observáveis, use os documentos em [`docs/`](docs/README.md).

## Entry points e recursos de execução

| Recurso | Papel atual |
| --- | --- |
| [`backend/src/server.ts`](backend/src/server.ts) | Entrada do processo Node: obtém a aplicação e a configuração, então tenta iniciar a escuta HTTP. |
| [`backend/src/app.ts`](backend/src/app.ts) | Cria o Express, registra JSON, arquivos estáticos em `/uploads`, o router `/api` e o middleware de erro. |
| [`backend/src/http/routes/products.routes.ts`](backend/src/http/routes/products.routes.ts) | Composition root manual: instancia repositórios MySQL, casos de uso e controllers; registra os endpoints de produtos e movimentos. |
| [`docker-compose.yml`](docker-compose.yml) | Declara os serviços `db` (MySQL 8) e `api`, volumes, portas, rede e dependência do healthcheck do banco. |
| [`backend/Dockerfile`](backend/Dockerfile) | Instala dependências, compila TypeScript e inicia `dist/server.js` na imagem da API. |
| [`db/init.sql`](db/init.sql) | Inicializa as tabelas `products` e `stock_movements` quando o volume MySQL é criado. |

## Fluxo resumido

```text
server.ts
  -> app.ts
      -> products.routes.ts (composição manual)
          -> controllers -> casos de uso -> contratos do domínio
                                  -> repositórios MySQL -> pool mysql2 -> MySQL
  -> Express responde JSON ou errorHandler
```

Nas leituras, o repositório de produtos reconstitui o agregado com os movimentos e o saldo exposto é calculado desse histórico. Nas entradas e saídas, a aplicação cria e persiste um novo movimento. O ciclo completo está em [Ciclo de request até a persistência](docs/architecture/request-lifecycle.md).

## Mapa de responsabilidades

| Área | Responsabilidade atual | Mapa local |
| --- | --- | --- |
| Pacote do backend | Scripts, dependências, Dockerfile e serviço REST de estoque. | [backend/](backend/codemap.md) |
| Código-fonte | Bootstrap, camadas e integração do processo HTTP. | [backend/src/](backend/src/codemap.md) |
| Configuração | Carrega e valida as variáveis usadas no bootstrap e no pool. | [config/](backend/src/config/codemap.md) |
| Domínio | Entidades de produto/movimento, enums e portas de persistência. | [domain/](backend/src/domain/codemap.md) |
| Aplicação | Casos de uso que orquestram criação, consulta e movimentação. | [application/](backend/src/application/codemap.md) |
| HTTP | Rotas Express, controllers, composição manual e middleware de erro. | [http/](backend/src/http/codemap.md) |
| Infraestrutura | Pool MySQL, SQL, repositórios e mapeamento de movimentos. | [infra/](backend/src/infra/codemap.md) |
| Banco e Compose | Schema de inicialização e infraestrutura de execução local em contêiner. | [db/init.sql](db/init.sql) · [docker-compose.yml](docker-compose.yml) |
| Documentação técnica | Guias de arquitetura, domínio, API, dados e runtime. | [docs/](docs/README.md) |

## Navegação por fluxo

- **Inicialização e ambiente:** [`backend/src/server.ts`](backend/src/server.ts) → [`backend/src/app.ts`](backend/src/app.ts) → [`backend/src/config/codemap.md`](backend/src/config/codemap.md) → [runtime](docs/operations/runtime.md).
- **Request HTTP:** [`backend/src/http/codemap.md`](backend/src/http/codemap.md) → [`backend/src/application/codemap.md`](backend/src/application/codemap.md) → [`backend/src/domain/codemap.md`](backend/src/domain/codemap.md) → [`backend/src/infra/codemap.md`](backend/src/infra/codemap.md).
- **Dados e regras de estoque:** [domínio de inventário](docs/domain/inventory.md) → [persistência MySQL](docs/data/mysql.md).
- **Contratos expostos:** [API HTTP atual](docs/api/http-api.md) → [ciclo de request](docs/architecture/request-lifecycle.md).

## Limites e pendências

Os limites observáveis, bloqueios e trabalho pendente de hardening estão em [Finalização de `feat/api-hardening`](docs/feat-api-hardening-finalizacao.md). As ações e critérios daquele documento são plano/pendência; não descrevem capacidades já implementadas.

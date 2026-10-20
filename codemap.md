# Mapa do repositório

- [`backend/`](backend/codemap.md): API TypeScript, camadas, Jest e Supertest.
- [`db/init.sql`](db/init.sql): schema de um volume MySQL novo; inclui constraints e registra a versão inicial.
- [`db/migrations/`](db/migrations/): migração `001_harden_inventory.sql` e executor para volumes existentes.
- [`docker-compose.yml`](docker-compose.yml): MySQL, migração e API; sem portas de aplicação ou banco no host.
- [`docker-compose.local.yml`](docker-compose.local.yml): publicação de desenvolvimento da API em loopback.
- [`docker-compose.gateway.yml`](docker-compose.gateway.yml): Nginx público com TLS e `auth_request` contra a verificação JWT interna.
- [`docker-compose.db-port.yml`](docker-compose.db-port.yml): publicação local opcional do banco.
- [`.github/workflows/backend-ci.yml`](.github/workflows/backend-ci.yml): build, tipos, Jest/Supertest, integração MySQL e whitespace.
- [`.codex/config.toml`](.codex/config.toml): MCP Context7 remoto com header opcional vindo do ambiente, sem chave no repositório.
- [`.gitattributes`](.gitattributes): mantém o executor de migração com LF para Linux.
- [`docs/`](docs/README.md): contratos, arquitetura, dados, operação e estado da branch.

Fluxo de um movimento: rota HTTP valida dados com Zod; controller chama o caso de uso; a porta do repositório é implementada com transação MySQL que bloqueia a linha do produto, verifica o saldo, atualiza `products.quantity` e grava `stock_movements`. Falhas esperadas são traduzidas pelo middleware de erros para um contrato JSON sem detalhes internos.

# Documentação

| Assunto | Documento |
| --- | --- |
| Contrato de rotas, paginação e erros | [API HTTP](api/http-api.md) |
| Camadas e dependências | [Arquitetura](architecture/overview.md) |
| Ciclo de uma requisição | [Request lifecycle](architecture/request-lifecycle.md) |
| Decisões técnicas e limites | [Decisões](architecture/decisions.md) |
| Invariantes de estoque | [Domínio](domain/inventory.md) |
| Schema e migração | [MySQL](data/mysql.md) |
| Plano de migrations, privilégios e entrega reproduzível | [Rota 1](data/evolucao-segura-e-entrega-reprodutivel.md) |
| Variáveis, containers e gateway | [Operação](operations/runtime.md) |
| Instalação, banco, execução e testes do serviço | [README do backend](../backend/README.md) |
| Estratégia e comandos da suíte de testes | [README dos testes](../backend/tests/README.md) |
| Valores fictícios para Compose local e testes | [`.env.mock`](../.env.mock) |
| Registro histórico de hardening | [feat/api-hardening](feat-api-hardening-finalizacao.md) |
| Visão futura do ERP | [Roadmap](roadmap.md) |

Os `codemap.md` próximos ao código descrevem o estado implementado em cada pasta. O documento da branch distingue o que está no repositório do que depende da implantação do gateway.

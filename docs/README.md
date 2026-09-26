# Índice técnico

Este índice organiza a documentação técnica do `erp_full_stack` sem substituir os guias especializados.

## Convenção de estado

- **Estado atual** descreve somente comportamento, estrutura e limitações verificáveis no repositório.
- **Plano**, **recomendação**, **decisão pendente**, **roadmap** e **critérios de aceite** descrevem trabalho futuro ou condicionado; não devem ser interpretados como implementação existente.

## Roteiro de leitura para onboarding

1. Comece pelo [Atlas Mestre](../codemap.md) para localizar entry points, camadas e fluxos.
2. Leia a [Visão geral da arquitetura](architecture/overview.md) para o contexto e a composição do backend.
3. Siga o [Ciclo de request até a persistência](architecture/request-lifecycle.md) para entender bootstrap, requisição, erros e gravação.
4. Consulte o [Registro de decisões arquiteturais](architecture/decisions.md) para separar escolhas observadas de decisões pendentes.
5. Consulte o [Domínio de inventário](domain/inventory.md) antes de alterar regras de produto, saldo ou movimentos.
6. Consulte a [API HTTP atual](api/http-api.md) antes de mudar rotas, payloads, respostas ou erros.
7. Consulte a [Persistência MySQL](data/mysql.md) antes de alterar queries, schema ou mapeamentos.
8. Consulte a [Operação em tempo de execução](operations/runtime.md) antes de alterar ambiente, scripts, Dockerfile ou Compose.
9. Leia [Finalização de `feat/api-hardening`](feat-api-hardening-finalizacao.md) para bloqueios, decisões e pendências; suas propostas não são estado implementado.

## Guias por assunto

| Assunto | Documento |
| --- | --- |
| Arquitetura e responsabilidades | [Visão geral](architecture/overview.md) |
| Fluxo de bootstrap, request e persistência | [Request lifecycle](architecture/request-lifecycle.md) |
| Decisões observadas e pendências arquiteturais | [Registro de decisões](architecture/decisions.md) |
| Regras e limites de produto/estoque | [Domínio de inventário](domain/inventory.md) |
| Endpoints e contratos HTTP | [API HTTP atual](api/http-api.md) |
| Schema, queries e conexão MySQL | [Persistência MySQL](data/mysql.md) |
| Scripts, ambiente, Docker e Compose | [Operação em tempo de execução](operations/runtime.md) |
| Limites, bloqueios e plano de hardening | [Finalização de `feat/api-hardening`](feat-api-hardening-finalizacao.md) |

## Codemaps úteis

Para navegar o código, comece pelo [mapa raiz](../codemap.md) e, para investigação profunda, abra o codemap da pasta em que fará a mudança:

- [backend/](../backend/codemap.md)
- [backend/src/](../backend/src/codemap.md)
- [configuração](../backend/src/config/codemap.md)
- [domínio](../backend/src/domain/codemap.md)
- [aplicação](../backend/src/application/codemap.md)
- [HTTP](../backend/src/http/codemap.md)
- [infraestrutura](../backend/src/infra/codemap.md)

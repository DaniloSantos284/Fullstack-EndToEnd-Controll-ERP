# Estado de `feat/api-hardening`

Esta página registra o estado da branch em 20/10/2026. Código presente no repositório, testes executados e validações pendentes são distinguidos abaixo.

## Entregue no repositório

- Schema MySQL com constraints, saldo materializado, migração versionada e transação com `FOR UPDATE` para movimentos.
- Validação HTTP estrita com Zod, UUID, paginação com limite, erros `{code,message,requestId}`, Helmet, tamanho máximo de JSON, rate limit local, logs redigidos, liveness, readiness e shutdown gracioso.
- Jest 30.5.2, Supertest 7.3.0 e pnpm 12.14.0. Há testes de domínio, SQL transacional simulado, HTTP e JWT/JWKS, além de um teste de integração preparado para MySQL real.
- Docker multi-stage com runtime sem dependências de desenvolvimento e usuário `node`; Compose sem portas publicadas por padrão, overlays locais e Nginx com TLS/`auth_request` para implantação pública.
- CI com instalação congelada, build, tipos, testes, MySQL descartável e `git diff --check`.
- O Compose repassa `DB_CONNECTION_LIMIT` à API. Erros de charset/codificação JSON não suportados retornam `415`, e erros de corpo interrompido ou tamanho inconsistente retornam `400`; o contrato e os testes HTTP foram atualizados.

## Validação executada até aqui

| Verificação | Resultado |
| --- | --- |
| Instalação com lockfile congelado, build TypeScript e checagem de tipos de teste | Passaram localmente. |
| Jest/Supertest | 7 suítes e 42 testes passaram após a correção HTTP; cobertura de linhas de 93,20%. |
| `git diff --check` | Passou após a correção HTTP e a atualização do Compose. |
| `docker compose config --quiet` | Passou para os overlays local e público com variáveis de exemplo. Isso valida a composição, não a inicialização dos serviços. |
| MySQL real, migração e containers | **Pendente.** Em duas tentativas, incluindo uma após reiniciar o Docker Desktop, o engine mudou de `running` para `stopping` durante o pull de `mysql:9.7` e a CLI recebeu `unexpected EOF`. O diagnóstico registrou falha no `wsl-bootstrap`; reiniciar o WSL não recuperou o Desktop. Nenhum teste com MySQL real terminou. |
| Nginx em execução | **Pendente.** O template e o fluxo `auth_request` passaram por revisão estática. Uma etapa de `nginx -t` com certificado descartável foi adicionada ao CI, mas ainda não rodou; a execução local também depende de um engine Docker estável. |

## O que falta para concluir a branch

1. Com o Docker Desktop estável, subir um Compose **descartável**, confirmar healthchecks e migração, executar `pnpm --dir backend test:integration` contra MySQL real e testar `nginx -t` com certificado temporário. O projeto de verificação usado até agora foi `hardeningverify20261020x7q`; conferir seus recursos antes de removê-los.
2. Executar o workflow de CI, que agora também verifica a sintaxe do Nginx, e registrar seu resultado. Repetir `git diff --check` após qualquer ajuste adicional.

A publicação na internet requer, além da conclusão da branch, um provedor OIDC que emita os JWTs do frontend, os valores reais de `issuer`, `audience` e JWKS, DNS e certificados TLS. O serviço de emissão de tokens não existe neste repositório. A configuração do Context7 já referencia `CONTEXT7_API_KEY` do ambiente do Codex sem gravar ou inspecionar seu valor; uma nova sessão do Codex deve carregar o MCP.

## Dependência para publicação na internet

O frontend usará JWT e o Nginx fará a decisão de acesso antes de encaminhar `/api/`. O serviço interno `/internal/auth/verify` valida JWT por JWKS e escopos, mas o provedor OIDC ainda não foi escolhido. Para iniciar o overlay público, configure `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_JWKS_URL`, `PUBLIC_HOSTNAME` e certificados TLS reais; obtenha JWTs de acesso com `inventory:read` e/ou `inventory:write`. Não publique a porta 4000 diretamente.

Não há banco persistente com dados reais a migrar nesta etapa. A migração de volumes de desenvolvimento antigos deve ser testada em cópia antes de ser aplicada a qualquer dado que passe a ser relevante.

## Verificação

Na raiz do repositório:

```bash
pnpm --dir backend install --frozen-lockfile
pnpm --dir backend build
pnpm --dir backend test:ci
pnpm --dir backend test:typecheck
git diff --check
```

Com um MySQL descartável inicializado, rode `pnpm --dir backend test:integration`. Para validar os containers, configure senhas locais e execute `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build --wait`. O teste de integração verifica duas saídas concorrentes de 7 sobre saldo 10: apenas uma é aplicada, o saldo final é 3 e existe uma saída; também verifica rollback quando o INSERT falha.

| Critério | Evidência |
| --- | --- |
| Contratos HTTP | Supertest cobre criação, listagem, movimentos, paginação, `400/404/409/413/429/503/500`, headers e saúde. |
| Integridade | Testes simulados cobrem lock, transação, rollback, overflow e concorrência; a execução com MySQL real ainda está pendente. |
| Segurança | O código do gateway exige JWT válido e escopos antes de `/api/`; a validação em Nginx real e os valores de implantação ainda estão pendentes. |
| Build e operação | TypeScript, CI, Compose healthchecks, shutdown e logs estruturados. |

As respostas paginadas e os erros padronizados mudam o contrato HTTP anterior. Como não há frontend neste repositório, a integração futura deve usar [o contrato atual](api/http-api.md).

# Estado de `feat/api-hardening`

Este documento registra a conclusão de implementação em 21/10/2026. Ele separa comportamento entregue, validações executadas nesta árvore e gates que exigem Docker ou GitHub Actions.

## Entregue

- Schema MySQL endurecido: constraints, saldo materializado, índice de histórico, migração versionada e transação com `FOR UPDATE` para aplicar movimentos.
- API com Zod estrito, UUID, paginação limitada, erros `{code,message,requestId}`, request ID, Helmet, limite de JSON, rate limit, `Cache-Control: no-store`, rejeição `415` de POST sem JSON, saúde e desligamento gracioso.
- Verificação JWT/JWKS por `auth_request` interno, escopos de leitura/escrita, Nginx com TLS, CORS explícito, limite de borda e `no-store` inclusive nas respostas geradas pelo gateway.
- Jest, Supertest e integração MySQL. A suíte HTTP inclui os contratos de cache, media type e quota; a integração verifica concorrência, rollback, paginação e preço.
- Docker multi-stage sem dependências de desenvolvimento no runtime e execução com o usuário `node`. Compose não publica portas por padrão; há overlays locais, de gateway e de manutenção MySQL documentados.
- CI para push e pull request, com permissões `contents: read`, instalação congelada, auditoria crítica de dependências de produção, build, tipos, testes, Nginx, Compose, migração real de fixture legado, integração MySQL, diagnóstico e limpeza.
- `proxy-addr` transitivo está fixado em `2.0.8` via override do pnpm para corrigir a vulnerabilidade crítica detectada na auditoria.

## Validação executada localmente

| Verificação | Resultado |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | Passou com pnpm 12.14.0. |
| `corepack pnpm test:ci` | Passou: 8 suítes, 48 testes e 93,31% de cobertura de linhas. |
| `corepack pnpm test:typecheck` | Passou. |
| `corepack pnpm build` | Passou. |
| `corepack pnpm audit --prod` e `corepack pnpm audit --prod --audit-level=critical` | Passaram: nenhuma vulnerabilidade conhecida. |
| Teste HTTP focado de hardening | Passou: 6 testes, incluindo `415` seguido de `429` para POST inválido. |
| `git diff --check` | Passou após a atualização da documentação. |

## Gates externos ainda não executados nesta sessão

- Docker não está disponível nesta distribuição WSL; por isso não foram executados localmente `docker compose config`, `nginx -t`, pull/build de imagens, healthchecks, migração em MySQL real ou `test:integration`.
- O workflow alterado não foi disparado nesta sessão, pois nenhuma alteração foi enviada ao GitHub. A primeira execução em push ou pull request deve ficar verde para comprovar o fluxo Docker e a migração legada.

Esses são limites de evidência do ambiente, não funcionalidades ausentes no repositório. O CI contém os passos para exercer os dois caminhos.

## Dependências de publicação

Uma implantação pública ainda requer um provedor OIDC que emita JWTs com `iss`, `aud`, `sub`, `exp` e `inventory:read` e/ou `inventory:write`, além de valores reais de `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_JWKS_URL`, DNS e certificados TLS. A emissão de tokens não faz parte deste repositório. Não publique a porta interna 4000 nem `/internal/auth/verify`.

## Comandos de revisão

Na raiz:

```bash
corepack pnpm --dir backend install --frozen-lockfile
corepack pnpm --dir backend test:ci
corepack pnpm --dir backend test:typecheck
corepack pnpm --dir backend build
corepack pnpm --dir backend audit --prod --audit-level=critical
git diff --check
```

Em host com Docker, depois de preencher `.env` com senhas locais:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build --wait
```

Para integração MySQL pelo host, acrescente `-f docker-compose.db-port.yml`, configure `DB_*` para `127.0.0.1:3307` e execute `corepack pnpm --dir backend test:integration`. O workflow de CI também recria o schema legado e executa `001_harden_inventory`; use-o como gate antes de merge.

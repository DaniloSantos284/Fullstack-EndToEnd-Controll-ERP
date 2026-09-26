# Finalização de `feat/api-hardening`

## 1. Status e decisão recomendada

**Não encerrar nem fazer merge desta branch como hardening antes das implementações abaixo.**

- `feat/api-hardening` e `main` apontam para o mesmo commit: `fd0f381`; não há commits funcionais na branch.
- Há 36 arquivos **rastreados** alterados somente por CRLF/whitespace, e `git diff --check` falha por esse ruído. Os artefatos de documentação/mapas ainda não rastreados — `docs/`, `AGENTS.md`, `codemap.md` e `backend/**/codemap.md` — são separados desse conjunto.
- No workspace atual, `npm --prefix backend run build` falha com `tsc: Permission denied`. É um sintoma do workspace atual, não prova de defeito do código: revalidar após `npm --prefix backend ci` em checkout limpo.
- Há bloqueios estáticos: `zod` é importado mas não está declarado em `backend/package.json`; o contrato de `env` não corresponde aos consumidores; membros privados de `Product` são acessados externamente; e a reconstituição de `id` usa `(product as any).id`.

A primeira ação deve ser uma mudança isolada de higiene: descartar/reverter o ruído local, adicionar `.gitattributes` para normalizar arquivos texto em LF e confirmar que `git diff --check` passa. Essa mudança não deve ser misturada com alterações funcionais de hardening nem com o diretório `docs/` não rastreado.

## 2. Objetivo e limite de escopo

Entregar uma API Node/Express/TypeScript/MySQL de produtos e movimentos de estoque que compile, valide entradas, preserve a integridade do estoque sob concorrência, limite abuso, produza logs úteis e possa ser operada em container.

Ficam explicitamente fora desta finalização:

- CRUD e autenticação próprios de usuários;
- frontend ou mobile;
- fluxo de upload de arquivos;
- especificação OpenAPI completa;
- microsserviços, Redis ou Kubernetes.

Autenticação é um gate condicional: se a API for exposta à internet/pública, ela é obrigatória antes da exposição. Pode ser fornecida por OIDC ou gateway, para não ampliar este escopo. Health tem regra própria: liveness mínima pode ser interna e sem autenticação; readiness não deve expor detalhes de infraestrutura publicamente.

## 3. Decisões bloqueantes

Definir e registrar antes da implementação:

1. **Exposição:** a API ficará somente em rede privada ou será pública/internet? A segunda opção exige o gate de autenticação e autorização no gateway ou API.
2. **Browsers:** há cliente browser? Quais origens, métodos e headers são aceitos? Sem essa necessidade, não habilitar CORS permissivo.
3. **Fonte de verdade do saldo:** escolher entre `products.quantity` materializado com atualização transacional, ou saldo derivado de movimentos. Não manter ambos sem invariantes; migração, backup e reconciliação só são necessários se houver banco persistido relevante.
4. **Preço:** o SQL já armazena `products.price` como `DECIMAL(10, 2)`. Separadamente, permanece pendente definir a representação do valor em TypeScript e no JSON (incluindo conversão), precisão e moeda; não confundir o armazenamento atual com esse contrato. Não usar `float` para valor monetário.
5. **Compatibilidade:** identificar consumidores dos contratos atuais e decidir versionamento/depreciação para mudanças de campos, erros e paginação.
6. **Dados existentes:** se houver banco persistido relevante, verificar movimentos e quantidades, executar reconciliação e definir rollback/backup para a migração escolhida.
7. **Réplicas:** a aplicação rodará com mais de uma instância? Isto determina onde aplicar rate limit e a necessidade de armazenamento compartilhado.

## 4. Roadmap ordenado

### 4.1 Higiene do repositório

Entregáveis: restaurar o checkout sem as 36 mudanças rastreadas de CRLF/whitespace, criar `.gitattributes` com LF para texto e validar o diff. Manter os artefatos não rastreados de documentação/mapas separados dessa higiene. Criar `.gitignore` e `.dockerignore` mínimos para segredos, dependências, cobertura e artefatos.

Arquivos prováveis: `.gitattributes`, `.gitignore`, `.dockerignore` e a raiz do repositório. Manter esta etapa isolada em commit próprio.

### 4.2 Baseline de build, configuração e Docker

Entregáveis: corrigir/revalidar a execução de `tsc` após `npm --prefix backend ci`; declarar `zod` em `backend/package.json` e lockfile; e fazer schema em `backend/src/config/env.ts` e consumidores adotarem o mesmo contrato. Esse contrato pode exportar nomes uppercase ou camelCase, desde que a interface pública e todos os acessos sejam coerentes.

Como o Compose lê `.env` na raiz, criar e manter uma única estratégia com `.env.example` também na raiz, sem segredos, para as substituições do Compose e variáveis documentadas da API. Se houver execução da API fora do Compose, documentar o mesmo contrato, sem exemplos divergentes. Alinhar porta de schema, aplicação e Docker: hoje o Docker expõe/mapeia `4000` e o default de `PORT` é `3333`.

Separar `DB_PORT` interno (porta `3306` usada pela API na rede Compose) de `DB_PUBLISHED_PORT` (mapeamento opcional para o host). No Compose, a API deve usar host `db` e não receber a senha root do MySQL. Parametrizar o banco; `db/init.sql` não deve fixar `stockdb` sem correspondência com a configuração, e não deve ser tratado como migration de volumes já existentes.

O alvo é Node LTS suportado, com `npm ci`, imagem multi-stage, runtime apenas com dependências de produção e usuário não-root. Incluir healthcheck da API, hoje ausente; a publicação da porta do banco deve ser opcional.

Arquivos prováveis: `.env.example`, `backend/package.json`, lockfile, `backend/src/config/env.ts`, `backend/Dockerfile`, `docker-compose.yml` e `db/init.sql`.

### 4.3 Testabilidade antes de ampliar comportamento

Entregáveis: adicionar runner de testes, script `test`, configuração de ambiente de teste e fixtures/limpeza de banco. Separar acesso a dados o suficiente para testar regras HTTP e transações sem depender do estado manual do ambiente.

Arquivos prováveis: `backend/package.json`, `backend/src/**/*.test.ts` ou `backend/test/`, configuração do runner e Compose de teste, se necessário.

### 4.4 Integridade de estoque e paginação

Entregáveis: separar hidratação/reconstituição de comandos de domínio. Reconstituir produto e movimentos por factory/construtor próprio, sem chamar a validação de um novo comando (`addMovement`); a ordem determinística é requisito de resposta, não de reconstituição. Eliminar o acesso externo a membros privados de `Product` e o overwrite de `id` por `(product as any).id`.

Executar saída como unidade atômica no MySQL: lock, cálculo, criação de movimento e persistência devem usar a mesma `PoolConnection` na mesma transação, sem janela read/validate/write concorrente. Persistir saldo materializado somente se essa for a fonte de verdade decidida na seção 3. Incluir constraints de banco adequadas como defesa em profundidade.

Tipar rows e normalizar valores `DECIMAL`; eliminar `as any`. Substituir N+1 por consulta/estratégia em lote, eliminar a query duplicada de `/movements` e paginar produtos, movimentos e o histórico retornado por details, com limites máximos, ordem estável e desempate por id. Se houver banco persistido relevante, incluir migração/reconciliação; `db/init.sql` não migra volumes existentes.

Arquivos prováveis: `backend/src/application/use-cases`, `backend/src/domain`, `backend/src/domain/repositories`, `backend/src/infra/db/mysql/repositories`, `db/` e testes de integração de banco.

### 4.5 Schema HTTP e contrato de erros

Entregáveis: centralizar schemas Zod para params, query e body das rotas atuais. Os schemas definem UUID, inteiros, limites equivalentes às colunas, rejeição explícita de campos extras e paginação/ordem estável com desempate por id:

- `GET`/`POST /api/products`;
- `GET /api/products/:id`;
- `POST /api/products/:id/stock/entry`;
- `POST /api/products/:id/stock/exit`;
- `GET /api/products/:id/movements`.

Padronizar respostas de erro como `{ code, message, requestId }`, sem stack, SQL, variáveis ou outros detalhes internos. Validação e JSON malformado retornam `400`; rota ausente retorna `404` em JSON; ausência é `404`; conflito de regra/estoque é `409`; payload grande é `413`; limite excedido é `429`; dependência DB reconhecidamente indisponível é `503`; falha inesperada é `500`. Não converter erros de infraestrutura em `400`.

Arquivos prováveis: `backend/src/http/routes/`, `backend/src/http/middlewares/`, `backend/src/http/schemas/` e handler global de erros.

### 4.6 Middlewares de proteção e observabilidade

Entregáveis: aplicar `helmet`, limite explícito de JSON com resposta `413`, request-id, logs estruturados e redigidos, e rate limit. Configurar CORS somente se a decisão de browser exigir, com allowlist de origem e sem curingas indevidos.

Rate limit in-memory só é aceitável para uma instância; para múltiplas réplicas, usar mecanismo compartilhado ou delegar o limite ao gateway. Não registrar senhas, tokens, connection strings, bodies sensíveis ou segredos de ambiente.

Arquivos prováveis: bootstrap de Express em `backend/src/`, middlewares, config e dependências em `backend/package.json`.

### 4.7 Health, shutdown e container

Entregáveis: expor liveness e readiness com contratos mínimos, sem vazar erro de banco; adicionar healthcheck da API ao Compose; implementar encerramento gracioso de HTTP e pool MySQL; executar a imagem como usuário não-root. Garantir configuração por ambiente e dependências de container coerentes com a porta e banco definidos no baseline.

Arquivos prováveis: entrada da aplicação, configuração de banco, `backend/Dockerfile` e `docker-compose.yml`.

### 4.8 Testes, CI e documentação operacional

Entregáveis: cobrir regras, integrações HTTP e concorrência; adicionar CI para instalação limpa, build, testes e whitespace no range da branch; documentar variáveis, execução local/container, paginação, erros e health. Uma OpenAPI completa continua fora do escopo, mas os contratos essenciais devem ser descritos.

Arquivos prováveis: workflow em `.github/workflows/`, testes em `backend/`, `README` e esta documentação.

## 5. Critérios de aceite

| Área | Evidência testável |
| --- | --- |
| Build | Em checkout limpo, `npm --prefix backend ci` e `npm --prefix backend run build` terminam com sucesso. |
| Ambiente | `.env.example` da raiz valida, não contém segredo e nomes/portas batem entre schema, app, `backend/Dockerfile`, `docker-compose.yml` e banco; `DB_PORT=3306` é interno e `DB_PUBLISHED_PORT` é opcional. |
| Erros | Casos exercitados retornam `{ code, message, requestId }` com `400`, `404`, `409`, `413`, `429`, `503` e `500` corretos, sem leak de stack/SQL/segredo. |
| Movimentos | Entrada aumenta saldo; saída válida reduz; saída sem saldo retorna `409`; reconstituição não aplica validação de comando novo. |
| Concorrência | Com saldo 10, duas saídas simultâneas de 7 produzem um `201` e um `409`, saldo final 3 e exatamente uma saída persistida. |
| Atomicidade | Falha ao criar movimento ou atualizar saldo faz rollback integral. |
| Listagens | Produtos, movimentos e histórico de details são paginados, têm limite máximo/ordem estável/desempate por id; teste contabiliza e limita as queries, sem N+1. |
| HTTP | `helmet`, limite de corpo e request-id estão ativos; payload excedido retorna `413`, JSON malformado `400` e rota ausente JSON `404`. |
| Limites/CORS | Rate limit retorna `429`; para origem não permitida, ACAO está ausente ou retorna `403`, conforme a política definida. |
| Exposição | Se pública, autenticação/autorização é aplicada; health segue a regra mínima definida. |
| Operação | Health, shutdown e logs estruturados funcionam; logs não contêm segredos. |
| Container | Imagem Node LTS suportado sobe com configuração válida, runtime só tem dependências de produção, processo não roda como root, API usa host `db` e healthcheck responde. |
| Git/CI | `git diff --check` passa localmente e CI executa `git diff --check $(git merge-base origin/main HEAD)..HEAD` ou `git show --check` no range da branch. |

## 6. Sequência de validação em checkout limpo

Executar os comandos abaixo a partir da raiz do repositório e em checkout limpo. O script `test` ainda precisa ser criado; não assumir que ele ou o workflow de CI já existem hoje.

```bash
git diff --check
git diff --check "$(git merge-base origin/main HEAD)..HEAD"
npm --prefix backend ci
npm --prefix backend run build
npm --prefix backend test
```

Como alternativa/defesa adicional no CI, usar `git show --check` no range da branch. Validar o container com `docker compose config`, seguido de build/subida e inspeção dos logs/health. Com o serviço pronto, executar testes HTTP contra produtos e movimentos, cobrindo payload excessivo, JSON malformado, rota ausente, rate limit, CORS condicional e concorrência. Os comandos HTTP concretos devem usar porta, host, health path e credenciais definidos pela implementação; não há script de teste existente a ser invocado hoje.

## 7. Riscos e observações

- CORS não é controle de acesso e não substitui autenticação para API pública.
- Rate limit em memória não protege de forma global quando há múltiplas instâncias.
- Alterar a fonte de verdade do saldo exige migração, backup e reconciliação somente se houver banco persistido relevante; nesse caso, não assumir que `products.quantity` e movimentos já concordam. `db/init.sql` não altera volumes existentes.
- `/uploads` está publicamente acessível, mesmo que não haja arquivos ou fluxo de upload no escopo. Remover a exposição ou restringi-la até existir requisito e proteção apropriados.
- O ruído CRLF atual mascara revisão funcional e deve continuar separado de código, com LF aplicado de modo controlado por `.gitattributes`.

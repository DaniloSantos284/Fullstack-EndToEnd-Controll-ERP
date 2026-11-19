# ADR — Tenancy, identidade e autorização do SaaS de estoque

## 1. Título e status

**Título:** Identidade pessoal, workspaces, memberships e autorização do MVP  
**Status:** **Proposed — awaiting review**  
**Data do rascunho:** 18/11/2026  
**Branch sugerida:** `docs/saas-tenancy-authz-adr` — existência não verificada.

Este documento registra o rascunho apresentado após revisão estática do projeto. As recomendações aguardam aprovação do líder técnico. Não constitui schema definitivo, contrato final de endpoints ou evidência de implementação.

A criação deste arquivo foi solicitada posteriormente à análise. Não representa aprovação da ADR nem execução de testes.

## 2. Contexto e problema

O produto é um SaaS de estoque, independente do projeto de website builder, inicialmente para aproximadamente dez empresas, com um a cinco usuários por empresa.

Segundo o proprietário, `feat/api-hardening` foi concluída, o trabalho está em `develop` e o CI passou após correções. Essas informações não foram verificadas independentemente.

A base atual possui arquitetura em camadas, validação HTTP, estoque transacional e autenticação no gateway. Entretanto, as fontes inspecionadas ainda não oferecem contexto empresarial nem autorização por membership.

**Problema central:** validar um JWT não demonstra que seu portador pertence atualmente à empresa nem que pode executar determinada ação sobre um produto.

O gateway atual também remove o bearer antes da API, impedindo os casos de uso de identificar o usuário por esse mecanismo.

Não existem dados de produtos ou estoque que precisem ser preservados, conforme confirmação do proprietário. Isso simplifica a transição, mas **não autoriza apagar volumes, bancos ou outros recursos**.

## 3. Requisitos confirmados e exclusões

### 3.1 Requisitos

- Conta pessoal distinta do workspace.
- Um workspace isolado por empresa.
- Uma membership ativa por usuário no MVP.
- Saída ou remoção permite ingresso posterior em outra empresa.
- Cadastro por email/senha, verificação de email e recuperação por email.
- Cadastro para criar empresa gera Owner e administrador inicial.
- Convite ingressa na empresa existente, sem criar outra.
- Convites de 72 horas, reenviáveis, com email verificado.
- Papéis operacionais Administrator e Operator.
- Owner permanece Administrator, não sai, não transfere propriedade e não pode ser removido ou rebaixado.
- Owner e administradores podem convidar/remover membros, alterar papéis, desativar/excluir produtos e alterar o email empresarial de alertas, respeitando a proteção do Owner.
- Operator consulta e movimenta estoque, mas propõe criação/edição de produtos para aprovação administrativa.
- Remoção revoga acesso empresarial e preserva identificação nos históricos retidos.
- Workspace sempre possui email de alertas; inicialmente pode usar o email pessoal verificado do Owner.
- Mudança desse endereço mantém o anterior até confirmação do novo.
- Android e iOS primeiro; operação exclusivamente online e um local de estoque por empresa.
- Preferência por serviços gratuitos, com avaliação de baixo custo quando necessário; nenhum fornecedor escolhido.

### 3.2 Exclusões

Múltiplas memberships simultâneas, múltiplos locais de estoque, Google login, web, offline e transferência de propriedade.

Esta ADR não resolve precisão quantitativa, entrega de alertas, retenção detalhada, backups ou contratos completos de aprovação. Esses assuntos terão decisões próprias, respeitando a fundação de isolamento proposta aqui.

As estimativas de empresas e usuários não são quotas comerciais implementadas.

## 4. Implementação atual e evidências

As classificações distinguem código, documentação e informações do proprietário. Inspeção estática não comprova comportamento em execução.

| Achado | Classificação | Evidência |
| --- | --- | --- |
| Backend em camadas, com domínio separado de Express/MySQL | Verificado/documentado | `docs/architecture/overview.md:3–10` |
| Rotas de produtos montadas sem autenticação/autorização local | Verificado | `backend/src/app.ts:54–66`; `backend/src/http/routes/products.routes.ts:70–98` |
| JWT validado por emissor, audiência, assinatura, expiração e sujeito | Verificado | `backend/src/infra/security/JwksAccessTokenVerifier.ts:104–127` |
| Principal contém somente `subject` e `scopes` | Verificado | `backend/src/application/security/AccessTokenVerifier.ts:1–8` |
| Controller usa escopos por método e não propaga o sujeito | Verificado | `backend/src/http/controllers/VerifyGatewayTokenController.ts:27–50` |
| Nginx executa `auth_request` e remove `Authorization` antes da API | Verificado | `deploy/nginx/default.conf.template:40–49` |
| Schema sem contas, workspaces, memberships ou autoria dos movimentos | Verificado no schema examinado | `db/init.sql:1–40` |
| Repositórios consultam por produto/ID sem workspace | Verificado | `MySqlProductRepository.ts:44–69`; `MySqlStockMovementRepository.ts:103–112`, em `backend/src/infra/db/mysql/repositories/` |
| Estoque usa transação, bloqueio de produto, commit e rollback | Verificado estaticamente | `backend/src/infra/db/mysql/repositories/MySqlStockMovementRepository.ts:23–100` |
| Provedor e integração real de cadastro/verificação/recuperação | Não encontrados no material inspecionado | Contrato atual e `docs/roadmap.md:9–11` |
| Conclusão da hardening, trabalho em develop e CI aprovado | Informado pelo proprietário | Contexto fornecido; sem verificação independente |

### 4.1 Correções da análise anterior

`docs/saas-inventory-mvp-analysis.md` é planejamento e contém afirmações desatualizadas:

1. **Jest possui thresholds globais:** branches 75%, functions 95%, lines 90% e statements 90% (`backend/jest.config.cjs:33–40`). O script `test:ci` habilita cobertura (`backend/package.json:18`). Isso comprova configuração, não aprovação dos testes.
2. **O runner já possui trava MySQL, verificação de invariantes e recuperação de marker ausente**, com falha fechada para estados incompatíveis (`db/migrations/migrate.sh:207–267`).
3. A documentação de testes descreve matriz de migrations e E2E de gateway. Não devem ser tratados como mecanismos inexistentes nem como execuções verificadas nesta análise.
4. Questões sobre permanência do Owner como Administrator, poderes administrativos e email inicial foram respondidas pelo proprietário.

Consequentemente, não se recomenda reescrever preventivamente o runner nem refazer a hardening.

## 5. Alternativas consideradas e trade-offs

### 5.1 Propagação da identidade

| Alternativa | Vantagens | Custos e riscos | Decisão proposta |
| --- | --- | --- | --- |
| Encaminhar JWT e validá-lo na API | Reutiliza verificador existente; identidade e autorização próximas dos casos de uso | Exige mudar gateway, middleware e E2E; bearer circula no trecho interno | **Recomendada** |
| Headers de identidade confiáveis | API recebe contexto pronto | Exige origem autenticada, remoção de headers do cliente e proteção contra acesso direto; papel pode ficar desatualizado | Não adotar no MVP |
| Asserção interna assinada | Fronteira explícita entre gateway e API | Acrescenta emissão, chaves, rotação e outro contrato de validação | Complexidade desnecessária agora |
| Gateway como autoridade completa | Mantém decisão na borda | Precisa conhecer memberships, papéis e recursos; duplica domínio ou cria dependência adicional | Não recomendado |

### 5.2 Identidade gerenciada

**Proposta:** utilizar identidade gerenciada compatível com o contrato aprovado, sem selecionar fornecedor nesta ADR.

Cadastro e recuperação pelo aplicativo não exigem que o backend armazene senhas.

**Razão:** aproveitar a verificação externa existente e evitar construir um serviço de credenciais antes de avaliar opções adequadas. Caso nenhuma opção atenda, a alternativa exige avaliação própria, não implementação automática de autenticação própria.

### 5.3 Armazenamento compartilhado

**Proposta:** manter MySQL compartilhado, com isolamento lógico explícito por workspace.

**Razão:** corresponde à infraestrutura atual e ao porte inicial. Banco por empresa acrescentaria operação, conexões e migrations sem necessidade demonstrada. A escolha exige testes rigorosos de isolamento na aplicação e nas relações do banco.

Não trocar de banco apenas para aproveitar um serviço gratuito.

## 6. Arquitetura recomendada e fronteiras de confiança

### 6.1 Fluxo proposto

```text
Aplicativo ↔ Provedor de identidade
Aplicativo → HTTPS/Nginx → API
                           ├─ valida identidade
                           ├─ resolve conta pessoal
                           ├─ resolve membership e papel atuais
                           └─ autoriza ação e recurso no workspace
```

### 6.2 Responsabilidades

**Provedor**

- Autenticação email/senha.
- Verificação e recuperação.
- Emissão do token aceito pela API, conforme contrato a selecionar.

**Nginx**

- TLS, roteamento, limites de borda e headers de segurança.
- Encaminhamento do bearer.
- Nenhuma atribuição de papel ou workspace baseada em headers do cliente.

**API**

- Validação do token e obtenção de identidade verificável.
- Mapeamento da identidade externa para conta interna.
- Comprovação confiável de email verificado.
- Membership, RBAC e autorização de recursos.
- Invariantes transacionais e autoria.

### 6.3 Mudanças necessárias

1. Encaminhar `Authorization` à API.
2. Instalar autenticação e autorização antes das rotas protegidas.
3. Retirar `auth_request` do caminho de negócio ao concluir a transição, eliminando autorização concorrente por método/escopo.
4. Atualizar testes que hoje esperam bearer removido.
5. Manter a API fora da exposição pública direta.

A mudança deve ser coordenada: **não remover o bloqueio do gateway antes de a API proteger os caminhos correspondentes**.

Os escopos `inventory:read/write` não serão traduzidos automaticamente em Administrator/Operator. A autoridade desses papéis será a membership persistida.

### 6.4 Identidade interna

Proposta conceitual:

- identidade externa reconhecida pelo par emissor/sujeito;
- identificador interno estável da pessoa;
- email como contato e correspondência de convites, não chave imutável da pessoa;
- confirmação do email obtida de informação autenticada do provedor, nunca de booleano enviado pelo aplicativo.

O contrato exato depende do fornecedor. Não presumir que todo access token contém email ou `email_verified`; não aceitar qualquer ID token como credencial de API sem decisão explícita de integração.

## 7. Isolamento, membership, papéis e Owner

### 7.1 Determinação do workspace

O servidor resolve a única membership ativa da conta. O cliente não escolhe livremente workspace ou papel.

Sem membership, o usuário verificado acessa somente os fluxos necessários de onboarding, criação de empresa e aceitação de convite. Isso evita exigir workspace para criar o primeiro, sem liberar inventário global.

### 7.2 Invariantes propostas

1. No máximo uma membership ativa por pessoa.
2. Histórico de vínculos encerrados preservado enquanto necessário aos registros retidos.
3. Cada workspace possui Owner com membership ativa Administrator.
4. Owner não pode sair, ser removido, rebaixado ou transferido, inclusive por autoalteração.
5. Convite nunca concede identificação de Owner.
6. Autoria vem do contexto autenticado, não do comando do cliente.

A unicidade ativa precisa de garantia no banco, além da validação da aplicação. Em MySQL, avaliar coluna gerada com unicidade ou estrutura equivalente; **não usar índice parcial inexistente nessa plataforma**.

Essa restrição poderá evoluir depois. Não é necessário implementar múltiplos workspaces agora.

### 7.3 Matriz resumida

| Ação | Owner/Administrator | Operator |
| --- | --- | --- |
| Consultar inventário | Permitida | Permitida |
| Registrar entrada/saída | Permitida | Permitida |
| Criar/editar produto diretamente | Permitida, respeitando pendências | Não |
| Propor criação/edição | Não necessário ao fluxo administrativo confirmado | Permitida |
| Aprovar/rejeitar proposta | Permitida | Não |
| Convidar/remover membros e alterar papéis | Permitida, sem modificar Owner | Não |
| Desativar/excluir produtos | Permitida | Não |
| Alterar email empresarial de alertas | Permitida | Não |

Owner não ignora invariantes de domínio, como bloqueio de edição enquanto houver proposta pendente. Permissões adicionais não são presumidas.

### 7.4 Aplicação do isolamento

- **Leituras:** workspace obrigatório antes de buscar dados.
- **IDs:** conhecer UUID de outra empresa não autoriza acesso.
- **Escritas:** validação e alteração incluem escopo empresarial.
- **Movimentos:** pertencem ao mesmo workspace do produto.
- **Paginação:** filtros, ordenação e `hasNext` operam somente sobre aquele workspace.
- **Aprovações:** proposta, produto e decisão não podem cruzar empresas; o ator deve estar autorizado naquele contexto.
- **Jobs:** contexto empresarial explícito e permissões de sistema delimitadas; não usar administrador global fictício.

FKs compostas podem impedir referências cruzadas, mas não substituem filtros de leitura. Não manter repositórios globais como fallback quando faltar contexto.

### 7.5 Identificação histórica

Movimentos e auditoria referenciam a pessoa de forma estável e mantêm o contexto empresarial da ação, podendo referenciar a membership histórica.

Remover membro encerra o vínculo; não apaga a pessoa nem reatribui registros a outro usuário.

Não reconstruir a empresa histórica pela membership atual da pessoa: ela pode ingressar em outra empresa. Não acrescentar snapshots de dados pessoais ou prazos de retenção sem decisão específica.

## 8. Fluxos de cadastro e convite

### 8.1 Cadastro para criar empresa

1. Pessoa cria conta no provedor.
2. Confirma email.
3. API verifica identidade e confirmação.
4. Pessoa solicita explicitamente criação de empresa.
5. Em transação, verificar ausência de vínculo ativo, criar workspace e membership Owner/Administrator.
6. Inicializar email empresarial com o endereço verificado do Owner.

O endereço empresarial torna-se contato independente: mudança posterior do email pessoal não troca silenciosamente o destinatário empresarial.

Falha na criação não deixa workspace sem Owner. Repetição ou concorrência não pode gerar dois vínculos ativos.

### 8.2 Aceitação de convite

1. Owner/Administrator cria convite para email e papel permitidos.
2. Sistema envia link com validade de 72 horas.
3. Convidado entra ou cria conta, preservando a intenção de ingresso.
4. API exige email verificado correspondente ao convite.
5. Em transação, validar convite, prazo e ausência de vínculo ativo.
6. Consumir convite e criar membership no workspace existente.

O papel vem do convite persistido, não de parâmetro alterável pelo convidado.

**Proposta técnica:** segredo imprevisível, armazenamento não reutilizável, consumo único e reenvio com novo link que invalida o anterior. A validade é avaliada pelo servidor. A política deve ser aprovada antes do incremento de convites.

### 8.3 Mudança de email empresarial

Owner/Administrator solicita alteração; o endereço novo fica pendente. O ativo permanece até confirmação.

A confirmação deve estar vinculada ao workspace e à alteração solicitada. Validade do link e detalhes de envio são decisão posterior; não herdam automaticamente as 72 horas do convite.

## 9. Consequências para backend, API, banco e mobile

| Área | Impacto proposto | Razão |
| --- | --- | --- |
| Backend | Contextos distintos de identidade e acesso empresarial; políticas nos casos de uso | Evitar autorização espalhada somente por controllers |
| Transações | Compartilhar unidade transacional entre revalidação de membership e efeito | Middleware seguido de transação independente deixa janela de concorrência |
| API | Proteção por ação/recurso; onboarding separado do inventário | Método HTTP não representa papel ou vínculo |
| Repositórios | Workspace obrigatório nas operações empresariais | Impedir consultas globais acidentais |
| Banco | Contas, workspaces, vínculos, Owner, autoria e relações empresariais | Schema atual não representa os requisitos |
| Migrations | Reutilizar trava/verificação/recuperação; ampliar somente o necessário para a próxima versão | Não reconstruir mecanismos existentes |
| Mobile | Sessão, verificação, onboarding/convite distintos e perda de acesso | Cliente não é autoridade de papel/workspace |
| Operação | Proteger bearer em trânsito e logs; backend privado | Token passará a chegar à API |

Não há necessidade de backfill de produtos ou autores fictícios. Ainda assim, mudanças exigem procedimento explícito; não apagar recursos como atalho.

Nenhum nome de entidade, atributo ou operação conceitual desta ADR constitui schema ou endpoint final.

## 10. Cenários de segurança e concorrência

### 10.1 Fronteira de autorização proposta

Para escritas, membership e papel devem ser revalidados **na transação que produz o efeito**.

Para o porte inicial, uma estratégia simples é serializar mutações relevantes pela guarda do workspace e usar locks de conta para criação/aceitação de vínculos.

Adotar ordem única, por exemplo:

1. contas envolvidas, ordenadas;
2. workspace;
3. memberships;
4. produto/proposta.

A implementação deve usar a mesma ordem nas operações concorrentes. A finalidade é evitar autorização com papel antigo e reduzir deadlocks. Serialização por empresa é conservadora, mas proporcional ao MVP.

- Se remoção/rebaixamento for efetivado primeiro, comando posterior não usa autorização antiga.
- Se comando concluir primeiro sob proteção, foi autorizado antes da alteração.
- Não se promete cancelar retroativamente resposta enviada ou leitura previamente autorizada.

### 10.2 Testes necessários

| Cenário | Resultado esperado |
| --- | --- |
| Token ausente, inválido ou de audiência inadequada | Nenhum acesso empresarial |
| Email não verificado | Sem acesso ao negócio |
| Identidade, papel ou workspace forjados no request | Não substituem contexto do servidor |
| Pessoa de A usa produto, movimento ou proposta de B | Nenhum dado ou efeito cruzado |
| Paginação de A com dados adicionais em B | Página e `hasNext` de A não mudam por causa de B |
| Dois convites para empresas diferentes aceitos simultaneamente | No máximo uma membership ativa |
| Convite expirado, consumido ou de outro email | Nenhum vínculo criado |
| Bootstrap repetido/concorrente | Sem workspace órfão ou segundo vínculo ativo |
| Remoção/rebaixamento concorre com comando | Ordem transacional respeitada |
| Owner tenta sair ou mudar o próprio papel | Recusado |
| Administrador tenta remover/rebaixar Owner | Recusado |
| Pessoa removida ingressa em outra empresa | Histórico anterior mantém autoria; acesso antigo negado |
| Job recebe recurso de outra empresa | Não executa fora do contexto autorizado |

Preservar testes de concorrência de estoque e rollback. Os novos testes precisam incluir MySQL real com conexões concorrentes; mocks não demonstram constraints ou locks.

## 11. Incrementos de implementação e critérios de aceite

Todos os nomes abaixo são sugestões.

| Ordem | Incremento | Aceite principal |
| --- | --- | --- |
| 1 | `feat/workspace-membership-core` | Conceitos e políticas de domínio/aplicação sem exposição pública; testes de papéis, Owner e ciclo do vínculo |
| 2 | `feat/workspace-membership-persistence` | Constraints/transações; banco novo e upgrade verificados; vínculo ativo único em concorrência |
| 3 | `feat/api-identity-boundary` | Bearer encaminhado/validado na API; transição do gateway sem janela desprotegida |
| 4 | `feat/tenant-scoped-inventory` | Rotas existentes escopadas, autorização atual e autoria; testes cruzados por operação |
| 5 | `feat/workspace-bootstrap` | Workspace, Owner e email inicial atômicos; repetição sem duplicação |
| 6 | `feat/member-lifecycle` | Remoção, saída e papéis; proteção do Owner e testes concorrentes |
| 7 | `feat/workspace-invitations` | Email verificado, 72 horas, reenvio e consumo concorrente; nunca cria empresa indevida |
| 8 | `test/saas-foundation-security` | Matriz integrada de identidade, isolamento, transações e jobs em ambiente descartável |

O incremento 1 pode avançar sem fornecedor definitivo, usando portas e testes de políticas. A integração real do incremento 3 depende do contrato de identidade escolhido.

Antes de atender empresas reais, não pode restar caminho global, fallback sem workspace, autenticação apenas presumida por rede ou autorização confiada ao cliente.

Essa fundação não declara o MVP completo. Unidades, aprovações, alertas e exclusão ainda exigem seus próprios requisitos, implementações e validações.

## 12. Decisões abertas e riscos

### 12.1 Bloqueiam o primeiro incremento

- Aprovação técnica da API como autoridade de autorização.
- Aprovação dos contextos de conta/membership e invariantes.
- Definição da fronteira transacional e dos contratos de persistência necessários às políticas.

Não reabrir decisões confirmadas sobre Owner, poderes administrativos, inexistência de dados a preservar ou email inicial.

### 12.2 Bloqueiam incrementos posteriores

- Provedor e contrato de identidade: token, audiência, fonte de email verificado, renovação e logout.
- Forma física da unicidade ativa e relações empresariais antes da migration.
- Política de consumo/reenvio e eventual revogação de convites pendentes.
- Contrato de erros e exposição de existência de recursos não autorizados.
- Hosting e proteção de transporte entre gateway e API.

Logout não equivale a remoção de membership. Não foi confirmado que todo access token será invalidado imediatamente no logout; acesso empresarial depende do vínculo atual.

### 12.3 Decisões separadas

Mínimo alterado com saldo já baixo, rearme de alertas, falhas de email, retenção de auditoria, expurgo e backups pertencem a decisões próprias. Não bloqueiam os testes iniciais de tenancy.

### 12.4 Riscos sujeitos a revisão

- Isolamento lógico exige disciplina e testes em todos os caminhos.
- Tokens e informações verificadas possuem janela de atualização conforme provedor.
- Serialização conservadora reduz paralelismo por empresa.
- Indisponibilidade de banco ou impossibilidade de verificar identidade impede ações protegidas, não libera acesso.

## 13. Arquivos consultados e limitações

### 13.1 Fontes principais

- `docs/saas-inventory-mvp-analysis.md`
- `docs/architecture/overview.md`
- `docs/architecture/decisions.md`
- `docs/architecture/request-lifecycle.md`
- `docs/api/http-api.md`
- `docs/data/mysql.md`
- `docs/operations/runtime.md`
- `docs/roadmap.md`
- `docs/feat-api-hardening-finalizacao.md`
- `backend/src/app.ts`
- `backend/src/application/security/AccessTokenVerifier.ts`
- `backend/src/infra/security/JwksAccessTokenVerifier.ts`
- `backend/src/http/controllers/VerifyGatewayTokenController.ts`
- `backend/src/http/routes/products.routes.ts`
- Repositórios MySQL de produtos e movimentos em `backend/src/infra/db/mysql/repositories/`
- `deploy/nginx/default.conf.template`
- `db/init.sql`
- Trechos não sensíveis de `db/migrations/migrate.sh`
- `backend/jest.config.cjs`
- `backend/package.json`
- `backend/tests/README.md`
- Nomes de etapas e comandos seguros do workflow de CI

### 13.2 Limitações

A análise foi estática e somente de leitura. Não foram executados testes, CI, migrations, containers, aplicação ou conexões de banco. Não foram usados Git ou metadados para verificar branches, merges ou histórico.

Arquivos `.env` e variantes, credenciais, tokens concretos, chaves, certificados e fixtures sensíveis não foram inspecionados.

Configuração de cobertura, documentação de testes e código de proteção não comprovam execução bem-sucedida ou isolamento em runtime.

Este arquivo foi criado posteriormente, por solicitação explícita do proprietário, somente para registrar o rascunho. Nenhuma implementação das propostas foi realizada.

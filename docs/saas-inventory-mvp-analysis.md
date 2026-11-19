# Análise e roadmap do MVP SaaS de estoque

Data da análise: **18/11/2026**.

Este documento consolida a análise do repositório e os requisitos confirmados pelo proprietário. É um **documento de planejamento**, não uma ADR aprovada, especificação definitiva de endpoints ou evidência de implantação.

As branches mencionadas são propostas. Nenhuma existência, criação, execução de CI ou integração foi verificada por Git.

## 1. Resumo executivo

O produto é um SaaS de gestão de estoque, independente de qualquer CMS ou construtor de sites. O MVP será mobile-first, para Android e iOS, e exclusivamente online.

Segundo o proprietário:

- `feat/api-hardening` foi concluída;
- o trabalho está em `develop`, utilizada como staging;
- o CI passou após correções;
- ainda não houve integração em `main`.

Essas informações são declarações do proprietário, não verificações independentes desta análise.

O backend inspecionado oferece arquitetura em camadas, validação HTTP, paginação, estoque transacional e verificação JWT pelo gateway. Contudo, as entidades, rotas e tabelas examinadas ainda não representam o SaaS confirmado: não foram encontrados workspaces, memberships, RBAC empresarial, autoria de movimentos, aprovações, unidades fracionárias, retenção de produtos excluídos ou envio de emails.

**Próxima branch recomendada: `docs/saas-tenancy-authz-adr`.**

A recomendação anterior, limitada à escolha de OIDC, não é suficiente diante dos requisitos confirmados. Primeiro é necessário definir conjuntamente identidade pessoal, vínculo empresarial, autorização, isolamento e transição dos dados existentes.

A proposta é preservar o monólito em camadas e o MySQL. Não há justificativa identificada para introduzir microsserviços ou trocar de banco apenas para aproveitar um serviço gratuito.

## 2. Decisões de produto confirmadas

Os itens desta seção são requisitos do produto. Não significam que já estejam implementados.

### 2.1 Plataforma, escala e serviços

- Android e iOS no MVP; web poderá vir depois.
- Operação exclusivamente online, sem fila offline de comandos.
- Estimativa inicial de até dez empresas, com aproximadamente um a cinco usuários por empresa. Não são limites comerciais implementados.
- Preferência por serviços gratuitos; alternativas de baixo custo podem ser avaliadas.
- Nenhum provedor de identidade, email, hosting ou domínio foi escolhido.

### 2.2 Conta, workspace e membership

- Conta pessoal e workspace empresarial são conceitos distintos.
- Cada empresa deve ter dados isolados.
- Cada usuário pode ter somente um vínculo ativo com workspace no MVP.
- Após sair ou ser removido, pode ingressar em outro workspace.
- A saída não pode apagar a identificação histórica de quem executou ações.
- Cada empresa terá um único local de estoque.
- Múltiplos vínculos simultâneos e múltiplas lojas/depósitos são futuros, sem implementação antecipada no MVP.

### 2.3 Identidade, papéis e Owner

- Cadastro pelo aplicativo, com email e senha.
- Email verificado antes do acesso e recuperação de senha por email.
- Cadastro normal permite criar uma empresa; o criador torna-se Owner e administrador inicial.
- Aceitação de convite deve ingressar na empresa existente, sem criar outra.
- Papéis operacionais: **Administrator** e **Operator**.
- Owner é uma identificação adicional, não um terceiro papel com poderes ilimitados presumidos.
- Outros administradores não podem remover o Owner ou alterar seu papel.
- O Owner não pode sair; transferência de propriedade está fora do MVP.
- Owner e administradores podem convidar membros e alterar seus papéis, respeitando a proteção do Owner.
- Operator consulta produtos, saldo e histórico relevante; registra entradas e saídas sem aprovação prévia; propõe criação e edição de produtos.
- Permissões não explicitadas permanecem pendentes, não devem ser inferidas.

### 2.4 Convites

- Convite individual por email, com papel definido por quem tem permissão.
- Link com validade de 72 horas.
- Administrador pode reenviar.
- Convidado pode criar conta ou entrar em uma existente.
- Email verificado é obrigatório.
- Usuário já vinculado a outra empresa precisa sair antes de ingressar.
- Consumo, reenvio e integração com identidade ainda exigem desenho técnico.

### 2.5 Produtos e unidades

- Usar os campos atuais como baseline.
- Unidades: `un`, `kg` e `L`.
- `un` aceita somente quantidades inteiras.
- `kg` e `L` aceitam até duas casas decimais.
- Preço corresponde à unidade selecionada.
- Unidade não pode mudar depois que o produto tiver movimentos.
- Conversão automática de unidades está fora do MVP.
- Não acrescentar SKU, lote, validade ou outros campos sem confirmação.
- `barCode` já existe como campo opcional no contrato inspecionado.

### 2.6 Aprovação

- Criação e edição administrativas têm efeito imediato e devem ser registradas.
- Criação proposta por Operator fica pendente e não pode receber movimentos.
- Edição proposta mantém o produto vigente com seus dados aprovados.
- Administrador aprova ou rejeita; rejeição exige motivo.
- Rejeição e motivo permanecem no histórico.
- Correção e reenvio criam nova tentativa, preservando as anteriores.
- Só pode existir uma edição pendente por produto.
- Enquanto houver edição pendente, administrador não edita diretamente: deve aprovar ou rejeitar antes.

### 2.7 Movimentos e auditoria

- Administrator e Operator registram entradas e saídas.
- Cada movimento concluído precisa identificar o responsável.
- Saída insuficiente é recusada e não pode deixar saldo negativo.
- Criação, edição, decisões de aprovação e ações administrativas relevantes precisam de registros apropriados.
- Histórico de movimentos e auditoria devem ser separados quando representarem fatos diferentes.

### 2.8 Desativação e exclusão

- Administrador pode desativar e reativar produtos.
- Produto desativado não recebe novos movimentos.
- Exclusão é irreversível para o usuário.
- Owner e administradores podem consultar o produto excluído e seus movimentos durante 60 dias após a exclusão do produto.
- Depois disso, produto e movimentos associados devem ser permanentemente removidos.
- Retenção de auditoria, propostas, cópias e backups ainda precisa de política explícita.

### 2.9 Alertas

**Destinatário empresarial**

- Empresa deve configurar um email de alertas.
- Ao trocar o endereço, o anterior permanece ativo até confirmação do novo.

**Abaixo do mínimo**

- Mínimo é opcional; alerta de baixo estoque pode ser ligado ou desligado por produto.
- Quando configurado e habilitado, alertar ao saldo ficar abaixo do mínimo.
- Não repetir enquanto continuar abaixo.
- Ao voltar ao mínimo ou acima e posteriormente cair abaixo, gerar novo alerta.

**Zero**

- Alertar mesmo sem mínimo.
- Desligar baixo estoque não desliga zero.
- Se o mesmo movimento cruzar o mínimo e chegar a zero, enviar somente o alerta de zero.

**Saída acima do saldo**

- Recusar e manter o saldo.
- Enviar email para cada tentativa.
- Não persistir a recusa como histórico da aplicação.
- Não criar fila persistente de retry para essas recusas sem nova decisão.
- Falha do email não muda a recusa; o email pode ser perdido.

**Decisão aberta:** ao criar ou mudar um mínimo quando o saldo já está abaixo, enviar imediatamente ou aguardar movimentação.

### 2.10 Fora do MVP

Web, Google login, múltiplos workspaces simultâneos, múltiplos locais de estoque, transferência de propriedade, conversão automática de unidades e operação offline.

## 3. Situação atual por área

Classificações:

- **Verificado no código inspecionado:** estrutura ou comportamento diretamente identificados nas fontes.
- **Documentado, não verificado:** afirmação documental sem validação independente.
- **Parcialmente implementado:** parte do requisito existe.
- **Não encontrado no material inspecionado:** ausência no escopo examinado, não prova universal.
- **Indeterminado:** evidência insuficiente.

Confiança alta nesta tabela refere-se à inspeção estática, não ao funcionamento em produção.

| Área | Estado identificado | Evidência | Confiança |
| --- | --- | --- | --- |
| Produto | Documentação de estoque parcialmente alinhada; requisitos SaaS ainda não aparecem completos. | `docs/roadmap.md:3–20`; `docs/domain/inventory.md` | Alta |
| Backend | Camadas e casos de uso de produtos/estoque verificados; fluxos SaaS não encontrados no escopo. | `docs/architecture/overview.md:3–20`; `backend/src/application/use-cases/` | Alta |
| API | Seis rotas de negócio, validação estrita, paginação e erros padronizados. | `backend/src/http/routes/products.routes.ts:70–98`; `docs/api/http-api.md:14–32` | Alta |
| Banco | Produtos, movimentos e versões de migração; quantidades `INT`; sem workspace, unidade ou autor nas tabelas examinadas. | `db/init.sql:1–40` | Alta |
| Identidade | JWT/JWKS parcialmente implementado; cadastro, verificação e recuperação não integrados no material examinado. | `backend/src/infra/security/JwksAccessTokenVerifier.ts:16–38`; `docs/roadmap.md:9–11` | Alta |
| Segurança | Gateway valida token e escopos; API não recebe identidade verificada nem consulta membership/RBAC. | `backend/src/app.ts:42–54`; `deploy/nginx/default.conf.template:11–40` | Alta |
| Frontend | Não encontrado nos diretórios e manifestos examinados; Expo é plano documental. | `package.json`; `backend/package.json`; `docs/roadmap.md:7` | Alta no escopo |
| Testes | Suítes unitárias/HTTP e script de integração MySQL presentes; cenários SaaS não encontrados. | `backend/tests/`; `backend/tests/integration/mysql-stock.ts` | Alta sobre presença |
| CI | Configuração presente; aprovação informada pelo proprietário, sem verificação independente. | `.github/workflows/backend-ci.yml:3–29` e nomes das etapas | Alta sobre configuração |
| Email | Integração, destinatário confirmado e processamento de alertas não encontrados. | `docs/operations/runtime.md`; `docs/roadmap.md:15–16`; casos de uso examinados | Média/alta |
| Operação | Docker, gateway, saúde e shutdown parcialmente preparados; hosting, jobs e backups indefinidos. | `backend/Dockerfile`; `docs/operations/runtime.md`; `backend/src/server.ts` | Alta sobre arquivos; ambiente indeterminado |

### 3.1 Contrato baseline verificado

Base pública: `/api`.

| Método e rota | Comportamento atual |
| --- | --- |
| `GET /products` | Lista paginada com `data` e `pagination`. |
| `POST /products` | Criação direta; saldo inicial zero. |
| `GET /products/:id` | Produto, movimentos e paginação do histórico. |
| `POST /products/:id/stock/entry` | Entrada; resposta `201 {ok:true}`. |
| `POST /products/:id/stock/exit` | Saída; insuficiência ou overflow retorna conflito. |
| `GET /products/:id/movements` | Histórico paginado. |

Produto contém `id`, `name`, `price`, `category`, `quantity`, `imageUrl?` e `barCode?`. A listagem não inclui `barCode`.

Preço usa centavos inteiros no domínio e `DECIMAL(10,2)` no MySQL. Quantidade atual é inteira, até o limite de `INT` assinado. Erros usam `{code,message,requestId}`.

Não foram encontradas rotas atuais de edição, exclusão, convites ou aprovação.

### 3.2 Cobertura Jest: verificação da aparente divergência

- `backend/jest.config.cjs:26–32` configura geração/coleta de cobertura.
- Não há `coverageThreshold` nesse arquivo.
- `backend/package.json:13–14` não acrescenta threshold pela linha de comando.
- Nos documentos examinados, a referência de 93,20% é uma medição histórica, não um gate configurado.

Assim, a alegada divergência não foi confirmada: gerar cobertura não equivale a bloquear regressão por percentual. A revisão anterior sobre ausência de threshold é compatível com a configuração atual.

Não escolher arbitrariamente um percentual. O líder técnico deve definir o gate, priorizando testes críticos de isolamento, autorização e integridade.

## 4. Lacunas para o MVP

| Requisito | Situação atual | Lacuna | Impacto | Pré-requisitos |
| --- | --- | --- | --- | --- |
| P0 — Isolamento empresarial | Produtos e movimentos globais. | Contexto obrigatório, consultas escopadas e relações consistentes. | Domínio, API, banco, segurança e testes. | ADR de tenancy e decisão sobre dados existentes. |
| P0 — Identidade confiável | Token validado no gateway; sujeito não chega à API. | Principal verificável e comprovação de email verificado. | Gateway e autenticação. | Fronteira de confiança e provedor. |
| P0 — Membership/RBAC/Owner | Somente escopos globais. | Vínculo ativo, papéis por empresa e proteção do Owner. | Banco, autorização e transações. | Matriz de ações e permissões pendentes. |
| P0 — Evolução do banco | Executor conhece somente `001`. | Próximas versões, exclusão mútua e recuperação. | Migrações, CI e operação. | Estado dos volumes e preservação. |
| P1 — Onboarding e convites | Não encontrados. | Fluxos distintos, 72 horas, consumo concorrente e verificação. | Identidade, email, API e mobile. | Membership e política de reenvio. |
| P1 — Unidades | Quantidades inteiras. | Unidade, precisão exata, limites e migração. | Entidades, SQL, mappers, API e testes. | Representação e tratamento do legado. |
| P1 — Autoria/auditoria | Movimento sem usuário. | Responsável e registros administrativos. | Domínio, banco e autorização. | Principal confiável e retenção. |
| P1 — Aprovações | Criação direta; edição não encontrada. | Propostas, decisões, motivos e unicidade de pendência. | Backend, banco, API e mobile. | RBAC e invariantes transacionais. |
| P1 — Ciclo de vida | Não encontrado. | Inativação, exclusão lógica, janela e expurgo. | Banco, autorização, jobs e backups. | Permissão de exclusão e retenção das referências. |
| P1 — Alertas | Menção futura no roadmap. | Destinatário, transições, precedência e tratamento de recusas. | Estoque, email e operação. | Regras abertas de disparo/entrega. |
| P1 — Mobile | Não encontrado. | Jornadas do MVP. | Cliente e integração. | Contratos disponíveis por incremento. |
| Transversal — Repetição | Cada POST cria outro movimento. | Política de resultado desconhecido e eventual idempotência. | API, banco, alertas e cliente. | Separar conclusão de recusa. |

### 4.1 Migrações merecem validação própria

O `init.sql` registra `001_harden_inventory` como aplicada em banco novo (`db/init.sql:38–40`). O runner a ignora quando encontra essa versão (`db/migrations/migrate.sh:31–45`).

Portanto, testar a aplicação contra um banco novo não comprova a execução da migração legada.

A `001` declara DDL não transacional e execução única. Ela altera dados antes de alguns DDLs e pressupõe nomes de objetos antigos. Isso representa risco de aplicação parcial em volumes incompatíveis, não uma falha observada em execução.

Novas migrações precisam de política de versionamento, concorrência e recuperação. Não reescrever uma migração possivelmente aplicada sem conhecer seu estado.

## 5. Segurança e isolamento entre clientes

### 5.1 Autenticação versus autorização

O verificador atual reconhece assinatura, emissor, audiência, expiração, sujeito e escopos. O principal retornado contém apenas `subject` e `scopes` (`backend/src/application/security/AccessTokenVerifier.ts:1–8`).

Isso não prova vínculo ativo, papel atual, propriedade empresarial do produto ou autorização da ação.

**Proposta:** conta pessoal global ligada à identidade externa e memberships separados. Papel e acesso empresarial devem ser resolvidos no servidor. Remover alguém não apaga sua conta ou autoria histórica.

Para a escala inicial, consultar membership no banco por requisição é uma alternativa simples. Papel em JWT não deve ser a única autoridade, pois pode ficar desatualizado.

### 5.2 Identidade no gateway/API

O template atual envia o bearer ao verificador interno, mas limpa `Authorization` antes de encaminhar a chamada de negócio. Não propaga sujeito ou workspace (`deploy/nginx/default.conf.template:33–40`).

| Alternativa proposta | Benefício | Cuidado |
| --- | --- | --- |
| API valida token encaminhado | Autoriza perto dos casos de uso. | Adaptar gateway e evitar validações divergentes. |
| Gateway envia contexto autenticado | Centraliza autenticação. | Headers comuns exigem origem autenticada e remoção dos valores fornecidos pelo cliente. |
| Asserção interna assinada | Explicita confiança entre componentes. | Acrescenta emissão, chaves e rotação. |

Preferência técnica proposta: API autoritativa para membership/RBAC, com identidade verificável. A escolha exata pertence à ADR.

Também é necessário revisar o mapeamento atual de escopo por método. Onboarding e novos métodos de edição não podem depender apenas de “todo POST exige escrita de inventário”.

### 5.3 Isolamento de dados

Salvaguardas propostas:

- contexto de workspace obrigatório nas portas de repositório empresariais;
- filtros em toda leitura, paginação, histórico e bloqueio de escrita;
- workspace derivado do vínculo autorizado, não de campo livre enviado pelo cliente;
- FKs compostas quando apropriado;
- índices compatíveis com o escopo;
- acesso de conta sem vínculo limitado a onboarding/convite.

FK composta não substitui filtro de leitura. UUID difícil de adivinhar também não substitui autorização.

### 5.4 Unicidade, Owner e concorrência

MySQL não oferece índices parciais como PostgreSQL. Avaliar coluna gerada com unicidade ou tabela específica de vínculos/pendências atuais.

A restrição de um vínculo ativo garante o MVP e pode ser alterada futuramente; não exige construir múltiplos workspaces agora.

Proteger Owner e revalidar papel/membership nas operações concorrentes. A ADR deve definir o ponto de autorização de uma requisição em andamento, sem prometer revogação instantânea sem semântica definida.

### 5.5 Testes negativos obrigatórios

- Usuário de A lista, detalha ou movimenta produto de B.
- Movimento ou proposta de B é referenciado em ação de A.
- Usuário removido reaproveita token válido.
- Cliente forja identidade, papel ou workspace.
- Dois convites são aceitos simultaneamente para empresas diferentes.
- Administrador tenta remover ou alterar Owner.
- Operator chama aprovação diretamente.
- Mudança de papel/remoção concorre com escrita.

Status HTTP e exposição de existência devem ser definidos no contrato; não são regras de produto já aprovadas.

## 6. Fluxos principais do MVP

### 6.1 Cadastro e workspace

Fluxo proposto: cadastro, verificação de email, conclusão do onboarding e criação transacional do workspace com vínculo inicial do Owner.

Convite preserva outra intenção: criar/autenticar conta e ingressar na empresa existente. Não criar empresa automaticamente em todo evento de criação de usuário do provedor.

Cadastro no app é compatível com identidade gerenciada; não exige guardar senhas no backend.

### 6.2 Convites

Registrar email/papel autorizados; enviar link; na aceitação, validar identidade, email confirmado, expiração e membership. Consumo e criação do vínculo devem ser atômicos.

Como proposta de segurança, persistir somente representação não reutilizável do segredo do convite. Rotação e invalidação no reenvio precisam de decisão explícita.

### 6.3 Quantidades e preço

| Opção | Vantagem | Impacto |
| --- | --- | --- |
| Inteiro escalado em centésimos da unidade | Soma e comparação exatas; semelhante ao preço em centavos. | Escala explícita, limites e conversão; não reinterpretar inteiros antigos silenciosamente. |
| `DECIMAL(p,2)` | Exatidão no MySQL. | Driver atual retorna DECIMAL como string; alterar entidades/mappers junto com schema. |
| Ponto flutuante autoritativo | Pouca mudança aparente. | Não recomendado para comparação exata de saldo. |

O código atual exige `SafeInteger`; trocar só a coluna não resolve (`Product.ts:86–94`; `StockMovement.ts:22–29`; `connection.ts:13`).

A decisão deve avaliar limites, representação JSON e roundtrip. Rejeitar precisão excedente em vez de arredondar silenciosamente comandos. Não definir arbitrariamente precisão SQL que reduza o limite atual.

Preço já usa centavos. Valor total e arredondamento monetário de totais não foram solicitados. Moeda continua pendente.

### 6.4 Aprovações

- Propostas separadas do produto vigente.
- Criação pendente não é produto movimentável.
- Edição pendente mantém dados aprovados.
- Registrar autor, revisor, resultado, motivo e tentativa.
- Nova tentativa não sobrescreve rejeição.
- Submissão, decisão e edição direta compartilham controle de concorrência.
- Revalidar unidade na aprovação: um movimento ocorrido depois da submissão pode impedir a mudança proposta.
- Aprovação de produto não cria movimento artificial de estoque.

### 6.5 Movimentos e auditoria

Preservar transação existente: bloquear produto, validar saldo, atualizar quantidade e inserir movimento na mesma conexão.

Acrescentar tenant, autor, papel, estado do produto e precisão por unidade.

Movimentos representam alterações reais de saldo. Auditoria representa criação/edição, decisões e ações administrativas. Não usar movimentos de quantidade zero para representar decisões.

Usuário removido deve continuar identificável nos registros que ainda forem retidos. A representação histórica mínima precisa de política, sem copiar dados pessoais desnecessários.

### 6.6 Alertas e entrega

**Movimentos concluídos:** calcular transições com o mesmo controle concorrente do saldo. Se cruzar mínimo e alcançar zero, gerar somente o evento de zero.

Outbox MySQL é alternativa proposta para entrega recuperável desses eventos, não requisito aprovado. Precisa de publicador, limpeza e política de falhas. Não garante sozinha entrega exatamente uma vez: falha após aceite pelo provedor pode causar repetição.

**Saída insuficiente:**

- não alterar saldo nem histórico de movimentos;
- tentar email a cada tentativa autorizada;
- falha mantém recusa;
- não gravar recusa em auditoria de negócio, outbox ou fila persistente;
- não transformar tabela genérica de idempotência ou logs detalhados em histórico indireto dessas recusas.

Pontos em aberto: requests repetidos, mínimo alterado já abaixo, zero inicial/rearme, entrega de alertas de movimentos concluídos, destinatário de mensagens em processamento durante troca de email e efeitos dos limites do provedor.

Email precisa identificar produto e evento. Empresa, unidade, saldo e mínimo podem ajudar conforme necessidade aprovada. Não incluir identificação pessoal do operador por padrão.

### 6.7 Desativação, exclusão e expurgo

- Inativo preserva histórico e bloqueia movimentos.
- Exclusão lógica é irreversível para o usuário.
- Consulta por Owner/Administrator somente na janela de 60 dias após exclusão do produto.
- Expurgo físico remove produto e movimentos.

O cascade atual pode ser utilizado no expurgo, não na exclusão inicial. Não precisa ser removido apenas por existir retenção.

Propostas, auditoria e outbox podem conter cópias indiretas. Não conservar snapshots do produto sem política compatível com a exclusão.

Backup, email enviado e logs externos não desaparecem quando o banco primário é apagado. Definir retenção, restauração e prevenção de reintrodução de dados expirados. Frequência do job e atraso máximo de expurgo também precisam ser compatíveis com a regra de 60 dias.

## 7. Serviços e critérios de escolha

Documentação pública oficial consultada em **18/11/2026**. Condições podem mudar e devem ser reconfirmadas. Nenhuma conta foi criada ou serviço privado acessado.

| Candidato/categoria | Evidência oficial | Consequência |
| --- | --- | --- |
| Auth0 | Guia React Native para Android/iOS; pricing Free apresenta 25 mil MAUs e cinco Organizations. | Dez empresas não caberiam em cinco Organizations se cada workspace depender desse recurso. Avaliar autenticação com membership/RBAC na aplicação. |
| Firebase Authentication | Email/senha, recuperação e SDKs Android/iOS; quotas específicas de emails. | Avaliar contrato de tokens e email verificado; não presumir compatibilidade direta com escopos atuais. |
| Supabase Auth | SMTP padrão voltado a testes, limitado à equipe do projeto e com dois emails/hora informados. | Não usar como solução presumida para clientes. Não justifica migrar estoque MySQL para PostgreSQL. |
| Resend | Free informa 3 mil emails/mês e 100/dia; envio normal exige domínio próprio verificado. | Domínio é dependência; tentativas insuficientes podem consumir quota. Número de usuários não determina volume de emails. |
| Render Free | Documentação desaconselha produção; há suspensão por inatividade, bloqueios de portas SMTP e limitações de persistência. PostgreSQL gratuito expira em 30 dias. | Não comprova hosting gratuito adequado para MySQL e jobs. Avaliar API HTTPS de email e execução agendada caso usado em testes. |

Critérios:

- **Identidade:** Android/iOS, email/senha, verificação, recuperação, sessão, claims, backend próprio, exportação e limites.
- **Email:** destinatários externos, domínio/remetente, quotas, picos, API/SMTP, deduplicação, falhas e retenção.
- **Hosting/MySQL:** versão, persistência, rede/TLS, conexões, backup/restauração e jobs.
- **Custo:** grátis permanente versus crédito temporário, cartão, excedentes, suspensão e uso comercial.
- **Domínio:** URL HTTPS de hosting não resolve automaticamente domínio de envio ou requisitos de links mobile.

Não foi selecionado fornecedor nem confirmado plano gratuito MySQL adequado ao conjunto. Se necessário, comparar opções de baixo custo sem trocar arquitetura apenas pela gratuidade.

Fontes:

- [Auth0 React Native](https://auth0.com/docs/quickstart/native/react-native)
- [Auth0 pricing](https://auth0.com/pricing)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Firebase Authentication limits](https://firebase.google.com/docs/auth/limits)
- [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend pricing](https://resend.com/pricing)
- [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction)
- [Render Free](https://render.com/docs/free)

## 8. Roadmap de branches

Ordem por dependências, não por prazo. A coluna de objetivo inclui aceite resumido; testes são propostos, não executados.

| Prioridade | Branch sugerida | Objetivo | Dependências | Complexidade |
| --- | --- | --- | --- | --- |
| 1 | `docs/saas-tenancy-authz-adr` | Definir conta, workspace, membership e confiança; revisar matriz de cenários. | Proprietário e líder técnico. | Média: decisões transversais. |
| 2 | `docs/mvp-services-decision` | Comparar serviços e domínio com condições oficiais; registrar escolha aprovada. | Critérios da 1. | Média: compatibilidade e limites. |
| 3 | `chore/versioned-migration-runner` | Suportar próximas versões; testar banco novo, upgrade, concorrência e recuperação. | Política para volumes atuais. | Média: DDL não é atomicamente reversível. |
| 4 | `feat/api-verified-principal` | Identidade verificável e email confirmado; negar identidade forjada/não verificada. | 1–2. | Média: gateway e adaptador. |
| 5 | `feat/workspace-owner-membership` | Criar empresa/vínculo inicial; testar unicidade ativa e bootstrap concorrente. | 3–4; tratamento do legado. | Alta: invariantes relacionais. |
| 6 | `feat/tenant-inventory-rbac` | Escopar rotas/repositórios e aplicar papéis; testes A→B por operação. | 5; matriz de permissões. | Alta: todos os caminhos. |
| 7 | `feat/audit-and-movement-authorship` | Autoria e fatos administrativos; saída não apaga identificação. | 4–6; referências históricas. | Média: domínio/persistência. |
| 8 | `feat/member-lifecycle` | Papéis, saída/remoção permitidas; testar Owner e concorrência. | 5–7; permissões restantes. | Média: revogação/proteção. |
| 9 | `feat/transactional-email-adapter` | Porta e integração de envio; testar sucesso, timeout e falha. | 2; remetente viável. | Média: serviço externo. |
| 10 | `feat/workspace-invitations` | Convites 72h; testar divergência de email, consumo, expiração e vínculo concorrente. | 5–9; reenvio. | Alta: identidade/transação. |
| 11 | `feat/inventory-measurement-units` | Precisão, roundtrip, limites e imutabilidade; testar migração. | 3, 6–7; representação/legado. | Alta: domínio/SQL/contrato. |
| 12, condicional | `feat/stock-success-idempotency` | Deduplicar comandos concluídos; testar replay e concorrência sem persistir recusas. | 6–11; política aprovada. | Alta: resposta repetível. |
| 13 | `feat/mobile-account-workspace` | Sessão, verificação, recuperação e onboarding normal/convidado. | 4–10; escolha técnica mobile. | Média: fluxos/links. |
| 14 | `feat/mobile-inventory-read` | Lista/detalhe/histórico; testar paginação, unidade, acesso removido e rede. | 6, 11, 13. | Média: integração. |
| 15 | `feat/admin-product-edits` | Edição imediata/auditada sem alterar saldo; incremento mobile correspondente. | 6–7, 11, 14. | Média: novas operações. |
| 16 | `feat/product-proposal-submission` | Tentativas separadas, criação não movimentável e edição pendente única; bloquear edição direta. | 6–7, 11, 15. | Média: estado/unicidade. |
| 17 | `feat/product-proposal-decisions` | Aprovar/rejeitar; testar motivo, reenvio, dupla decisão e versão concorrente. | 16. | Alta: aplicação atômica. |
| 18 | `feat/product-deactivation` | Desativar/reativar; testar bloqueio de movimentos concorrentes. | 6–7; estados compatíveis. | Média: ciclo de vida. |
| 19 | `feat/product-deletion-window` | Exclusão irreversível e consulta restrita por 60 dias; testar acesso/data. | 18; permissão/interação com propostas. | Média: autorização temporal. |
| 20 | `chore/product-retention-purge` | Expurgo idempotente e restauração; testar referências e repetição/atraso do job. | 19; retenção aprovada. | Alta: perda definitiva. |
| 21 | `feat/workspace-alert-recipient` | Configuração/confirmação; anterior ativo até confirmar novo. | 5–9; permissão/confirmação. | Média: estados/email. |
| 22 | `feat/stock-threshold-alerts` | Mínimo/zero; testar concorrência, precedência, rearme e entrega. | 7, 11, 21; decisões abertas. | Alta: estado/entrega. |
| 23 | `feat/refused-exit-email` | Email por tentativa sem histórico/fila; falha mantém recusa/saldo. | 9, 21; repetição. | Média: melhor esforço. |
| 24 | `feat/mobile-stock-commands` | Comandos online, precisão, conflitos e resultado desconhecido. | Estoque autorizado, 11 e política da 12. | Média: comandos sensíveis. |
| 25 | `chore/staging-release-readiness` | Validar integração, migrações, isolamento, emails, jobs e restauração. | Incrementos necessários ao MVP. | Média: operação. |

Regras de entrega:

- Branches 4–7 são fundação integrada: não liberar empresas reais com caminhos globais ou autorização incompleta.
- Submissão de propostas não é fluxo completo antes das decisões.
- Cada feature recebe testes próprios; a última branch não concentra toda a verificação.
- Componentes intermediários podem permanecer indisponíveis ao usuário até completar sua jornada.
- Documentação de onboarding pode ser corrigida em paralelo.
- Não há merge ou deploy automático implícito em `main`.
- Não adotar percentual arbitrário de cobertura como substituto dos cenários críticos.

## 9. Próxima branch recomendada

### `docs/saas-tenancy-authz-adr`

**Objetivo:** aprovar uma arquitetura mínima que não confunda identidade pessoal, vínculo empresarial e permissão.

Somente integrar login deixaria consultas globais, papel sem tenant, identidade indisponível na API e onboarding ambíguo.

### Escopo

- Matriz implementado versus confirmado.
- Conceitos distintos de conta, workspace e membership.
- Fonte de verdade de papel, vínculo e identificação histórica.
- Confiança gateway/API e isolamento de repositórios/relações.
- Unicidade do vínculo ativo e proteção do Owner.
- Separação de criação de empresa e aceitação de convite.
- Tratamento dos dados existentes.
- Gates para as próximas branches.

### Exclusões

Código, migrations, schema definitivo, fornecedores contratados, contas externas, telas, nomes finais de endpoints, política inventada de backup e encerramento de workspace não solicitado.

### Pré-requisitos

Revisão pelo líder técnico e confirmação sobre dados a preservar e permissões restantes. A escolha final de fornecedor pode continuar na branch seguinte.

### Critérios de aceite

- Requisitos futuros não apresentados como implementados.
- Workspace e autor não fornecidos livremente pelo cliente.
- Vínculo ativo único com estratégia concorrente definida.
- Remoção impede novas operações autorizadas e preserva autoria.
- Owner sem poderes adicionais inventados.
- Conta sem membership limitada aos fluxos necessários.
- Nenhum dado legado recebe empresa, unidade ou autor fictícios sem decisão.
- Pendências com responsável e branch bloqueada identificados.

### Validação

Branch documental: revisão por cenários, sem execução necessária nesta análise.

1. Cadastro normal cria workspace; convite ingressa no existente.
2. Usuário de A tenta produto de B.
3. Membro removido reutiliza token.
4. Dois convites são aceitos simultaneamente.
5. Administrador tenta alterar Owner.
6. Operator movimenta estoque, mas não aprova produto.
7. Escrita concorre com remoção/mudança de papel.

Esses cenários devem virar testes automatizados nas branches de implementação.

## 10. Pendências para decisão do proprietário

1. **Dados:** existe volume a preservar? A qual empresa e identidade histórica pertence? É permitido reiniciar somente ambientes descartáveis?
2. **Permissões:** quem exclui produtos, remove membros, consulta auditoria e altera configurações de alertas? Owner pode alterar o próprio papel?
3. **Serviços/domínio:** qual faixa de custo pode ser avaliada se gratuidade não atender? É possível adquirir domínio?
4. **Onboarding:** quando o email empresarial de alertas precisa estar confirmado para liberar uso? Pode aproveitar a verificação pessoal do Owner ou exige confirmação própria?
5. **Retenção:** o que permanece em propostas/auditoria após 60 dias? Como tratar snapshots, backups, restauração e provedores externos?
6. **Alertas:** mínimo novo/alterado já abaixo gera email imediato ou aguarda movimento? Como tratar zero inicial/rearme, falhas dos alertas concluídos e requests repetidos?

As regras de alertas não precisam bloquear a ADR inicial de tenancy, mas devem bloquear a implementação correspondente até serem resolvidas.

Moeda e limites quantitativos também precisam ser definidos antes dos respectivos contratos; a representação técnica deve ser avaliada pelo líder técnico, não escolhida sem comparação.

## 11. Evidências e limitações

### 11.1 Arquivos consultados

- Documentação: `README.md`, `docs/README.md`, `docs/roadmap.md`, `docs/domain/inventory.md`, `docs/api/http-api.md`, `docs/data/mysql.md`, `docs/operations/runtime.md`, `docs/architecture/{overview,decisions,request-lifecycle}.md`, `docs/feat-api-hardening-finalizacao.md`.
- Domínio/aplicação: entidades `Product` e `StockMovement`, portas de repositório, casos de uso de produtos/estoque, paginação e `application/security/AccessTokenVerifier.ts`.
- HTTP/segurança: `app.ts`, `server.ts`, rotas/schemas/controllers de produtos, middlewares pertinentes, `JwksAccessTokenVerifier.ts`, `VerifyGatewayTokenController.ts` e validações não sensíveis de configuração.
- Persistência: `db/init.sql`, `db/migrations/001_harden_inventory.sql`, seção não sensível de `migrate.sh`, repositórios/mappers e configuração de conversão DECIMAL.
- Testes/operação: manifestos, `backend/jest.config.cjs`, `backend/tests/README.md`, cenários selecionados de testes, Dockerfile, estrutura não sensível de Compose, template Nginx e trechos seguros do workflow.
- Mapas locais foram usados como orientação, não como prova substituta do código.
- Fontes públicas oficiais da seção 7.

### 11.2 Conciliação das frentes

- `develop` é a staging declarada; não foi pressuposta uma branch adicional chamada `staging`.
- Cadastro pelo aplicativo não exige identidade própria.
- DECIMAL é alternativa futura; incompatibilidade surgiria de mudança incompleta, não é defeito do schema inteiro atual.
- Cascade pode ser usado no expurgo após exclusão lógica.
- Os 60 dias contam da exclusão do produto, não do usuário.
- Gratuidade não autoriza retirar emails obrigatórios.
- Estimativas de empresas/usuários não são quotas de plano.
- Uma aprovação de produto não representa movimentação de saldo.

### 11.3 Documentação potencialmente antiga

- README anuncia `/uploads` e exemplos anteriores de erros/integração.
- Guia de testes descreve fase sem casos implementados.
- Documento de finalização de 20/10/2026 conserva pendências históricas.

Esses registros não anulam o relato do proprietário sobre conclusão e CI aprovado.

### 11.4 Limites da análise

A análise foi somente de leitura. Não foram executados Git, aplicação, testes, migrations, containers ou conexões de banco. Não foram verificadas branches, CI executado, implantação, conteúdo de dados ou garantias em runtime.

Arquivos `.env` e variantes, valores de credenciais, tokens, chaves, certificados e fixtures sensíveis ficaram excluídos. Trechos potencialmente sensíveis de CI/configuração não fundamentam as conclusões.

A criação deste documento ocorreu posteriormente, por solicitação explícita de documentação. Não representa implementação das propostas.

As salvaguardas propostas precisam ser aprovadas, implementadas e testadas antes de atender empresas reais.

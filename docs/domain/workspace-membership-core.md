# Core de contas, workspaces e memberships

Este incremento implementa regras de domínio e aplicação, sem exposição HTTP,
persistência ou integração de identidade. A direção técnica é a
[ADR de tenancy e autorização](../adr-saas-tenancy-authz.md), que permanece
**Proposed — awaiting review**.

## Conceitos

- `PersonalAccount`: identidade interna estável da pessoa e email de contato.
  Não armazena senha, sessão ou prova de verificação do email.
- `Workspace`: empresa identificada separadamente, com Owner e email de alertas
  obrigatório.
- `Membership`: vínculo entre conta e workspace, com papel `ADMINISTRATOR` ou
  `OPERATOR`, estado `ACTIVE` ou `ENDED` e identificação de Owner derivada do
  workspace.

Owner não é um terceiro papel nem um campo livre de entrada. Seu vínculo deve
ser ativo e administrativo. Não existem operações para transferir propriedade,
encerrar o vínculo do Owner ou alterar seu papel.

As transições de membership retornam novas instâncias, preservando os
identificadores. Encerrar vínculo não exclui a conta nem reatribui ações a outra
pessoa. O core distingue vínculos encerrados e ativos, mas não implementa
armazenamento de histórico ou política de retenção.

As três entidades são congeladas em runtime, além das declarações `readonly`.
Isso impede que referências retornadas pelos repositórios sejam alteradas
diretamente para trocar papel, estado, identidade ou Owner sem uma transição.

## Fronteira de confiança

`TrustedAccountContext` representa uma entrada **interna** cuja conta já deve
ter sido autenticada e cujo email já deve ter sido verificado por uma futura
integração de identidade.

Esse contrato não realiza autenticação nem verificação de email. Criar uma
instância de `PersonalAccount` ou fornecer um objeto com formato correto não
prova identidade. Não existe booleano recebido do cliente que transforme um
endereço em verificado.

Uma futura borda HTTP deverá construir esse contexto a partir de informação
confiável, nunca copiar o body da requisição. O gateway e o verificador JWT
atuais não foram alterados para isso.

Papel e workspace do ator não vêm desse contexto ou de campos livres do
comando. Os casos de uso consultam o vínculo ativo pelo identificador da conta,
carregam o workspace correspondente e verificam a consistência dos resultados.
Cada autorização consulta novamente o vínculo e seu papel atual.

Identificadores e email necessários são capturados antes das esperas
assíncronas. Substituir a conta no objeto de contexto durante uma consulta não
troca a identidade já selecionada para aquela operação. A distinção entre
saída própria e remoção usa a membership do ator já resolvida, não uma releitura
do contexto recebido. Essa proteção de memória não substitui revalidação
transacional no banco.

Negativas da política são traduzidas na aplicação para `AppError` com
`FORBIDDEN`; invariantes das entidades continuam usando `DomainError`.
Isso não define um contrato HTTP para as funcionalidades novas.

## Casos de uso

| Caso de uso | Responsabilidade |
| --- | --- |
| `BootstrapWorkspaceUseCase` | Verificar ausência de vínculo ativo e produzir workspace com Owner Administrator ativo e email inicial da conta confiável. |
| `AddWorkspaceMemberUseCase` | Ativar membro comum sob autorização administrativa, no workspace resolvido do ator e com papel operacional válido. |
| `ChangeMemberRoleUseCase` | Alterar papel de membro ativo do mesmo workspace, respeitando a proteção do Owner. |
| `EndMembershipUseCase` | Encerrar o próprio vínculo elegível ou remover membro sob autorização administrativa, sem excluir conta. |
| `AuthorizeWorkspaceActionUseCase` | Resolver o acesso atual e verificar uma capacidade confirmada, sem executar o fluxo associado. |

`AddWorkspaceMemberUseCase` é uma capacidade interna do core, não um endpoint
para ingressar livremente em uma empresa. O membro também é recebido em
contexto confiável. Este caso de uso não cria convites, não verifica links,
não comprova aceite e não implementa o processo público de ingresso.

Uma futura implementação de convites terá de validar destinatário, email,
prazo e consumo, aplicando a ativação dentro da transação apropriada. Não se
deve expor este caso de uso diretamente como atalho para esse processo.

## Autorizações representadas

- Ambos os papéis: consultar inventário, registrar entradas e saídas.
- Operator: propor criação e edição de produtos.
- Administrator: criação/edição direta, aprovação, convite, remoção e alteração
  de papéis, desativação/exclusão de produtos e gestão do email empresarial.
- Saída: apenas do próprio vínculo e nunca do Owner.
- Vínculo encerrado ou incompatível com o contexto: sem autorização.

As políticas representam capacidades, não implementam produtos, aprovações,
estoque, convites, desativação, exclusão ou troca de email.

Permissões não confirmadas, como submeter uma proposta pelo fluxo de Operator
quando se é Administrator, não são concedidas por inferência. A política nega
ações não autorizadas, mas isso não substitui uma futura decisão de produto
sobre fluxos ainda não definidos.

## Portas e garantias futuras

As portas necessárias são `MembershipRepository` e `WorkspaceRepository`.
Não há adapter de banco ou repositório de contas neste incremento.

O precheck de vínculo ativo é global por conta. Permite rejeitar uma segunda
ativação em execução sequencial e permite ingresso após encerramento anterior.
**Ele não garante unicidade diante de chamadas concorrentes.**

O próximo incremento de persistência deve:

1. Impor no MySQL no máximo um vínculo ativo por pessoa.
2. Persistir workspace e Owner de forma atômica, conforme o contrato
   `saveWithOwner`.
3. Revalidar membership, papel e proteção do Owner na transação do efeito.
4. Impedir referências cruzadas de workspace.
5. Preservar referências históricas ao encerrar vínculos.
6. Definir tratamento de conflito e recuperação sem apagar recursos existentes.

Ao reconstituir memberships, o adapter deve informar o status persistido
explicitamente. O padrão `ACTIVE` do construtor serve à criação e não deve
substituir o estado armazenado de um vínculo encerrado.

Consultas em memória e mocks não comprovam essas garantias. Testes futuros com
MySQL devem cobrir duas ativações concorrentes, remoção/rebaixamento concorrente
com escrita, rollback de bootstrap e referências empresariais incompatíveis.

## Verificação isolada

`backend/jest.workspace-core.config.cjs` herda o transformador e os thresholds
do Jest existente, mas não carrega `setupFiles` ou `setupFilesAfterEnv`.
Restringe testes e coleta de cobertura ao novo core.

A partir de `backend/`, com dependências já disponíveis:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js \
  --config jest.workspace-core.config.cjs --runInBand
```

Para coletar cobertura sem sobrescrever relatórios do projeto:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js \
  --config jest.workspace-core.config.cjs --runInBand --coverage \
  --coverageDirectory=/tmp/opencode/workspace-core-coverage
```

Para checar os tipos do core e dos testes sem incluir os adapters existentes:

```bash
node ./node_modules/typescript/bin/tsc --project tsconfig.workspace-core.json
```

Essa configuração herda as opções estritas e o `noEmit` do projeto. As
dependências de código são alcançadas pelos imports dos testes, sem executar
bootstrap, configuração de ambiente ou adapters.

Utilizar o runtime suportado em `backend/package.json`. Esses comandos
descrevem como executar a verificação; não são registro de resultado aprovado.

## Limites de segurança e entrega

Não foram implementados MySQL, migrations, transações, HTTP, autenticação real,
sessões, gateway, envio de emails, mobile ou isolamento do inventário existente.
O core não foi conectado às rotas atuais.

O inventário existente **não passa a ser multi-tenant nem seguro para empresas
reais** pela presença dessas classes. A integração deve permanecer bloqueada
até haver persistência, identidade e autorização efetivamente implementadas e
testadas, conforme a ADR.

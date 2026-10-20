# Visão futura do ERP

Este documento preserva a direção de produto descrita antes de `feat/api-hardening`. Os itens abaixo ainda não existem neste repositório e não fazem parte do contrato HTTP atual. Consulte [a API implementada](api/http-api.md) antes de integrar um cliente.

## Cliente

O plano original prevê um aplicativo mobile em React Native/Expo para cadastro de produtos, movimentação e histórico. Um frontend web também pode usar a API pelo gateway HTTPS; se estiver em outra origem, precisa de `FRONTEND_ORIGIN`. Clientes devem enviar JWT de acesso em `Authorization: Bearer ...`, tratar os erros e a paginação atuais e manter o backend como fonte de verdade do estoque. Cache ou fila offline exigirão estratégia de sincronização e idempotência antes de permitir comandos de estoque desconectados.

## Identidade e permissões

O gateway Nginx já consulta o verificador JWT interno, mas ainda falta escolher o provedor OIDC que emitirá os tokens, definir login, renovação, logout e o modelo de usuários e papéis. Esses fluxos podem pertencer ao provedor ou a um serviço de identidade separado; rotas antigas propostas como `/api/auth/login` e `/api/users/me` não são parte da API atual. O contrato público exige `inventory:read` para leitura e `inventory:write` para escrita.

## Módulos posteriores

- Upload de imagem de produto por endpoint autorizado, com validação de arquivo e armazenamento definido; a antiga rota pública `/uploads` foi removida.
- Relatórios de estoque, alertas e dashboard com consultas próprias.
- Pedidos, fornecedores e outros módulos de ERP após definir suas regras de domínio e permissões.
- Contratos TypeScript compartilhados ou gerados para alinhar nomes de campos, categorias, tipos de movimento e paginação entre clientes e API.

Antes de evoluir o contrato, definir moeda, política de idempotência para entradas e saídas, permissões por recurso e compatibilidade das respostas com clientes existentes.

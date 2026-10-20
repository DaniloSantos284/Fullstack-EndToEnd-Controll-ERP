# backend/src/application/use-cases/errors/

`AppError` representa uma falha esperada da aplicação. O construtor `new AppError(message, statusCode = 400, code?)` guarda `statusCode` e `code`. Sem código explícito, usa `NOT_FOUND` para `404`, `CONFLICT` para `409` e `VALIDATION_ERROR` para os demais status. Os casos de uso o usam para produto ausente, dados inválidos e conflitos de saldo.

O middleware HTTP reconhece `AppError` e responde `{ code, message, requestId }` com o status indicado. Ele também trata `DomainError` (invariantes de entidade) e `HttpError` (validação/limites de transporte). Exceções de infraestrutura não são convertidas em `AppError` pelos repositórios: códigos conhecidos de indisponibilidade de banco viram `503`; outras falhas inesperadas viram `500`, sem detalhes internos na resposta.

`AppError` fica na aplicação; as entidades do domínio lançam `DomainError` em `src/domain/errors/DomainError.ts` e não importam esta classe.

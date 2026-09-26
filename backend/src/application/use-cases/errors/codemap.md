# backend/src/application/use-cases/errors/

## Responsibility

Define o erro de aplicação esperado usado para comunicar falhas com status HTTP:
`AppError`.

`AppError` recebe uma mensagem e um status, estende o `Error` nativo e expõe
`statusCode` como propriedade pública somente para leitura. O status padrão é
`400`.

## Design

```ts
new AppError(message, statusCode = 400)
```

O construtor chama `super(message)` e atribui `statusCode`; não define `name`,
`cause`, uma lista de códigos de domínio ou subclasses especializadas. A
identificação no limite HTTP é feita com `error instanceof AppError`.

Embora o arquivo esteja em `application/use-cases/errors`, o tipo é importado
por:

- os casos de uso para validação e ausência de produto;
- `Product` para nome/preço inválido e saída com saldo insuficiente;
- `StockMovement` para quantidade de movimento inválida;
- `MySqlProductRepository` para traduzir suas falhas de banco;
- controllers e `http/middlewares/errorHandler`.

Assim, o tipo funciona como convenção de erro transversal na implementação
atual, não apenas como erro privado dos casos de uso.

## Flow

1. Uma validação, regra do agregado ou parte da persistência instancia
   `AppError`.
2. A exceção sobe pelo caso de uso/controller; os casos de uso não fazem
   `try/catch` para convertê-la.
3. As rotas chamam `handle(...).catch(next)`.
4. O `errorHandler` retorna `error.statusCode` e
   `{ message: error.message }` quando a instância é `AppError`.
5. Qualquer outro `Error` é registrado e retorna HTTP 500 com
   `{ message: "Erro de servidor" }`.

Erros produzidos diretamente pelos casos de uso incluem validações HTTP 400,
produtos ausentes HTTP 404 e, na saída, saldo insuficiente HTTP 400 delegado a
`Product`. A relação completa de mensagens por caso de uso está em
`../codemap.md`.

## Integration

O middleware reconhece somente instâncias de `AppError`; mensagem e status não
são serializados em outra estrutura. Os repositórios podem rejeitar com erros
que não sejam `AppError` — em particular, `MySqlStockMovementRepository` não
faz conversão local — e esses erros chegam como 500 ao middleware.

Limitações verificáveis:

- o status não é validado nem restringido pelo construtor; qualquer `number`
  aceito pelo TypeScript pode ser fornecido;
- não há encapsulamento de detalhes internos além da convenção de mensagem;
- a dependência do domínio em
  `application/use-cases/errors/AppError` inverte a direção normalmente
  esperada em uma separação estrita entre domínio e aplicação.

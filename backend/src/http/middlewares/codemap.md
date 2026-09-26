# `backend/src/http/middlewares/`

## Responsabilidade

O diretório contém `errorHandler`, o middleware Express de quatro argumentos que
normaliza as falhas recebidas após as rotas. Ele é instalado em `src/app.ts` depois
de `express.json()`, do serviço de arquivos estáticos e de `productsRoutes`.

## Fluxo e contrato de erro

As rotas chamam os métodos assíncronos dos controllers como
`handle(req, res).catch(next)`. Erros lançados por controllers, casos de uso,
entidades ou repositórios que chegam a `next` seguem esta bifurcação:

| Tipo de erro | Status | Corpo da resposta | Efeito adicional |
| --- | --- | --- | --- |
| `AppError` | `error.statusCode` (padrão do construtor: `400`) | `{ "message": error.message }` | Não registra no console neste middleware. |
| Qualquer outro `Error` | `500` | `{ "message": "Erro de servidor" }` | Executa `console.error("Erro inesperado:", error)`. |

Não há envelope de erro adicional, `code`, `details`, stack trace ou identificação
de requisição no corpo HTTP. O middleware não altera uma resposta já enviada
diretamente por um controller; por exemplo, o controller de detalhes responde o
`id` inválido com `400` antes de invocar seu caso de uso.

## Origem das falhas conhecidas

- Controllers e casos de uso usam `AppError` para entradas inválidas, produtos não
  encontrados, preço inválido e saldo insuficiente.
- `MySqlProductRepository` converte seus erros de persistência/consulta em
  `AppError` com status `400`, portanto preserva o contrato acima.
- `MySqlStockMovementRepository` não captura erros de banco; essas falhas chegam
  como erro inesperado e retornam `500`.
- Um corpo JSON que `express.json()` não consiga interpretar também não é um
  `AppError`, portanto recebe a resposta genérica `500` quando alcançar este
  middleware.

## Dependências e integração

- **Express:** tipos `Request`, `Response` e `NextFunction`, além da convenção de
  middleware de erro definida por quatro parâmetros.
- **Aplicação:** `AppError`, localizado em
  `src/application/use-cases/errors/AppError.ts`, carrega a mensagem e o
  `statusCode` usado na resposta.
- **Aplicativo e rotas:** `app.ts` registra o middleware; `products.routes.ts`
  encaminha as rejeições de cada controller com `next`.

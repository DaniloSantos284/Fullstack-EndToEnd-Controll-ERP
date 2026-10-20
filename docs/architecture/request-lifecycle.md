# Ciclo de requisição

No overlay público, o Nginx recebe o JWT do frontend e faz `auth_request` para `/internal/auth/verify`. O controller exige o escopo correspondente ao método original e usa a porta `AccessTokenVerifier`; o adaptador `jose` valida assinatura e claims via JWKS. Uma resposta `204` libera a chamada `/api/`, que chega ao Express sem o bearer token. O preflight CORS `OPTIONS` recebe `204` no gateway quando há origem configurada e não acessa o verificador.

## Criação de produto

1. O Express gera `X-Request-Id`, define headers Helmet e aplica o limite de JSON e de requisições.
2. `CreateProductController` valida query vazia e body estrito com Zod. Campos desconhecidos e tipos inválidos geram `400` antes de acessar o banco.
3. `CreateProductUseCase` constrói `Product`; a entidade valida nome, preço, categoria, saldo inicial e comprimentos. O preço vira centavos inteiros.
4. `MySqlProductRepository.save` insere uma linha com preço decimal formatado e quantidade zero.
5. O controller retorna `201`. Erros passam ao middleware central, que devolve `{code,message,requestId}`.

## Saída de estoque

1. O controller valida UUID, body `{quantity}` e query vazia.
2. `AddStockExitUseCase` cria um `StockMovement` de saída e chama a porta `applyMovement`.
3. O adaptador abre uma `PoolConnection`, inicia transação e faz `SELECT quantity ... FOR UPDATE` para o produto.
4. Produto inexistente vira `404`; saldo insuficiente vira `409`. Caso válido atualiza `products.quantity`, insere `stock_movements` e faz commit.
5. Toda saída antecipada ou erro SQL executa rollback; a conexão é liberada em `finally`. Duas saídas simultâneas do mesmo produto são serializadas pelo lock de linha.

## Consulta

`GET /api/products` executa uma query paginada ordenada por `id`. `GET /api/products/:id` e `GET /api/products/:id/movements` consultam produto e página de movimentos, ordenados por `created_at DESC, id DESC`. A linha extra determina `hasNext` sem COUNT. IDs inválidos são rejeitados antes do SQL.

## Erro, saúde e parada

O middleware distingue validação (`400`), ausência (`404`), conflito (`409`), corpo grande (`413`), rate limit (`429`), banco indisponível reconhecido (`503`) e falhas inesperadas (`500`). Logs de falhas inesperadas registram tipo/status, não mensagem ou stack. `GET /health/live` responde sem consultar o banco; readiness executa `SELECT 1`. Ao receber SIGINT/SIGTERM, o servidor marca readiness negativa, para de aceitar novas conexões e fecha o pool.

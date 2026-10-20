# Middlewares HTTP

`requestContext.ts` gera UUID por requisição, define `X-Request-Id` e registra log JSON com método, rota, status e duração. Não registra body, query, headers ou token.

`rateLimit.ts` limita chamadas `/api` por IP numa janela configurável, devolvendo `429` e `Retry-After`. O mapa é local a cada processo; Nginx também limita requisições no overlay público e uma implantação com múltiplas réplicas precisa de limite compartilhado.

`errorHandler.ts` classifica `HttpError`, `DomainError`, `AppError`, erros do parser JSON (`400` para JSON inválido ou corpo interrompido/inconsistente, `413` para corpo grande e `415` para charset ou codificação não suportados), códigos conhecidos de indisponibilidade MySQL e falhas inesperadas. Toda resposta de erro tem `{code,message,requestId}`. Em `5xx`, o log inclui tipo/status, sem stack, mensagem interna ou SQL.

# Erros HTTP

`HttpError` contém status, código público e mensagem do transporte. Schemas, limitadores e rotas lançam esse erro; `middlewares/errorHandler.ts` padroniza `{code,message,requestId}` e não expõe detalhes de falhas inesperadas.

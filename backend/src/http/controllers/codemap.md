# Controllers

Cada controller traduz uma requisição HTTP para um caso de uso e define apenas o status/corpo da resposta. Schemas Zod estritos em `../schemas/products.schemas.ts` validam UUID, query e body; campos extras são rejeitados, inclusive opcionais com tipo incorreto.

`ListProductsController` retorna página de produtos. `GetProductDetailsController` pagina o histórico dentro de um produto. `ListProductMovementsController` retorna movimentos paginados. `CreateProductController` cria um produto. `AddStockEntryController` e `AddStockExitController` retornam `201 {ok:true}` após o commit.

`VerifyGatewayTokenController` atende apenas o subrequest privado do Nginx. Rejeita bearer ausente/inválido, exige escopo de leitura para GET/HEAD e de escrita para POST, e devolve `204` em sucesso. O provedor de tokens é injetado pela porta `AccessTokenVerifier`.

# Schemas HTTP

`products.schemas.ts` valida UUID, query, body de criação e movimentos com Zod estrito. O parse ocorre nos controllers antes dos casos de uso. `page` e `limit` têm máximos de 1.000.000 e 100, com padrões 1 e 20; corpo de criação aceita preço numérico de até duas casas decimais.

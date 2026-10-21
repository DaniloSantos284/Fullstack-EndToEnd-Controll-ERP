# Decisões técnicas da branch

| Decisão | Motivo e consequência |
| --- | --- |
| Saldo materializado em `products.quantity` | Leitura de listagem barata. Transação com lock mantém saldo e movimento coerentes em cada comando. Migração reconcilia volumes antigos a partir do histórico. |
| Preço em centavos no domínio | Evita aritmética monetária em ponto flutuante; persiste `DECIMAL(10,2)`. O JSON existente continua numérico. Moeda não é inferida. |
| Paginação por página/offset | Contrato simples para o cliente atual. Limites de `page` e `limit` impedem consultas sem teto; páginas muito profundas ainda podem custar mais que cursor. |
| Zod no adaptador HTTP | Erros de forma e campos extras são rejeitados antes dos casos de uso. Invariantes também permanecem no domínio. |
| Erros tipados por camada | `DomainError` não depende de Express; `AppError` representa falhas esperadas; `HttpError` pertence ao transporte. Falhas SQL inesperadas não são devolvidas ao cliente. |
| Autenticação no Nginx com `auth_request` | O gateway consulta o verificador JWT interno por requisição; a API não emite tokens nem implementa cadastro de identidade. A publicação depende de um provedor OIDC/JWKS real e de TLS. |
| Rate limit local + limite no gateway | O limitador em memória é suficiente para uma instância, mas não dá quota global entre réplicas. O gateway público deve aplicar seu próprio limite. |
| CORS configurável no gateway | `FRONTEND_ORIGIN` permite uma origem de navegador explícita. O preflight `OPTIONS` responde sem JWT; as rotas de negócio continuam protegidas por `auth_request`. Sem a variável, navegadores de outra origem não conseguem consumir a API. |
| Sem `/uploads` público | Não existe fluxo de upload autorizado; a rota estática foi removida. |

Não há banco de produção com dados reais a migrar nesta etapa, conforme informado pelo responsável do projeto. A migração versionada continua disponível para volumes de desenvolvimento antigos. Mudanças de contrato HTTP devem ser coordenadas com futuros consumidores; o repositório ainda não contém frontend.

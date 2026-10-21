# Erros do domínio

`DomainError` representa violação de invariantes das entidades sem depender de HTTP. O middleware HTTP traduz esses erros para `400` quando vêm de entradas do cliente; adaptadores de persistência tratam linhas armazenadas inválidas como falhas internas.

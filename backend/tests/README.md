# Testes com Jest e Supertest

Configuração para o backend Express, TypeScript e CommonJS. Jest executa os testes,
ts-jest transforma TypeScript e Supertest faz requisições à aplicação Express.
O `tsx` continua sendo usado apenas no desenvolvimento da aplicação.

## Versões

Versões estáveis verificadas no registro oficial npm em **26/09/2026**, fixadas
exatamente no `package.json` e reproduzidas pelo `pnpm-lock.yaml`:

| Pacote | Versão | Referência |
| --- | --- | --- |
| `jest` | 30.5.2 | [Release oficial](https://github.com/jestjs/jest/releases/tag/v30.5.2) |
| `@jest/globals` | 30.5.2 | [Tipos e APIs do Jest](https://jestjs.io/docs/getting-started#using-typescript) |
| `supertest` | 7.3.0 | [Release oficial](https://github.com/forwardemail/supertest/releases/tag/v7.3.0) |
| `ts-jest` | 29.4.14 | [Release oficial](https://github.com/kulshekhar/ts-jest/releases/tag/v29.4.14) |
| `@types/supertest` | 7.2.1 | [Registro npm](https://www.npmjs.com/package/@types/supertest) |

O ts-jest 29.4.14 declara compatibilidade com Jest 29/30 e TypeScript >=4.3 <7;
seu número de versão principal não precisa coincidir com o do Jest. O projeto usa
TypeScript 5.9.3. As APIs de teste são importadas de `@jest/globals`, dispensando
`@types/jest` e evitando globais implícitos.

Use uma versão corrigida do Node 22 LTS, a mesma linha usada pelo Dockerfile.
Versões recentes e lockfile não garantem ausência de vulnerabilidades: revise a
árvore instalada com `pnpm audit`.

O override `qs: 6.16.0` corrige os avisos de segurança dessa dependência compartilhada
por Express e Superagent (usado pelo Supertest). O Express 4.22.1 ainda restringe
sua resolução a `~6.14.0`, por isso a atualização automática não elimina o problema.
A versão 6.16.0 contém a [correção publicada pelo mantenedor](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g).
Reavalie o override quando o Express ampliar sua dependência. Também foram
atualizadas resoluções vulneráveis do lockfile dentro das faixas já declaradas,
incluindo MySQL2, body-parser, path-to-regexp e esbuild.

A auditoria npm da árvore instalada em **26/09/2026** reportou **0 vulnerabilidades**
após essas correções. Isso descreve os avisos conhecidos nessa data, não uma
garantia de segurança futura. Nenhum teste foi executado durante a configuração.

A instalação pode avisar que `glob@10.5.0`, transitivo de `test-exclude`, está
descontinuado. Essa versão contém a correção do
[advisory publicado para a linha 10](https://github.com/isaacs/node-glob/security/advisories/GHSA-5j98-mcp5-4vw2).
Foi mantida a resolução suportada pelo consumidor, sem forçar uma troca major.

## Instalação e comandos

Execute a partir de `backend/`. Instale as dependências com `pnpm install --frozen-lockfile`.

| Comando | Finalidade |
| --- | --- |
| `pnpm test` | Executar os testes uma vez. |
| `pnpm test:watch` | Observar alterações com o modo watch do Jest. |
| `pnpm test:coverage` | Executar e gerar cobertura V8 em `coverage/`. |
| `pnpm test:ci` | Executar em modo CI, sequencialmente, com cobertura. |
| `pnpm test:typecheck` | Conferir tipos de fontes e testes, sem executá-los nem emitir arquivos. |

Esta entrega configura as ferramentas e os helpers, sem adicionar ou executar
casos de teste. Enquanto não houver testes, Jest encerra com código 1; não há
`passWithNoTests` para tratar uma suíte vazia como aprovada.

## Estrutura e comportamento

- `tests/unit/`: testes unitários, com nomes `*.test.ts` ou `*.spec.ts`.
- `tests/http/`: testes HTTP com Supertest, usando as mesmas extensões.
- `tests/setup-env.ts`: ambiente de teste, UTC e valores fictícios de banco.
- `tests/setup-jest.ts`: mocks de infraestrutura e limpeza entre testes.
- `tests/helpers/database.ts`: mock configurável de `db.execute`.
- `tests/helpers/http-client.ts`: cliente Supertest ligado a `src/app.ts`.

`jest.config.cjs` usa ambiente Node, o preset CommonJS do ts-jest e
`tsconfig.test.json`. O build de produção continua limitado a `src/`. A
transformação usa `isolatedModules`, herdado do projeto; a checagem completa de
tipos permanece no comando separado. A cobertura inclui fontes de `src/`, exceto
declarações de tipos e o bootstrap `src/server.ts`.

## Uso do Supertest

Exemplo para um futuro arquivo `tests/http/products.test.ts`:

```ts
import { expect, it } from '@jest/globals';
import { databaseMock } from '../helpers/database';
import { createHttpClient } from '../helpers/http-client';

it('lista os produtos quando o banco retorna uma coleção vazia', async () => {
  databaseMock.execute.mockResolvedValueOnce([[], []]);

  await createHttpClient()
    .get('/api/products')
    .expect('Content-Type', /json/)
    .expect(200, []);

  expect(databaseMock.execute).toHaveBeenCalledTimes(1);
});
```

Supertest recebe a aplicação e gerencia uma porta efêmera durante as requisições.
Não importe `src/server.ts` nem inicie um servidor de desenvolvimento para esses
testes. Aguarde as requisições com `await` para propagar falhas e permitir o
encerramento dos recursos.

## Isolamento do banco

Antes dos imports dos testes, Jest substitui `src/infra/db/mysql/connection.ts`
pelo mock de banco e impede a carga automática de `.env` via `dotenv/config`.
Assim, importar `src/app.ts` no helper não inicializa o pool real nem avalia a
configuração de produção. O mock é reiniciado antes de cada teste e uma chamada
a `execute` sem resposta configurada lança erro, evitando resultados simulados
de sucesso por padrão.

Esses testes exercitam a aplicação HTTP com consultas simuladas. Eles não validam
SQL, transações ou o comportamento do MySQL. Integração com banco real exige
configuração separada e banco descartável. O mock não é uma barreira geral de
rede: não remova o mock de conexão nem importe o driver diretamente nessa suíte.

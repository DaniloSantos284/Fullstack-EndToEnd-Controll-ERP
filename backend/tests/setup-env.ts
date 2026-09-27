/// <reference types="node" />

// Valores exclusivos dos testes; a conexão MySQL é substituída em setup-jest.ts.
Object.assign(process.env, {
  NODE_ENV: 'test',
  TZ: 'UTC',
  PORT: '0',
  DB_HOST: '127.0.0.1',
  PORT_DB: '3306',
  DB_USER: 'jest',
  DB_PASSWORD: 'jest-only-unused',
  DB_DATABASE: 'stock_test',
  DB_CONNECTION_LIMIT: '1',
});

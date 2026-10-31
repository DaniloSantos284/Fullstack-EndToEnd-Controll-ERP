import { beforeEach, jest } from '@jest/globals';
import { resetDatabaseMock } from './helpers/database';

// Evita ler o .env local durante os testes.
jest.mock('dotenv/config', () => ({}));

// Substitui o módulo inteiro antes que ele carregue env.ts ou crie o pool real.
jest.mock('../src/infra/db/mysql/connection', () => {
  const { databaseMock } = jest.requireActual<
    typeof import('./helpers/database')
  >('./helpers/database');

  return { db: databaseMock };
});

beforeEach(() => {
  resetDatabaseMock();
});

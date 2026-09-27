import { jest } from '@jest/globals';

type DatabaseExecute = (
  sql: string,
  values?: readonly unknown[],
) => Promise<[unknown, unknown[]]>;

const rejectUnconfiguredQuery: DatabaseExecute = async () => {
  throw new Error(
    'Consulta SQL sem resposta simulada. Configure databaseMock.execute no teste.',
  );
};

export const databaseMock = {
  execute: jest.fn<DatabaseExecute>(rejectUnconfiguredQuery),
};

export function resetDatabaseMock(): void {
  databaseMock.execute.mockReset();
  databaseMock.execute.mockImplementation(rejectUnconfiguredQuery);
}

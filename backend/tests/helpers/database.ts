import { jest } from '@jest/globals';

type DatabaseExecute = (
  sql: string,
  values?: readonly unknown[],
) => Promise<[unknown, unknown[]]>;

type AsyncVoid = () => Promise<void>;
type Release = () => void;

const rejectUnconfiguredQuery: DatabaseExecute = async () => {
  throw new Error(
    'Consulta SQL sem resposta simulada. Configure databaseMock.execute no teste.',
  );
};

export const connectionMock = {
  execute: jest.fn<DatabaseExecute>(rejectUnconfiguredQuery),
  beginTransaction: jest.fn<AsyncVoid>(async () => {}),
  commit: jest.fn<AsyncVoid>(async () => {}),
  rollback: jest.fn<AsyncVoid>(async () => {}),
  release: jest.fn<Release>(() => {}),
};

type GetConnection = () => Promise<typeof connectionMock>;

export const databaseMock = {
  execute: jest.fn<DatabaseExecute>(rejectUnconfiguredQuery),
  getConnection: jest.fn<GetConnection>(async () => connectionMock),
};

export function resetDatabaseMock(): void {
  databaseMock.execute.mockReset();
  databaseMock.execute.mockImplementation(rejectUnconfiguredQuery);
  databaseMock.getConnection.mockReset();
  databaseMock.getConnection.mockImplementation(async () => connectionMock);
  connectionMock.execute.mockReset();
  connectionMock.execute.mockImplementation(rejectUnconfiguredQuery);
  connectionMock.beginTransaction.mockReset();
  connectionMock.beginTransaction.mockImplementation(async () => {});
  connectionMock.commit.mockReset();
  connectionMock.commit.mockImplementation(async () => {});
  connectionMock.rollback.mockReset();
  connectionMock.rollback.mockImplementation(async () => {});
  connectionMock.release.mockReset();
  connectionMock.release.mockImplementation(() => {});
}

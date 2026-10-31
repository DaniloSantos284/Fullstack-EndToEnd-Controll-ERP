import { describe, expect, it, jest } from '@jest/globals';
import { StockMovement } from '../../src/domain/entities/StockMovement';
import { StockMovementType } from '../../src/domain/enums/StockMovementType';
import { MySqlStockMovementRepository } from '../../src/infra/db/mysql/repositories/MySqlStockMovementRepository';
import { connectionMock, databaseMock } from '../helpers/database';

const productId = '1c242a54-7d9c-480e-8de2-b547bd56f0bd';

function movement(type: StockMovementType, quantity: number): StockMovement {
  return new StockMovement({
    id: '4839ca19-193a-4c96-a815-99e06fd46922',
    productId,
    type,
    quantity,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

describe('MySqlStockMovementRepository.applyMovement', () => {
  const repository = new MySqlStockMovementRepository();

  it('registra entrada e saldo na mesma transação após bloquear o produto', async () => {
    connectionMock.execute
      .mockResolvedValueOnce([[{ quantity: 2 }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await expect(repository.applyMovement(movement(StockMovementType.ENTRY, 3)))
      .resolves.toBe('applied');

    expect(connectionMock.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connectionMock.execute).toHaveBeenCalledTimes(3);
    expect(connectionMock.execute.mock.calls[0]?.[0]).toMatch(/SELECT\s+quantity[\s\S]*FOR UPDATE/i);
    expect(connectionMock.execute.mock.calls[1]?.[0]).toMatch(/UPDATE\s+products/i);
    expect(connectionMock.execute.mock.calls[1]?.[1]).toEqual([3, productId]);
    expect(connectionMock.execute.mock.calls[2]?.[0]).toMatch(/INSERT INTO\s+stock_movements/i);
    expect(connectionMock.commit).toHaveBeenCalledTimes(1);
    expect(connectionMock.rollback).not.toHaveBeenCalled();
    expect(connectionMock.release).toHaveBeenCalledTimes(1);
  });

  it('não persiste uma saída que excede o saldo bloqueado', async () => {
    connectionMock.execute.mockResolvedValueOnce([[{ quantity: 2 }], []]);

    await expect(repository.applyMovement(movement(StockMovementType.EXIT, 3)))
      .resolves.toBe('insufficient_stock');

    expect(connectionMock.execute).toHaveBeenCalledTimes(1);
    expect(connectionMock.commit).not.toHaveBeenCalled();
    expect(connectionMock.rollback).toHaveBeenCalledTimes(1);
    expect(connectionMock.release).toHaveBeenCalledTimes(1);
  });

  it('retorna conflito de limite quando entrada excederia INT do MySQL', async () => {
    connectionMock.execute.mockResolvedValueOnce([[{ quantity: 2_147_483_647 }], []]);

    await expect(repository.applyMovement(movement(StockMovementType.ENTRY, 1)))
      .resolves.toBe('stock_limit_exceeded');

    expect(connectionMock.execute).toHaveBeenCalledTimes(1);
    expect(connectionMock.rollback).toHaveBeenCalledTimes(1);
  });

  it('informa produto ausente e libera a transação', async () => {
    connectionMock.execute.mockResolvedValueOnce([[], []]);

    await expect(repository.applyMovement(movement(StockMovementType.ENTRY, 3)))
      .resolves.toBe('product_not_found');

    expect(connectionMock.commit).not.toHaveBeenCalled();
    expect(connectionMock.rollback).toHaveBeenCalledTimes(1);
    expect(connectionMock.release).toHaveBeenCalledTimes(1);
  });

  it('desfaz a atualização de saldo se a inserção do movimento falhar', async () => {
    const failure = new Error('falha no INSERT');
    connectionMock.execute
      .mockResolvedValueOnce([[{ quantity: 10 }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockRejectedValueOnce(failure);

    await expect(repository.applyMovement(movement(StockMovementType.EXIT, 7)))
      .rejects.toBe(failure);

    expect(connectionMock.execute.mock.calls[1]?.[1]).toEqual([-7, productId]);
    expect(connectionMock.commit).not.toHaveBeenCalled();
    expect(connectionMock.rollback).toHaveBeenCalledTimes(1);
    expect(connectionMock.release).toHaveBeenCalledTimes(1);
  });

  it('serializa saídas concorrentes no bloqueio de linha', async () => {
    let quantity = 10;
    let savedMovements = 0;
    let lockTail = Promise.resolve();

    const makeConnection = () => {
      let delta = 0;
      let inserted = false;
      let unlock = () => {};

      const execute = jest.fn<(
        sql: string,
        values?: readonly unknown[],
      ) => Promise<[unknown, unknown[]]>>(async (sql, values) => {
        if (/SELECT\s+quantity/i.test(sql)) {
          if (/FOR UPDATE/i.test(sql)) {
            const previous = lockTail;
            lockTail = new Promise<void>((resolve) => { unlock = resolve; });
            await previous;
          }
          return [[{ quantity }], []];
        }
        if (/UPDATE\s+products/i.test(sql)) {
          delta = Number(values?.[0]);
          return [{ affectedRows: 1 }, []];
        }
        if (/INSERT INTO\s+stock_movements/i.test(sql)) {
          inserted = true;
          return [{ affectedRows: 1 }, []];
        }
        throw new Error(`SQL inesperado no teste: ${sql}`);
      });

      return {
        execute,
        beginTransaction: jest.fn(async () => {}),
        commit: jest.fn(async () => {
          quantity += delta;
          if (inserted) savedMovements += 1;
          unlock();
        }),
        rollback: jest.fn(async () => { unlock(); }),
        release: jest.fn(() => {}),
      };
    };

    const first = makeConnection();
    const second = makeConnection();
    databaseMock.getConnection
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const outcomes = await Promise.all([
      repository.applyMovement(movement(StockMovementType.EXIT, 7)),
      repository.applyMovement(movement(StockMovementType.EXIT, 7)),
    ]);

    expect(outcomes.sort()).toEqual(['applied', 'insufficient_stock']);
    expect(quantity).toBe(3);
    expect(savedMovements).toBe(1);
    expect(first.execute.mock.calls[0]?.[0]).toMatch(/FOR UPDATE/i);
    expect(second.execute.mock.calls[0]?.[0]).toMatch(/FOR UPDATE/i);
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(second.release).toHaveBeenCalledTimes(1);
  });
});

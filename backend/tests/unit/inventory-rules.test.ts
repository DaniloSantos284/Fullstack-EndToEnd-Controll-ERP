import { describe, expect, it, jest } from '@jest/globals';
import { AddStockExitUseCase } from '../../src/application/use-cases/AddStockExitUseCase';
import { Product } from '../../src/domain/entities/Product';
import { StockMovement } from '../../src/domain/entities/StockMovement';
import { ProductCategory } from '../../src/domain/enums/ProductCategory';
import { StockMovementType } from '../../src/domain/enums/StockMovementType';
import type { StockMovementRepository } from '../../src/domain/repositories/StockMovementRepository';

const productId = '1c242a54-7d9c-480e-8de2-b547bd56f0bd';

describe('invariantes de estoque', () => {
  it('preserva a quantidade materializada ao reconstituir um produto', () => {
    const product = new Product({
      id: productId,
      name: 'Caderno',
      price: 12.50,
      category: ProductCategory.OFFICE,
      quantity: 8,
    });

    expect(product.id).toBe(productId);
    expect(product.quantity).toBe(8);
    expect(product.priceCents).toBe(1250);
    expect(product.price).toBe(12.5);
  });

  it.each([0.001, -1, Number.POSITIVE_INFINITY, 100_000_000])(
    'rejeita preço monetário inválido: %s',
    (price) => {
      expect(() => new Product({
        name: 'Caderno',
        price,
        category: ProductCategory.OFFICE,
      })).toThrow();
    },
  );

  it.each([-1, 1.5, 2_147_483_648])(
    'rejeita saldo materializado inválido: %s',
    (quantity) => {
      expect(() => new Product({
        name: 'Caderno',
        price: 12.50,
        category: ProductCategory.OFFICE,
        quantity,
      })).toThrow();
    },
  );

  it('atribui sinal correto a entradas e saídas e mantém data estável', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const entry = new StockMovement({
      id: 'a', productId, type: StockMovementType.ENTRY, quantity: 3, createdAt,
    });
    const exit = new StockMovement({
      id: 'b', productId, type: StockMovementType.EXIT, quantity: 2, createdAt,
    });

    expect(entry.getSignedQuantity()).toBe(3);
    expect(exit.getSignedQuantity()).toBe(-2);
    expect(exit.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it.each([0, -1, 0.5, 2_147_483_648])(
    'rejeita movimento com quantidade inválida: %s',
    (quantity) => {
      expect(() => new StockMovement({
        id: 'a', productId, type: StockMovementType.ENTRY, quantity,
      })).toThrow();
    },
  );
});

describe('AddStockExitUseCase', () => {
  it('traduz saldo insuficiente em conflito sem tentar uma segunda gravação', async () => {
    const applyMovement = jest.fn<StockMovementRepository['applyMovement']>(
      async () => 'insufficient_stock',
    );
    const repository: StockMovementRepository = {
      applyMovement,
      findPageByProductId: async () => [],
    };

    await expect(new AddStockExitUseCase(repository).execute({
      productId,
      quantity: 7,
    })).rejects.toMatchObject({ statusCode: 409 });

    expect(applyMovement).toHaveBeenCalledTimes(1);
    expect(applyMovement.mock.calls[0]?.[0]).toMatchObject({
      productId,
      quantity: 7,
      type: StockMovementType.EXIT,
    });
  });
});

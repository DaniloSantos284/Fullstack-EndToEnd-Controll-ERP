import type { RowDataPacket } from "mysql2/promise";
import { db } from "../connection";
import {
  ApplyMovementStatus,
  StockMovementRepository,
} from "../../../../domain/repositories/StockMovementRepository";
import { StockMovement } from "../../../../domain/entities/StockMovement";
import { Pagination } from "../../../../domain/repositories/Pagination";
import {
  StockMovementMapper,
  StockMovementRow,
} from "../mappers/StockMovementMapper";

type ProductQuantityRow = RowDataPacket & {
  quantity: number;
};

const MAX_SIGNED_INT = 2_147_483_647;

export class MySqlStockMovementRepository
  implements StockMovementRepository
{
  async applyMovement(
    movement: StockMovement
  ): Promise<ApplyMovementStatus> {
    const connection = await db.getConnection();
    let transactionStarted = false;
    let committed = false;
    const data = StockMovementMapper.toPersistence(movement);

    try {
      await connection.beginTransaction();
      transactionStarted = true;

      const [productRows] = await connection.execute<ProductQuantityRow[]>(
        `
        SELECT quantity
        FROM products
        WHERE id = ?
        FOR UPDATE
        `,
        [movement.productId]
      );

      const product = productRows[0];
      if (!product) {
        return "product_not_found";
      }

      if (movement.isExit() && product.quantity < movement.quantity) {
        return "insufficient_stock";
      }

      if (movement.isEntry() && product.quantity > MAX_SIGNED_INT - movement.quantity) {
        return "stock_limit_exceeded";
      }

      const quantityDelta = movement.isEntry()
        ? movement.quantity
        : -movement.quantity;
      await connection.execute(
        `
        UPDATE products
        SET quantity = quantity + ?
        WHERE id = ?
        `,
        [quantityDelta, movement.productId]
      );

      await connection.execute(
        `
        INSERT INTO stock_movements (
          id,
          product_id,
          type,
          quantity,
          created_at
        ) VALUES (?, ?, ?, ?, ?)
        `,
        [
          data.id,
          data.product_id,
          data.type,
          data.quantity,
          data.created_at,
        ]
      );

      await connection.commit();
      committed = true;
      return "applied";
    } finally {
      try {
        if (transactionStarted && !committed) {
          await connection.rollback();
        }
      } finally {
        connection.release();
      }
    }
  }

  async findPageByProductId(productId: string, { page, limit }: Pagination): Promise<StockMovement[]> {
    const [rows] = await db.execute<StockMovementRow[]>(
      `
      SELECT id, product_id, type, quantity, created_at
      FROM stock_movements
      WHERE product_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
      `,
      [productId, limit + 1, (page - 1) * limit]
    );

    return rows.map(StockMovementMapper.toDomain);
  }
}

import { db } from "../connection";
import { StockMovementRepository } from "../../../../domain/repositories/StockMovementRepository";
import { StockMovement } from "../../../../domain/entities/StockMovement";
import { StockMovementMapper } from "../mappers/StockMovementMapper";

export class MySqlStockMovementRepository
  implements StockMovementRepository
{
  async save(movement: StockMovement): Promise<void> {
    const data = StockMovementMapper.toPersistence(movement);

    await db.execute(
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
  }

  async findByProductId(productId: string): Promise<StockMovement[]> {
    const [rows] = await db.execute<any[]>(
      `
      SELECT *
      FROM stock_movements
      WHERE product_id = ?
      ORDER BY created_at DESC
      `,
      [productId]
    );

    return rows.map(StockMovementMapper.toDomain);
  }
}

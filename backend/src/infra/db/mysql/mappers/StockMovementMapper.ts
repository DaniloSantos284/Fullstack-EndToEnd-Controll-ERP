import type { RowDataPacket } from "mysql2/promise";
import { StockMovement } from "../../../../domain/entities/StockMovement";
import { StockMovementType } from "../../../../domain/enums/StockMovementType";
import { DomainError } from "../../../../domain/errors/DomainError";

export type StockMovementRow = RowDataPacket & {
  id: string;
  product_id: string;
  type: "in" | "out";
  quantity: number;
  created_at: Date;
};


export class StockMovementMapper {
  static toDomain(row: StockMovementRow): StockMovement {
    if (row.type !== "in" && row.type !== "out") {
      throw new Error("Invalid persisted stock movement");
    }

    try {
      return new StockMovement({
        id: row.id,
        productId: row.product_id,
        type: row.type === "in" ? StockMovementType.ENTRY : StockMovementType.EXIT,
        quantity: row.quantity,
        createdAt: row.created_at,
      });
    } catch (error) {
      if (error instanceof DomainError) {
        throw new Error("Invalid persisted stock movement");
      }
      throw error;
    }
  }


  static toPersistence(movement: StockMovement): {
    id: string;
    product_id: string;
    type: "in" | "out";
    quantity: number;
    created_at: Date;
  } {
    return {
      id: movement.id,
      product_id: movement.productId,
      type: movement.isEntry() ? "in" : "out",
      quantity: movement.quantity,
      created_at: movement.createdAt,
    }
  }
}

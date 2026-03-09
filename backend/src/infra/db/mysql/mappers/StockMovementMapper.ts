import { StockMovement } from "../../../../domain/entities/StockMovement";
import { StockMovementType } from "../../../../domain/enums/StockMovementType";


type StockMovementRow = {
  id: string;
  product_id: string;
  type: "in" | "out";
  quantity: number;
  created_at: Date;
};


export class StockMovementMapper {
  static toDomain(row: StockMovementRow): StockMovement {
    return new StockMovement({
      id: row.id,
      productId: row.product_id,
      type:
        row.type === "in"
          ? StockMovementType.ENTRY
          : StockMovementType.EXIT,
      quantity: row.quantity,
      createdAt: row.created_at,
    });
  }


  static toPersistence(movement: StockMovement) {
    return {
      id: movement.id,
      product_id: movement.productId,
      type: movement.isEntry() ? "in" : "out",
      quantity: movement.quantity,
      created_at: movement.createdAt
    }
  }
}
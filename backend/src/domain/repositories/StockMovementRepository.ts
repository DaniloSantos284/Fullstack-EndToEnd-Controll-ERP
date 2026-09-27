import { StockMovement } from "../entities/StockMovement";

export type ApplyMovementStatus =
  | "applied"
  | "product_not_found"
  | "insufficient_stock";

export interface StockMovementRepository {
  applyMovement(movement: StockMovement): Promise<ApplyMovementStatus>;
  findByProductId(productId: string): Promise<StockMovement[]>;
}

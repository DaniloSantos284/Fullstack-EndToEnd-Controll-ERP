import { StockMovement } from "../entities/StockMovement";
import { Pagination } from "./Pagination";

export type ApplyMovementStatus =
  | "applied"
  | "product_not_found"
  | "insufficient_stock"
  | "stock_limit_exceeded";

export interface StockMovementRepository {
  applyMovement(movement: StockMovement): Promise<ApplyMovementStatus>;
  findPageByProductId(productId: string, pagination: Pagination): Promise<StockMovement[]>;
}

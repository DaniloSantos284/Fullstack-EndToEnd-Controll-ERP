import { StockMovement } from "../entities/StockMovement";


export interface StockMovementRepository {
  save(movement: StockMovement): Promise<void>;
  findByProductId(productId: string): Promise<StockMovement[]>;
}
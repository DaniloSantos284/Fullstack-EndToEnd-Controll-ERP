import { randomUUID } from "crypto";
import { StockMovementRepository } from "../../domain/repositories/StockMovementRepository";
import { StockMovement } from "../../domain/entities/StockMovement";
import { StockMovementType } from "../../domain/enums/StockMovementType";
import { AppError } from "./errors/AppError"; 

const MAX_SIGNED_INT = 2_147_483_647;

type AddStockExitInput = {
  productId: string;
  quantity: number;
};

export class AddStockExitUseCase {
  constructor(private stockMovementRepository: StockMovementRepository) {}


  async execute(input: AddStockExitInput): Promise<void> {
    if (
      typeof input.quantity !== "number" ||
      !Number.isSafeInteger(input.quantity) ||
      input.quantity <= 0 ||
      input.quantity > MAX_SIGNED_INT
    ) {
      throw new AppError("A quantidade deve ser um inteiro positivo válido.", 400);
    }

    const stockExit = new StockMovement({
      id: randomUUID(),
      productId: input.productId,
      type: StockMovementType.EXIT,
      quantity: input.quantity,
    });

    const status = await this.stockMovementRepository.applyMovement(stockExit);

    if (status === "product_not_found") {
      throw new AppError("Produto não encontrado", 404);
    }

    if (status === "insufficient_stock") {
      throw new AppError("Estoque insuficiente.", 409);
    }
  }
}

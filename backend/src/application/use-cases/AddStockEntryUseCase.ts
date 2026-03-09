// Use case responsável por registrar entrada de estoque
import { randomUUID } from "crypto";
import { ProductRepository } from "../../domain/repositories/ProductRepository";
import { StockMovementRepository } from "../../domain/repositories/StockMovementRepository";
import { StockMovement } from "../../domain/entities/StockMovement";
import { StockMovementType } from "../../domain/enums/StockMovementType";
import { AppError } from "./errors/AppError";


type AddStockEntryInput = {
  productId: string;
  quantity: number;
}

export class AddStockEntryUseCase {
  constructor (
    private productRepository: ProductRepository,
    private stockMovementRepository: StockMovementRepository
  ) {}

  async execute(input: AddStockEntryInput): Promise<void> {
    if (input.quantity <= 0) {
      throw new AppError("A quantidade deve ser maior que zero.", 400);
    }

    const product = await this.productRepository.findById(input.productId);

    if (!product) {
      throw new AppError("Produto não encontrado", 404);
    }

    const stockEntry = new StockMovement({
      id: randomUUID(),
      productId: product.id,
      type: StockMovementType.ENTRY,
      quantity: input.quantity
    });

    product.addMovement(stockEntry);

    await this.stockMovementRepository.save(stockEntry);
  }
}
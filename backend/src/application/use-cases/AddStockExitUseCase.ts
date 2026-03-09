import { randomUUID } from "crypto";
import { ProductRepository } from "../../domain/repositories/ProductRepository";
import { StockMovementRepository } from "../../domain/repositories/StockMovementRepository";
import { StockMovement } from "../../domain/entities/StockMovement";
import { StockMovementType } from "../../domain/enums/StockMovementType";
import { AppError } from "./errors/AppError"; 


type AddStockExitInput = {
  productId: string;
  quantity: number;
};

export class AddStockExitUseCase {
  constructor (
    private productRepository: ProductRepository,
    private stockMovementRepository: StockMovementRepository
  ) {}


  async execute(input: AddStockExitInput): Promise<void> {
  if (typeof input.quantity !== 'number' || Number.isNaN(input.quantity) || input.quantity <= 0) {
    throw new AppError("A quantidade deve ser maior que zero.", 400)
  }

  const product = await this.productRepository.findById(input.productId);
  if (!product) {
    throw new AppError("Produto não encontrado", 404)
  }

  const stockExit = new StockMovement({
    id: randomUUID(),
    productId: product.id,
    type: StockMovementType.EXIT,
    quantity: input.quantity,
  });

  // Aqui pode lançar um erro de estoque insuficiente
  product.addMovement(stockExit);

  await this.stockMovementRepository.save(stockExit);
  }
}
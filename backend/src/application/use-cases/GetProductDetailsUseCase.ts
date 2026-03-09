import { ProductRepository } from "../../domain/repositories/ProductRepository";
import { StockMovementType } from "../../domain/enums/StockMovementType";
import { ProductCategory } from "../../domain/enums/ProductCategory";
import { AppError } from "./errors/AppError";

type StockMovementOutput = {
  id: string;
  type: StockMovementType;
  quantity: number;
  createdAt: Date;
};

type GetProductDetailsOutput = {
  id: string;
  name: string;
  price: number;
  category: ProductCategory;
  imageUrl: string | undefined;
  barCode: string | undefined;
  quantity: number;
  movements: StockMovementOutput[];
};

export class GetProductDetailsUseCase {
  constructor(
    private productRepository: ProductRepository
  ) {}

  async execute(productId: string): Promise<GetProductDetailsOutput> {
    const product = await this.productRepository.findById(productId);

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    return {
      id: product.id,
      name: product.name,
      price: product.price,
      category: product.category,
      imageUrl: product.imageUrl,
      barCode: product.barCode,
      quantity: product.quantity,
      movements: product.movements.map(movement => ({
        id: movement.id,
        type: movement.type,
        quantity: movement.quantity,
        createdAt: movement.createdAt,
      })),
    };
  }
}

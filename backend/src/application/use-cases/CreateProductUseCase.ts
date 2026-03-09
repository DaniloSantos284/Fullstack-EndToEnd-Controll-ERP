import { Product } from "../../domain/entities/Product";
import { ProductCategory } from "../../domain/enums/ProductCategory";
import { ProductRepository } from "../../domain/repositories/ProductRepository";
import { AppError } from "./errors/AppError";

type CreateProductInput = {
  name: string;
  price: number;
  category: ProductCategory;
  imageUrl?: string;
  barCode?: string;
};

type CreateProductOutput = {
  id: string;
  name: string;
  price: number;
  category: ProductCategory;
  imageUrl?: string;
  barCode?: string;
};

export class CreateProductUseCase {
  constructor(private productRepository: ProductRepository) { }

  async execute(input: CreateProductInput): Promise<CreateProductOutput> {
    if (!input.name || input.name.trim().length === 0) {
      throw new AppError("Nome do produto é obrigatório.", 400);
    }

    if (typeof input.price !== "number" || Number.isNaN(input.price) || input.price < 0) {
      throw new AppError("Preço inválido", 400);
    }

    const product = new Product({
      name: input.name,
      price: input.price,
      category: input.category,
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      ...(input.barCode ? { barCode: input.barCode } : {}),
    });

    await this.productRepository.save(product);

    return {
      id: product.id,
      name: product.name,
      price: product.price,
      category: product.category,
      ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
      ...(product.barCode ? { barCode: product.barCode } : {}),
    };
  }
}

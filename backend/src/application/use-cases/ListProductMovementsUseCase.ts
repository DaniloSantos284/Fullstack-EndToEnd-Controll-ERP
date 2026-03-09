import { ProductRepository } from "../../domain/repositories/ProductRepository";
import { StockMovementRepository } from "../../domain/repositories/StockMovementRepository";
import { StockMovement } from "../../domain/entities/StockMovement";
import { AppError } from "./errors/AppError";

type Input = { productId: string };

export class ListProductMovementsUseCase {
    constructor(
        private productRepository: ProductRepository,
        private stockMovementRepository: StockMovementRepository
    ) {}

    async execute(input: Input): Promise<StockMovement[]> {
        if (!input.productId || input.productId.trim().length === 0) {
            throw new AppError("Parâmetro productId inválido.", 400);
        }

        const product = await this.productRepository.findById(input.productId);
        if (!product) {
            throw new AppError("Produto não encontrado.", 404);
        }

        return this.stockMovementRepository.findByProductId(input.productId);
    }
}
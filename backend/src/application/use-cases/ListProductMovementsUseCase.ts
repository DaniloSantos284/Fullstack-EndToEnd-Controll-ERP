import { ProductRepository } from "../../domain/repositories/ProductRepository";
import { StockMovementRepository } from "../../domain/repositories/StockMovementRepository";
import { StockMovement } from "../../domain/entities/StockMovement";
import { AppError } from "./errors/AppError";
import { Paginated, Pagination, paginate } from "../pagination";

type Input = Pagination & { productId: string };

export class ListProductMovementsUseCase {
    constructor(
        private productRepository: ProductRepository,
        private stockMovementRepository: StockMovementRepository
    ) {}

    async execute(input: Input): Promise<Paginated<StockMovement>> {
        if (!input.productId || input.productId.trim().length === 0) {
            throw new AppError("Parâmetro productId inválido.", 400);
        }

        const product = await this.productRepository.findById(input.productId);
        if (!product) {
            throw new AppError("Produto não encontrado.", 404);
        }

        const movements = await this.stockMovementRepository.findPageByProductId(input.productId, input);
        return paginate(movements, input);
    }
}

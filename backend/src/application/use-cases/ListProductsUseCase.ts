import { ProductRepository } from "../../domain/repositories/ProductRepository";
import { ProductCategory } from "../../domain/enums/ProductCategory";


type ListProductsOutput = {
    id: string;
    name: string;
    price: number;
    category: ProductCategory;
    imageUrl: string | undefined;
    quantity: number;
};


export class ListProductsUseCase {
    constructor(
        private productRepository: ProductRepository
    ) {}

    async execute(): Promise<ListProductsOutput[]> {
        const products = await this.productRepository.findAll();

        return products.map(product => ({
            id: product.id,
            name: product.name,
            price: product.price,
            category: product.category,
            imageUrl: product.imageUrl,
            quantity: product.quantity, // Cálculo via movements
        }));
    }
}
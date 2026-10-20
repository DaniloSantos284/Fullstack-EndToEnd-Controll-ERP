import { ProductRepository } from "../../domain/repositories/ProductRepository";
import { ProductCategory } from "../../domain/enums/ProductCategory";
import { Paginated, Pagination, paginate } from "../pagination";


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

    async execute(pagination: Pagination): Promise<Paginated<ListProductsOutput>> {
        const products = await this.productRepository.findPage(pagination);

        return paginate(products.map(product => ({
            id: product.id,
            name: product.name,
            price: product.price,
            category: product.category,
            imageUrl: product.imageUrl,
            quantity: product.quantity,
        })), pagination);
    }
}

import { Product } from "../entities/Product";
import { Pagination } from "./Pagination";

export interface ProductRepository {
    save(product: Product): Promise<void>
    findById(id: string): Promise<Product | null>;
    findPage(pagination: Pagination): Promise<Product[]>;
}

import { db } from "../connection";
import { Product } from "../../../../domain/entities/Product";
import { ProductRepository } from "../../../../domain/repositories/ProductRepository";
import { ProductCategory } from "../../../../domain/enums/ProductCategory";
import { StockMovementRepository } from "../../../../domain/repositories/StockMovementRepository";
import { AppError } from "../../../../application/use-cases/errors/AppError";

export class MySqlProductRepository implements ProductRepository {
  constructor(
    private stockMovementRepository: StockMovementRepository
  ) {}

  async save(product: Product): Promise<void> {
    try {
      await db.execute(
        `
        INSERT INTO products (
          id,
          name,
          quantity,
          price,
          category,
          image_url,
          bar_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          product.id,
          product.name,
          product.quantity,
          product.price,
          product.category,
          product.imageUrl ?? null,
          product.barCode ?? null,
        ]
      );
    } catch (error) {
      throw new AppError("Erro ao salvar no DB", 400);
    }
  }

  async findById(id: string): Promise<Product | null> {
    try {
      const [rows] = await db.execute<any[]>(
        `
        SELECT *
        FROM products
        WHERE id = ?
        LIMIT 1
        `,
        [id]
      );

      if (rows.length === 0) {
        return null;
      }

      return this.mapRowToProduct(rows[0]);
    } catch (error) {
      throw new AppError("Erro ao procurar pelo id", 400);
    }
  }

  
  async findAll(): Promise<Product[]> {
    try {
      const [rows] = await db.execute<any[]>(
        `
        SELECT *
        FROM products
        `
      );

      const products: Product[] = [];

      for (const row of rows) {
        const product = await this.mapRowToProduct(row);
        products.push(product);
      }

      return products;
    } catch (error) {
      throw new AppError("Erro ao buscar produtos no banco", 400)
    }
  }

  /**
   * Método privado para reconstruir o agregado
   * Evita duplicação entre findById e findAll
   */
  private async mapRowToProduct(row: any): Promise<Product> {
    try {
      const product = new Product({
        name: row.name,
        price: row.price,
        category: row.category as ProductCategory,
        imageUrl: row.image_url ?? undefined,
        barCode: row.bar_code ?? undefined,
      });

      // Sobrescreve o UUID gerado no construtor
      (product as any).id = row.id;

      // Carrega os movimentos de estoque
      const movements =
        await this.stockMovementRepository.findByProductId(product.id);

      movements.forEach((movement) => {
        product.addMovement(movement);
      });

      return product;
    } catch (error) {
      throw new AppError("Erro ao buscar esse produto", 400);
    }
  }
}

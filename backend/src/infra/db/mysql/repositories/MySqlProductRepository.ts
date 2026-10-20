import type { RowDataPacket } from "mysql2/promise";
import { db } from "../connection";
import { Product } from "../../../../domain/entities/Product";
import { ProductRepository } from "../../../../domain/repositories/ProductRepository";
import { Pagination } from "../../../../domain/repositories/Pagination";
import { DomainError } from "../../../../domain/errors/DomainError";

type ProductRow = RowDataPacket & {
  id: string;
  name: string;
  quantity: number;
  price: number | string;
  category: string;
  image_url: string | null;
  bar_code: string | null;
};

export class MySqlProductRepository implements ProductRepository {
  async save(product: Product): Promise<void> {
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
        `${Math.floor(product.priceCents / 100)}.${String(product.priceCents % 100).padStart(2, "0")}`,
        product.category,
        product.imageUrl ?? null,
        product.barCode ?? null,
      ]
    );
  }

  async findById(id: string): Promise<Product | null> {
    const [rows] = await db.execute<ProductRow[]>(
      `
      SELECT id, name, quantity, price, category, image_url, bar_code
      FROM products
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return this.mapRowToProduct(row);
  }

  async findPage({ page, limit }: Pagination): Promise<Product[]> {
    const [rows] = await db.execute<ProductRow[]>(`
      SELECT id, name, quantity, price, category, image_url, bar_code
      FROM products
      ORDER BY id ASC
      LIMIT ? OFFSET ?
    `, [limit + 1, (page - 1) * limit]);

    return rows.map((row) => this.mapRowToProduct(row));
  }

  private mapRowToProduct(row: ProductRow): Product {
    try {
      return new Product({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        price: Number(row.price),
        category: row.category,
        ...(row.image_url === null ? {} : { imageUrl: row.image_url }),
        ...(row.bar_code === null ? {} : { barCode: row.bar_code }),
      });
    } catch (error) {
      if (error instanceof DomainError) {
        throw new Error("Invalid persisted product");
      }
      throw error;
    }
  }
}

import type { RowDataPacket } from "mysql2/promise";
import { db } from "../connection";
import { Product } from "../../../../domain/entities/Product";
import { ProductRepository } from "../../../../domain/repositories/ProductRepository";

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
        product.price,
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

  async findAll(): Promise<Product[]> {
    const [rows] = await db.execute<ProductRow[]>(`
      SELECT id, name, quantity, price, category, image_url, bar_code
      FROM products
      ORDER BY id ASC
    `);

    return rows.map((row) => this.mapRowToProduct(row));
  }

  private mapRowToProduct(row: ProductRow): Product {
    return new Product({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      price: Number(row.price),
      category: row.category,
      ...(row.image_url === null ? {} : { imageUrl: row.image_url }),
      ...(row.bar_code === null ? {} : { barCode: row.bar_code }),
    });
  }
}

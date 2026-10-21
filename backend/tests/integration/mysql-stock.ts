import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AddStockEntryUseCase } from "../../src/application/use-cases/AddStockEntryUseCase";
import { AddStockExitUseCase } from "../../src/application/use-cases/AddStockExitUseCase";
import { Product } from "../../src/domain/entities/Product";
import { StockMovement } from "../../src/domain/entities/StockMovement";
import { ProductCategory } from "../../src/domain/enums/ProductCategory";
import { StockMovementType } from "../../src/domain/enums/StockMovementType";
import { db } from "../../src/infra/db/mysql/connection";
import { MySqlProductRepository } from "../../src/infra/db/mysql/repositories/MySqlProductRepository";
import { MySqlStockMovementRepository } from "../../src/infra/db/mysql/repositories/MySqlStockMovementRepository";
import type { RowDataPacket } from "mysql2/promise";

type QuantityRow = RowDataPacket & { quantity: number };
type CountRow = RowDataPacket & { total: number };

async function main(): Promise<void> {
  const productId = randomUUID();
  const products = new MySqlProductRepository();
  const movements = new MySqlStockMovementRepository();
  const entry = new AddStockEntryUseCase(movements);
  const exit = new AddStockExitUseCase(movements);

  try {
    await products.save(new Product({
      id: productId,
      name: "Integration smoke product",
      price: 0.1,
      category: ProductCategory.OTHER,
    }));

    await entry.execute({ productId, quantity: 10 });
    const results = await Promise.allSettled([
      exit.execute({ productId, quantity: 7 }),
      exit.execute({ productId, quantity: 7 }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.equal(rejected?.status, "rejected");
    if (rejected?.status === "rejected") {
      assert.equal(rejected.reason.statusCode, 409);
    }

    const [balanceRows] = await db.execute<QuantityRow[]>(
      "SELECT quantity FROM products WHERE id = ?", [productId],
    );
    assert.equal(balanceRows[0]?.quantity, 3);

    const [countRows] = await db.execute<CountRow[]>(
      "SELECT COUNT(*) AS total FROM stock_movements WHERE product_id = ? AND type = 'out'",
      [productId],
    );
    assert.equal(countRows[0]?.total, 1);

    const page = await movements.findPageByProductId(productId, { page: 1, limit: 1 });
    assert.equal(page.length, 2); // limit + 1 proves the next page exists.

    const duplicateId = page[0]?.id;
    assert.ok(duplicateId);
    await assert.rejects(
      movements.applyMovement(new StockMovement({
        id: duplicateId,
        productId,
        type: StockMovementType.ENTRY,
        quantity: 1,
      })),
    );
    const [afterRollback] = await db.execute<QuantityRow[]>(
      "SELECT quantity FROM products WHERE id = ?", [productId],
    );
    assert.equal(afterRollback[0]?.quantity, 3);

    const saved = await products.findById(productId);
    assert.equal(saved?.priceCents, 10);
    const listed = await products.findPage({ page: 1, limit: 1 });
    assert.ok(listed.length >= 1 && listed.length <= 2);

    process.stdout.write("MySQL integration: concurrency, rollback, pagination and price passed.\n");
  } finally {
    try {
      await db.execute("DELETE FROM products WHERE id = ?", [productId]);
    } finally {
      await db.end();
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`MySQL integration failed: ${error instanceof Error ? error.name : String(error)}\n`);
  process.exitCode = 1;
});

-- Emit legacy-compatible only when it is safe for migrate.sh to run the
-- non-idempotent 001 SQL file.  This deliberately accepts repeatable data-only
-- repairs (timestamp normalization and quantity reconciliation), but rejects
-- any visible partial DDL such as a removed FK, added CHECK, or replaced index.
SELECT CASE WHEN
    (SELECT COUNT(*)
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN ('products', 'stock_movements')) = 2
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'id' AND data_type = 'varchar'
          AND character_maximum_length = 36 AND is_nullable = 'NO'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'name' AND data_type = 'varchar'
          AND character_maximum_length = 255 AND is_nullable = 'NO'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'quantity' AND data_type = 'int' AND is_nullable = 'NO'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'price' AND data_type = 'decimal'
          AND numeric_precision = 10 AND numeric_scale = 2 AND is_nullable = 'NO'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'category' AND data_type = 'varchar'
          AND character_maximum_length = 50 AND is_nullable = 'NO'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
          AND column_name = 'id' AND data_type = 'varchar'
          AND character_maximum_length = 36 AND is_nullable = 'NO'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
          AND column_name = 'product_id' AND data_type = 'varchar'
          AND character_maximum_length = 36 AND is_nullable = 'NO'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
          AND column_name = 'type' AND column_type = 'enum(''in'',''out'')' AND is_nullable = 'NO'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
          AND column_name = 'quantity' AND data_type = 'int' AND is_nullable = 'NO'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.referential_constraints AS rc
        JOIN information_schema.key_column_usage AS kcu
          ON kcu.constraint_schema = rc.constraint_schema
         AND kcu.table_name = rc.table_name
         AND kcu.constraint_name = rc.constraint_name
        WHERE rc.constraint_schema = DATABASE()
          AND rc.table_name = 'stock_movements'
          AND rc.constraint_name = 'fk_stock_movements_product'
          AND kcu.column_name = 'product_id'
          AND kcu.referenced_table_name = 'products'
          AND kcu.referenced_column_name = 'id'
    )
    AND (SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')
         FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
           AND index_name = 'idx_stock_movements_product_id') = 'product_id'
    AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE()
          AND constraint_name IN (
              'chk_products_quantity_nonnegative',
              'chk_products_price_nonnegative',
              'chk_products_name_nonblank',
              'chk_stock_movements_quantity_positive'
          )
    )
    AND NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
          AND index_name = 'idx_stock_movements_product_created_id'
    )
THEN 'legacy-compatible'
ELSE 'not-legacy-compatible'
END AS migration_001_legacy_state;

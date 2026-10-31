-- The migration marker is written only when this query emits verified.  Besides
-- the target schema, it checks the quantity invariant used by 001: quantity is
-- SUM(in) - SUM(out), and a product with no stock_movements has quantity zero.
SELECT CASE WHEN
    (SELECT COUNT(*)
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN ('products', 'stock_movements')
       AND engine = 'InnoDB'
       AND table_collation = 'utf8mb4_0900_ai_ci') = 2
    AND (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'products') = 9
    AND (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'stock_movements') = 5
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'id' AND data_type = 'varchar'
          AND character_maximum_length = 36 AND is_nullable = 'NO'
          AND collation_name = 'utf8mb4_0900_ai_ci'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'name' AND data_type = 'varchar'
          AND character_maximum_length = 255 AND is_nullable = 'NO'
          AND collation_name = 'utf8mb4_0900_ai_ci'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'quantity' AND data_type = 'int' AND is_nullable = 'NO'
          AND column_default = '0'
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
          AND column_name = 'category'
          AND column_type = 'enum(''FOOD'',''ELECTRONICS'',''CLOTHING'',''CLEANING'',''OFFICE'',''OTHER'')'
          AND is_nullable = 'NO'
          AND collation_name = 'utf8mb4_0900_ai_ci'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'image_url' AND data_type = 'varchar'
          AND character_maximum_length = 500 AND is_nullable = 'YES'
          AND collation_name = 'utf8mb4_0900_ai_ci'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'bar_code' AND data_type = 'varchar'
          AND character_maximum_length = 100 AND is_nullable = 'YES'
          AND collation_name = 'utf8mb4_0900_ai_ci'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'created_at' AND data_type = 'timestamp'
          AND datetime_precision = 3 AND is_nullable = 'NO'
          AND LOWER(column_default) = 'current_timestamp(3)'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'products'
          AND column_name = 'updated_at' AND data_type = 'timestamp'
          AND datetime_precision = 3 AND is_nullable = 'NO'
          AND LOWER(column_default) = 'current_timestamp(3)'
          AND LOCATE('on update current_timestamp(3)', LOWER(extra)) > 0
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
          AND column_name = 'id' AND data_type = 'varchar'
          AND character_maximum_length = 36 AND is_nullable = 'NO'
          AND collation_name = 'utf8mb4_0900_ai_ci'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
          AND column_name = 'product_id' AND data_type = 'varchar'
          AND character_maximum_length = 36 AND is_nullable = 'NO'
          AND collation_name = 'utf8mb4_0900_ai_ci'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
          AND column_name = 'type' AND column_type = 'enum(''in'',''out'')'
          AND is_nullable = 'NO' AND collation_name = 'utf8mb4_0900_ai_ci'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
          AND column_name = 'quantity' AND data_type = 'int' AND is_nullable = 'NO'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
          AND column_name = 'created_at' AND data_type = 'timestamp'
          AND datetime_precision = 3 AND is_nullable = 'NO'
          AND LOWER(column_default) = 'current_timestamp(3)'
    )
    AND (SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')
         FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'products'
           AND index_name = 'PRIMARY') = 'id'
    AND (SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')
         FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
           AND index_name = 'PRIMARY') = 'id'
    AND (SELECT GROUP_CONCAT(CONCAT(column_name, ':', collation)
                            ORDER BY seq_in_index SEPARATOR ',')
         FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
           AND index_name = 'idx_stock_movements_product_created_id') = 'product_id:A,created_at:D,id:D'
    AND NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'stock_movements'
          AND index_name = 'idx_stock_movements_product_id'
    )
    AND (SELECT COUNT(*) FROM information_schema.table_constraints
         WHERE constraint_schema = DATABASE() AND constraint_type = 'CHECK'
           AND ((table_name = 'products' AND constraint_name IN (
                    'chk_products_quantity_nonnegative',
                    'chk_products_price_nonnegative',
                    'chk_products_name_nonblank'))
                OR (table_name = 'stock_movements'
                    AND constraint_name = 'chk_stock_movements_quantity_positive'))) = 4
    AND EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = DATABASE()
          AND constraint_name = 'chk_products_quantity_nonnegative'
          AND REPLACE(REPLACE(REPLACE(REPLACE(LOWER(check_clause), '`', ''), ' ', ''), '(', ''), ')', '') = 'quantity>=0'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = DATABASE()
          AND constraint_name = 'chk_products_price_nonnegative'
          AND REPLACE(REPLACE(REPLACE(REPLACE(LOWER(check_clause), '`', ''), ' ', ''), '(', ''), ')', '') = 'price>=0'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = DATABASE()
          AND constraint_name = 'chk_products_name_nonblank'
          AND REPLACE(REPLACE(REPLACE(REPLACE(LOWER(check_clause), '`', ''), ' ', ''), '(', ''), ')', '') = 'char_lengthtrimname>0'
    )
    AND EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = DATABASE()
          AND constraint_name = 'chk_stock_movements_quantity_positive'
          AND REPLACE(REPLACE(REPLACE(REPLACE(LOWER(check_clause), '`', ''), ' ', ''), '(', ''), ')', '') = 'quantity>0'
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
          AND rc.delete_rule = 'CASCADE'
          AND kcu.column_name = 'product_id'
          AND kcu.referenced_table_name = 'products'
          AND kcu.referenced_column_name = 'id'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM products AS p
        LEFT JOIN (
            SELECT
                product_id,
                SUM(CASE type
                    WHEN 'in' THEN CAST(quantity AS DECIMAL(30, 0))
                    WHEN 'out' THEN -CAST(quantity AS DECIMAL(30, 0))
                    ELSE CAST(0 AS DECIMAL(30, 0))
                END) AS signed_history_balance
            FROM stock_movements
            GROUP BY product_id
        ) AS history ON history.product_id = p.id
        WHERE p.quantity <> COALESCE(history.signed_history_balance, 0)
    )
    AND NOT EXISTS (
        SELECT 1 FROM products
        WHERE quantity < 0 OR price < 0 OR CHAR_LENGTH(TRIM(name)) = 0
    )
    AND NOT EXISTS (
        SELECT 1 FROM stock_movements
        WHERE quantity <= 0
    )
    AND NOT EXISTS (
        SELECT 1 FROM stock_movements AS sm
        LEFT JOIN products AS p ON p.id = sm.product_id
        WHERE p.id IS NULL
    )
THEN 'verified'
ELSE 'not-verified'
END AS migration_001_verification;

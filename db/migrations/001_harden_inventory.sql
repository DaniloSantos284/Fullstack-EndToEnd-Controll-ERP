-- MySQL 9.7 one-time hardening migration for deployments created by the old db/init.sql.
-- WARNING: Take and verify a backup before running this migration. Run the read-only
-- preflight queries below first, remediate every row from the non-remediable
-- checks, and only then execute the APPLY section during a maintenance window.
-- NULL timestamp results are remediated by APPLY. DDL in this migration is not
-- transactional. This script is intentionally non-idempotent and must be run once.

-- PREFLIGHT: Names must remain nonblank after trimming and fit VARCHAR(255).
SELECT
    id,
    name,
    CHAR_LENGTH(TRIM(name)) AS trimmed_name_length
FROM products
WHERE name IS NULL
   OR CHAR_LENGTH(TRIM(name)) = 0
   OR CHAR_LENGTH(TRIM(name)) > 255;

-- PREFLIGHT: DECIMAL(10,2) accepts values from -99999999.99 through 99999999.99;
-- the final schema additionally requires nonnegative prices.
SELECT
    id,
    price
FROM products
WHERE price IS NULL
   OR price < 0
   OR price > 99999999.99;

-- PREFLIGHT: Categories must match one of the final ENUM values exactly.
SELECT
    id,
    category
FROM products
WHERE category IS NULL
   OR CAST(category AS BINARY) NOT IN (
       CAST('FOOD' AS BINARY),
       CAST('ELECTRONICS' AS BINARY),
       CAST('CLOTHING' AS BINARY),
       CAST('CLEANING' AS BINARY),
       CAST('OFFICE' AS BINARY),
       CAST('OTHER' AS BINARY)
   );

-- PREFLIGHT: Final movement quantities must be strictly positive.
SELECT
    id,
    product_id,
    quantity
FROM stock_movements
WHERE quantity IS NULL
   OR quantity <= 0;

-- PREFLIGHT: The recomputed signed balance must fit a nonnegative signed INT.
SELECT
    p.id,
    COALESCE(
        SUM(
            CASE sm.type
                WHEN 'in' THEN CAST(sm.quantity AS DECIMAL(30, 0))
                WHEN 'out' THEN -CAST(sm.quantity AS DECIMAL(30, 0))
                ELSE CAST(0 AS DECIMAL(30, 0))
            END
        ),
        CAST(0 AS DECIMAL(30, 0))
    ) AS signed_history_balance
FROM products AS p
LEFT JOIN stock_movements AS sm ON sm.product_id = p.id
GROUP BY p.id
HAVING signed_history_balance < 0
    OR signed_history_balance > 2147483647;

-- PREFLIGHT: NULL product timestamps are remediable. In APPLY, a NULL created_at
-- receives CURRENT_TIMESTAMP(3); a NULL updated_at receives its created_at when
-- available, otherwise the same CURRENT_TIMESTAMP(3) fallback.
SELECT
    id,
    created_at,
    updated_at
FROM products
WHERE created_at IS NULL
   OR updated_at IS NULL;

-- PREFLIGHT: NULL movement timestamps are remediable. In APPLY, each receives
-- CURRENT_TIMESTAMP(3) as its fallback timestamp.
SELECT
    id,
    product_id,
    created_at
FROM stock_movements
WHERE created_at IS NULL;

-- Guard the non-remediable preconditions before any inventory data or schema
-- change. The preflight SELECT statements above identify the exact offending rows.
DROP PROCEDURE IF EXISTS assert_001_harden_inventory_preconditions;

DELIMITER //
CREATE PROCEDURE assert_001_harden_inventory_preconditions()
BEGIN
    IF EXISTS (
        SELECT 1
        FROM products
        WHERE name IS NULL
           OR CHAR_LENGTH(TRIM(name)) = 0
           OR CHAR_LENGTH(TRIM(name)) > 255
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '001_harden_inventory aborted: invalid product name';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM products
        WHERE price IS NULL
           OR price < 0
           OR price > 99999999.99
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '001_harden_inventory aborted: invalid product price';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM products
        WHERE category IS NULL
           OR CAST(category AS BINARY) NOT IN (
               CAST('FOOD' AS BINARY),
               CAST('ELECTRONICS' AS BINARY),
               CAST('CLOTHING' AS BINARY),
               CAST('CLEANING' AS BINARY),
               CAST('OFFICE' AS BINARY),
               CAST('OTHER' AS BINARY)
           )
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '001_harden_inventory aborted: invalid product category';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM stock_movements
        WHERE quantity IS NULL
           OR quantity <= 0
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '001_harden_inventory aborted: invalid movement quantity';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT
                p.id,
                COALESCE(
                    SUM(
                        CASE sm.type
                            WHEN 'in' THEN CAST(sm.quantity AS DECIMAL(30, 0))
                            WHEN 'out' THEN -CAST(sm.quantity AS DECIMAL(30, 0))
                            ELSE CAST(0 AS DECIMAL(30, 0))
                        END
                    ),
                    CAST(0 AS DECIMAL(30, 0))
                ) AS signed_history_balance
            FROM products AS p
            LEFT JOIN stock_movements AS sm ON sm.product_id = p.id
            GROUP BY p.id
            HAVING signed_history_balance < 0
                OR signed_history_balance > 2147483647
        ) AS invalid_balances
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '001_harden_inventory aborted: signed balance outside INT range';
    END IF;
END//
DELIMITER ;

CALL assert_001_harden_inventory_preconditions();
DROP PROCEDURE assert_001_harden_inventory_preconditions;

-- APPLY: NULL timestamps above are repaired before any destructive DDL or FK drop.
UPDATE products
SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP(3)),
    created_at = COALESCE(created_at, CURRENT_TIMESTAMP(3))
WHERE created_at IS NULL
   OR updated_at IS NULL;

UPDATE stock_movements
SET created_at = CURRENT_TIMESTAMP(3)
WHERE created_at IS NULL;

-- Recompute the canonical balance before adding its nonnegative CHECK constraint.
UPDATE products AS p
LEFT JOIN (
    SELECT
        product_id,
        SUM(
            CASE type
                WHEN 'in' THEN CAST(quantity AS DECIMAL(30, 0))
                WHEN 'out' THEN -CAST(quantity AS DECIMAL(30, 0))
                ELSE CAST(0 AS DECIMAL(30, 0))
            END
        ) AS signed_history_balance
    FROM stock_movements
    GROUP BY product_id
) AS history ON history.product_id = p.id
SET p.quantity = COALESCE(history.signed_history_balance, 0);

-- The FK is temporarily removed so both character FK columns can be converted.
ALTER TABLE stock_movements
    DROP FOREIGN KEY fk_stock_movements_product;

ALTER TABLE products
    CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE products
    ENGINE = InnoDB;

ALTER TABLE stock_movements
    CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE stock_movements
    ENGINE = InnoDB;

ALTER TABLE products
    MODIFY COLUMN id VARCHAR(36) NOT NULL,
    MODIFY COLUMN name VARCHAR(255) NOT NULL,
    MODIFY COLUMN quantity INT NOT NULL DEFAULT 0,
    MODIFY COLUMN price DECIMAL(10, 2) NOT NULL,
    MODIFY COLUMN category ENUM('FOOD', 'ELECTRONICS', 'CLOTHING', 'CLEANING', 'OFFICE', 'OTHER') NOT NULL,
    MODIFY COLUMN image_url VARCHAR(500) NULL,
    MODIFY COLUMN bar_code VARCHAR(100) NULL,
    MODIFY COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE stock_movements
    MODIFY COLUMN id VARCHAR(36) NOT NULL,
    MODIFY COLUMN product_id VARCHAR(36) NOT NULL,
    MODIFY COLUMN type ENUM('in', 'out') NOT NULL,
    MODIFY COLUMN quantity INT NOT NULL,
    MODIFY COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE products
    ADD CONSTRAINT chk_products_quantity_nonnegative CHECK (quantity >= 0),
    ADD CONSTRAINT chk_products_price_nonnegative CHECK (price >= 0),
    ADD CONSTRAINT chk_products_name_nonblank CHECK (CHAR_LENGTH(TRIM(name)) > 0);

ALTER TABLE stock_movements
    ADD CONSTRAINT chk_stock_movements_quantity_positive CHECK (quantity > 0),
    ADD CONSTRAINT fk_stock_movements_product
        FOREIGN KEY (product_id)
        REFERENCES products (id)
        ON DELETE CASCADE;

-- Add the FK-compatible replacement before removing the old single-column index.
ALTER TABLE stock_movements
    ADD INDEX idx_stock_movements_product_created_id (product_id, created_at DESC, id DESC);

ALTER TABLE stock_movements
    DROP INDEX idx_stock_movements_product_id;

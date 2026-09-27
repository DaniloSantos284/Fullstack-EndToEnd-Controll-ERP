#!/bin/sh

set -eu

: "${MYSQL_HOST:=db}"
: "${MYSQL_PORT:=3306}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE must be set}"
: "${MYSQL_USER:?MYSQL_USER must be set}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD must be set}"

export MYSQL_PWD="$MYSQL_PASSWORD"

mysql_exec() {
    mysql \
        --protocol=TCP \
        --host="$MYSQL_HOST" \
        --port="$MYSQL_PORT" \
        --user="$MYSQL_USER" \
        --database="$MYSQL_DATABASE" \
        "$@"
}

mysql_exec --execute "
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"

version="$(mysql_exec --batch --skip-column-names --execute \
    "SELECT version FROM schema_migrations WHERE version = '001_harden_inventory' LIMIT 1;")"

if [ "$version" = "001_harden_inventory" ]; then
    echo "Migration 001_harden_inventory is already recorded; skipping."
    exit 0
fi

if [ -n "$version" ]; then
    echo "Unexpected schema_migrations result for 001_harden_inventory." >&2
    exit 1
fi

echo "Applying migration 001_harden_inventory."
mysql_exec < /migrations/001_harden_inventory.sql

mysql_exec --execute "
    INSERT INTO schema_migrations (version)
    VALUES ('001_harden_inventory');
"

echo "Migration 001_harden_inventory applied and recorded."

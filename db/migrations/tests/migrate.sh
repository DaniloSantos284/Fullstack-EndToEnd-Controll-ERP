#!/bin/sh

# Real-MySQL integration test for migrate.sh.
#
# Required contract:
#   MYSQL_TEST_USER, MYSQL_TEST_PASSWORD, MYSQL_TEST_DATABASE
# Optional contract:
#   MYSQL_TEST_HOST (default 127.0.0.1), MYSQL_TEST_PORT (default 3306)
#
# The supplied user needs CREATE, ALTER, DROP, INDEX, REFERENCES, and DML on
# MYSQL_TEST_DATABASE.  The test drops only products, stock_movements, and
# schema_migrations in that database.  It never creates or drops a database.

set -eu

: "${MYSQL_TEST_HOST:=127.0.0.1}"
: "${MYSQL_TEST_PORT:=3306}"
: "${MYSQL_TEST_DATABASE:?MYSQL_TEST_DATABASE must be set}"
: "${MYSQL_TEST_USER:?MYSQL_TEST_USER must be set}"
: "${MYSQL_TEST_PASSWORD:?MYSQL_TEST_PASSWORD must be set}"

migrations_dir=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
test_tmp=$(mktemp -d)

cleanup() {
    status=$?
    rm -rf "$test_tmp"
    exit "$status"
}
trap cleanup 0 1 2 3 15

mysql_test() {
    MYSQL_PWD="$MYSQL_TEST_PASSWORD" mysql \
        --protocol=TCP \
        --host="$MYSQL_TEST_HOST" \
        --port="$MYSQL_TEST_PORT" \
        --user="$MYSQL_TEST_USER" \
        --database="$MYSQL_TEST_DATABASE" \
        "$@"
}

run_migrator() {
    MYSQL_HOST="$MYSQL_TEST_HOST" \
    MYSQL_PORT="$MYSQL_TEST_PORT" \
    MYSQL_DATABASE="$MYSQL_TEST_DATABASE" \
    MYSQL_USER="$MYSQL_TEST_USER" \
    MYSQL_PASSWORD="$MYSQL_TEST_PASSWORD" \
    MYSQL_MIGRATIONS_DIR="$migrations_dir" \
    sh "$migrations_dir/migrate.sh"
}

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

assert_eq() {
    expected=$1
    actual=$2
    description=$3

    [ "$actual" = "$expected" ] || fail "$description (expected '$expected', got '$actual')"
}

assert_contains() {
    needle=$1
    haystack=$2
    description=$3

    case "$haystack" in
        *"$needle"*) ;;
        *) fail "$description (missing '$needle')" ;;
    esac
}

scalar() {
    mysql_test --batch --skip-column-names --execute "$1"
}

reset_legacy_schema() {
    mysql_test --execute '
        SET FOREIGN_KEY_CHECKS = 0;
        DROP TABLE IF EXISTS schema_migrations;
        DROP TABLE IF EXISTS stock_movements;
        DROP TABLE IF EXISTS products;
        SET FOREIGN_KEY_CHECKS = 1;
    '
    mysql_test < "$migrations_dir/fixtures/legacy-pre-001-harden-inventory.sql"

    # Canonical quantity semantics are signed history, not the legacy value:
    # 12 in - 3 out = 9.  The product without any history must become zero.
    mysql_test --execute "
        INSERT INTO products (id, name, quantity, price, category)
        VALUES
            ('history-product', 'History product', 777, 10.00, 'FOOD'),
            ('no-history-product', 'No history product', 444, 20.00, 'OFFICE');
        INSERT INTO stock_movements (id, product_id, type, quantity)
        VALUES
            ('movement-in', 'history-product', 'in', 12),
            ('movement-out', 'history-product', 'out', 3);
    "
}

assert_migrated_state() {
    assert_eq 1 "$(scalar "SELECT COUNT(*) FROM schema_migrations WHERE version = '001_harden_inventory';")" \
        'migration marker count'
    assert_eq 'history-product:9,no-history-product:0' \
        "$(scalar "SELECT GROUP_CONCAT(CONCAT(id, ':', quantity) ORDER BY id SEPARATOR ',') FROM products;")" \
        'quantity reconciliation, including product without history'
}

echo '1/4 normal migration and quantity reconciliation'
reset_legacy_schema
normal_output=$(run_migrator)
assert_contains 'Migration 001_harden_inventory applied and recorded.' "$normal_output" 'normal migration result'
assert_migrated_state

echo '2/4 recorded rerun verifies and skips'
rerun_output=$(run_migrator)
assert_contains 'already recorded and verified; skipping.' "$rerun_output" 'rerun result'
assert_migrated_state

echo '3/4 interruption after SQL before marker recovers from verified state'
reset_legacy_schema
set +e
MYSQL_HOST="$MYSQL_TEST_HOST" \
MYSQL_PORT="$MYSQL_TEST_PORT" \
MYSQL_DATABASE="$MYSQL_TEST_DATABASE" \
MYSQL_USER="$MYSQL_TEST_USER" \
MYSQL_PASSWORD="$MYSQL_TEST_PASSWORD" \
MYSQL_MIGRATIONS_DIR="$migrations_dir" \
MYSQL_MIGRATION_TEST_MODE=1 \
MYSQL_MIGRATION_TEST_FAILPOINT=after_apply_before_marker \
sh "$migrations_dir/migrate.sh" > "$test_tmp/failpoint.log" 2>&1
failpoint_status=$?
set -e
assert_eq 86 "$failpoint_status" 'test failpoint exit status'
assert_eq 0 "$(scalar "SELECT COUNT(*) FROM schema_migrations WHERE version = '001_harden_inventory';")" \
    'marker must be absent after failpoint'
recovery_output=$(run_migrator)
assert_contains 'already applied without a marker; verified and recording recovery marker.' "$recovery_output" 'recovery result'
assert_migrated_state

echo '4/4 concurrent runner times out while the same-session lock is held'
reset_legacy_schema
MYSQL_HOST="$MYSQL_TEST_HOST" \
MYSQL_PORT="$MYSQL_TEST_PORT" \
MYSQL_DATABASE="$MYSQL_TEST_DATABASE" \
MYSQL_USER="$MYSQL_TEST_USER" \
MYSQL_PASSWORD="$MYSQL_TEST_PASSWORD" \
MYSQL_MIGRATIONS_DIR="$migrations_dir" \
MYSQL_MIGRATION_TEST_MODE=1 \
MYSQL_MIGRATION_TEST_HOLD_LOCK_SECONDS=5 \
sh "$migrations_dir/migrate.sh" > "$test_tmp/runner-one.log" 2>&1 &
runner_one_pid=$!

attempt=0
while ! grep -F 'Acquired inventory migration lock.' "$test_tmp/runner-one.log" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 10 ]; then
        wait "$runner_one_pid" || :
        fail 'first runner did not acquire the migration lock'
    fi
    sleep 1
done

set +e
MYSQL_HOST="$MYSQL_TEST_HOST" \
MYSQL_PORT="$MYSQL_TEST_PORT" \
MYSQL_DATABASE="$MYSQL_TEST_DATABASE" \
MYSQL_USER="$MYSQL_TEST_USER" \
MYSQL_PASSWORD="$MYSQL_TEST_PASSWORD" \
MYSQL_MIGRATIONS_DIR="$migrations_dir" \
MYSQL_MIGRATION_LOCK_TIMEOUT=1 \
sh "$migrations_dir/migrate.sh" > "$test_tmp/runner-two.log" 2>&1
runner_two_status=$?
set -e
[ "$runner_two_status" -ne 0 ] || fail 'second runner unexpectedly acquired the migration lock'
assert_contains 'Could not acquire the inventory migration lock within 1s.' \
    "$(cat "$test_tmp/runner-two.log")" 'second runner lock timeout'
wait "$runner_one_pid"
assert_migrated_state

echo 'PASS: db/migrations/tests/migrate.sh'

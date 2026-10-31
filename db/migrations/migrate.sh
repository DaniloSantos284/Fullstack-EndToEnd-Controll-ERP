#!/bin/sh

set -eu

: "${MYSQL_HOST:=db}"
: "${MYSQL_PORT:=3306}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE must be set}"
: "${MYSQL_USER:?MYSQL_USER must be set}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD must be set}"
: "${MYSQL_MIGRATION_LOCK_TIMEOUT:=120}"
: "${MYSQL_MIGRATIONS_DIR:=/migrations}"
: "${MYSQL_MIGRATION_TEST_MODE:=}"
: "${MYSQL_MIGRATION_TEST_FAILPOINT:=}"
: "${MYSQL_MIGRATION_TEST_HOLD_LOCK_SECONDS:=0}"

case "$MYSQL_MIGRATION_LOCK_TIMEOUT" in
    0|*[!0-9]*)
        echo "MYSQL_MIGRATION_LOCK_TIMEOUT must be a positive integer." >&2
        exit 1
        ;;
esac

case "$MYSQL_MIGRATION_TEST_MODE" in
    '')
        if [ -n "$MYSQL_MIGRATION_TEST_FAILPOINT" ] || [ "$MYSQL_MIGRATION_TEST_HOLD_LOCK_SECONDS" != 0 ]; then
            echo "MYSQL_MIGRATION_TEST_* controls require MYSQL_MIGRATION_TEST_MODE=1." >&2
            exit 1
        fi
        ;;
    1)
        case "$MYSQL_MIGRATION_TEST_FAILPOINT" in
            ''|after_apply_before_marker)
                ;;
            *)
                echo "Unsupported MYSQL_MIGRATION_TEST_FAILPOINT: $MYSQL_MIGRATION_TEST_FAILPOINT" >&2
                exit 1
                ;;
        esac
        case "$MYSQL_MIGRATION_TEST_HOLD_LOCK_SECONDS" in
            *[!0-9]*)
                echo "MYSQL_MIGRATION_TEST_HOLD_LOCK_SECONDS must be a non-negative integer." >&2
                exit 1
                ;;
        esac
        ;;
    *)
        echo "MYSQL_MIGRATION_TEST_MODE must be empty or 1." >&2
        exit 1
        ;;
esac

migration_file="$MYSQL_MIGRATIONS_DIR/001_harden_inventory.sql"
verification_file="$MYSQL_MIGRATIONS_DIR/001_harden_inventory.verify.sql"
legacy_file="$MYSQL_MIGRATIONS_DIR/001_harden_inventory.legacy.sql"

for required_file in "$migration_file" "$verification_file" "$legacy_file"; do
    if [ ! -r "$required_file" ]; then
        echo "Required migration file is not readable: $required_file" >&2
        exit 1
    fi
done

export MYSQL_PWD="$MYSQL_PASSWORD"

mysql_pid=''
session_dir=''
input_open=no
output_open=no

cleanup() {
    status=$?

    trap - 0
    trap '' 1 2 15

    if [ -n "$mysql_pid" ]; then
        kill "$mysql_pid" 2>/dev/null || :
        wait "$mysql_pid" 2>/dev/null || :
    fi

    if [ "$input_open" = yes ]; then
        exec 3>&-
    fi
    if [ "$output_open" = yes ]; then
        exec 4<&-
    fi
    if [ -n "$session_dir" ]; then
        rm -rf "$session_dir"
    fi

    exit "$status"
}

trap cleanup 0
trap 'exit 129' 1
trap 'exit 130' 2
trap 'exit 143' 15

mysql_read_until() {
    marker=$1
    mysql_result=''

    while IFS= read -r line <&4; do
        if [ "$line" = "$marker" ]; then
            return 0
        fi
        mysql_result=$line
    done

    echo "MySQL session ended before receiving $marker." >&2
    return 1
}

mysql_drain() {
    while IFS= read -r _line <&4; do
        :
    done
}

mysql_send_sql() {
    for statement in "$@"; do
        printf '%s\n' "$statement" >&3
    done
}

mysql_send_file() {
    cat "$1" >&3
}

verify_post_migration_state() {
    verify_marker='__migration_verification_complete__'

    mysql_send_file "$verification_file"
    mysql_send_sql "SELECT '$verify_marker';"
    mysql_read_until "$verify_marker"
    post_migration_state=$mysql_result
}

verify_legacy_compatible_state() {
    legacy_marker='__migration_legacy_check_complete__'

    mysql_send_file "$legacy_file"
    mysql_send_sql "SELECT '$legacy_marker';"
    mysql_read_until "$legacy_marker"
    legacy_state=$mysql_result
}

test_hold_lock_if_requested() {
    if [ "$MYSQL_MIGRATION_TEST_MODE" = 1 ] && [ "$MYSQL_MIGRATION_TEST_HOLD_LOCK_SECONDS" -gt 0 ]; then
        echo "Test-only: holding migration lock for ${MYSQL_MIGRATION_TEST_HOLD_LOCK_SECONDS}s."
        sleep "$MYSQL_MIGRATION_TEST_HOLD_LOCK_SECONDS"
    fi
}

test_fail_if_requested() {
    if [ "$MYSQL_MIGRATION_TEST_MODE" = 1 ] && [ "$MYSQL_MIGRATION_TEST_FAILPOINT" = after_apply_before_marker ]; then
        echo "Test-only failpoint after_apply_before_marker triggered." >&2
        exit 86
    fi
}

release_lock_and_close_session() {
    release_marker='__migration_lock_released__'

    mysql_send_sql \
        "SELECT RELEASE_LOCK(SHA2(CONCAT('schema_migrations:', DATABASE()), 256));" \
        "SELECT '$release_marker';"
    mysql_read_until "$release_marker"
    if [ "$mysql_result" != 1 ]; then
        echo "Migration lock was not owned by the active MySQL session." >&2
        return 1
    fi

    exec 3>&-
    input_open=no
    mysql_drain
    wait "$mysql_pid"
    mysql_pid=''
    exec 4<&-
    output_open=no
}

session_dir="$(mktemp -d)"
input_fifo="$session_dir/input"
output_fifo="$session_dir/output"
mkfifo "$input_fifo" "$output_fifo"

mysql \
    --protocol=TCP \
    --host="$MYSQL_HOST" \
    --port="$MYSQL_PORT" \
    --user="$MYSQL_USER" \
    --database="$MYSQL_DATABASE" \
    --batch \
    --skip-column-names \
    --unbuffered \
    < "$input_fifo" > "$output_fifo" &
mysql_pid=$!

exec 3> "$input_fifo"
input_open=yes
exec 4< "$output_fifo"
output_open=yes

lock_marker='__migration_lock_acquired__'
mysql_send_sql \
    "SELECT GET_LOCK(SHA2(CONCAT('schema_migrations:', DATABASE()), 256), $MYSQL_MIGRATION_LOCK_TIMEOUT);" \
    "SELECT '$lock_marker';"
mysql_read_until "$lock_marker"

if [ "$mysql_result" != '1' ]; then
    echo "Could not acquire the inventory migration lock within ${MYSQL_MIGRATION_LOCK_TIMEOUT}s." >&2
    exit 1
fi

echo "Acquired inventory migration lock."
test_hold_lock_if_requested

check_marker='__migration_check_complete__'
mysql_send_sql \
    "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(64) NOT NULL, applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (version)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;" \
    "SELECT version FROM schema_migrations WHERE version = '001_harden_inventory' LIMIT 1;" \
    "SELECT '$check_marker';"
mysql_read_until "$check_marker"

version=$mysql_result

if [ -n "$version" ] && [ "$version" != "001_harden_inventory" ]; then
    echo "Unexpected schema_migrations result for 001_harden_inventory." >&2
    exit 1
fi

# The marker alone is never enough: it may have been inserted before a manual
# change, and its absence may mean a previous runner completed the DDL but was
# interrupted before the marker statement.  The verification query checks both
# final schema invariants and the canonical inventory-balance data invariant.
verify_post_migration_state

if [ "$version" = "001_harden_inventory" ]; then
    if [ "$post_migration_state" != verified ]; then
        echo "Migration 001_harden_inventory is recorded but its schema/data invariants do not hold; refusing to continue." >&2
        exit 1
    fi
    record_marker=no
    result_message='Migration 001_harden_inventory is already recorded and verified; skipping.'
elif [ "$post_migration_state" = verified ]; then
    record_marker=yes
    result_message='Migration 001_harden_inventory was already applied without a marker; verified and recording recovery marker.'
else
    # 001 contains non-transactional DDL.  It is only safe to retry while the
    # schema is still legacy-compatible (data-only repair is safe to repeat).
    # A state that is neither verified nor legacy-compatible is treated as a
    # partially applied DDL migration and fails closed for manual recovery.
    verify_legacy_compatible_state
    if [ "$legacy_state" != legacy-compatible ]; then
        echo "Migration 001_harden_inventory is neither verified nor legacy-compatible; it may be partially applied. Restore or repair it manually before retrying." >&2
        exit 1
    fi

    echo "Applying migration 001_harden_inventory."
    apply_marker='__migration_apply_complete__'
    mysql_send_file "$migration_file"
    mysql_send_sql "SELECT '$apply_marker';"
    mysql_read_until "$apply_marker"

    verify_post_migration_state
    if [ "$post_migration_state" != verified ]; then
        echo "Migration 001_harden_inventory completed without satisfying its schema/data invariants; refusing to record it." >&2
        exit 1
    fi

    # Test-only interruption simulation.  Production cannot enable this
    # unless MYSQL_MIGRATION_TEST_MODE=1 was explicitly supplied.
    test_fail_if_requested

    record_marker=yes
    result_message='Migration 001_harden_inventory applied and recorded.'
fi

if [ "$record_marker" = yes ]; then
    record_complete_marker='__migration_record_complete__'
    mysql_send_sql \
        "INSERT INTO schema_migrations (version) VALUES ('001_harden_inventory');" \
        "SELECT version FROM schema_migrations WHERE version = '001_harden_inventory' LIMIT 1;" \
        "SELECT '$record_complete_marker';"
    mysql_read_until "$record_complete_marker"
    if [ "$mysql_result" != 001_harden_inventory ]; then
        echo "Migration 001_harden_inventory marker was not recorded." >&2
        exit 1
    fi
fi

release_lock_and_close_session

echo "$result_message"

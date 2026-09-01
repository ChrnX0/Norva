#!/usr/bin/env bash
#
# Runs the migrations against a throwaway Postgres and checks that the
# guarantees the schema is supposed to enforce actually hold.
#
# "The tables were created" proves nothing. What matters is behaviour:
#   1. The ledger really is append-only - UPDATE and DELETE must be refused.
#   2. A purchase really does move the moving average, at full precision.
#   3. A product cannot exist half-manufactured - a recipe without a portion
#      size cannot say what one unit costs, so the database refuses it.
#
# Needs a local postgres (any recent version) and psql. Nothing is left running.

set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/tmp/norva-verify-db}"
PGPORT="${PGPORT:-55432}"
SOCKET_DIR=/tmp
DB=norva_verify

# Postgres refuses to run as root, which is common in containers and CI. When
# that is the case, drop to an unprivileged user for the server process only.
if [ "$(id -u)" = "0" ]; then
  PG_USER="${PG_USER:-pgverify}"
  id -u "$PG_USER" >/dev/null 2>&1 || useradd -m "$PG_USER"
  as_pg() { su "$PG_USER" -c "$*"; }
else
  as_pg() { bash -c "$*"; }
fi

cleanup() {
  as_pg "$PGBIN/pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
}
trap cleanup EXIT

echo "==> starting a throwaway postgres on port $PGPORT"
rm -rf "$PGDATA"
mkdir -p "$PGDATA"
chmod 700 "$PGDATA"
[ "$(id -u)" = "0" ] && chown -R "$PG_USER" "$PGDATA"
as_pg "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
as_pg "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -k $SOCKET_DIR' -l /tmp/norva-verify.log start" >/dev/null
sleep 3

psql() { command psql -h "$SOCKET_DIR" -p "$PGPORT" -U postgres "$@"; }

psql -q -c "create database $DB;"

# Supabase supplies auth.users and auth.uid(). Stub them so the migrations run
# byte-for-byte as they will in production, without editing them for the test.
psql -d "$DB" -q <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
insert into auth.users (id) values ('00000000-0000-4000-8000-000000000001');
SQL

echo "==> applying migrations"
for file in supabase/migrations/*.sql; do
  echo "    $file"
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$file"
done

echo "==> seeding one company, one item, one movement"
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into companies (id, name)
  values ('00000000-0000-4000-8000-0000000000c1', 'Verify Co');
insert into locations (id, company_id, kind, name, capacity_crates)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
          'cold_room', 'Cold room', 120);
insert into items (id, company_id, kind, name, purchase_unit, purchase_to_base)
  values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1',
          'input', 'Sugar', '25kg sack', 25000);
insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id,
                       quantity_base_units, location_id)
  values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1',
          'production', now(), '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-0000000000b1', 4800,
          '00000000-0000-4000-8000-0000000000a1');
SQL

fail() { echo "FAIL: $1"; exit 1; }

echo "==> check 1: the ledger refuses UPDATE and DELETE"
if psql -d "$DB" -q -c "update movements set quantity_base_units = 99999;" >/dev/null 2>&1; then
  fail "the ledger accepted an UPDATE - it is not append-only"
fi
if psql -d "$DB" -q -c "delete from movements;" >/dev/null 2>&1; then
  fail "the ledger accepted a DELETE - it is not append-only"
fi
balance=$(psql -d "$DB" -Atc "select base_units from stock_balances;")
[ "$balance" = "4800" ] || fail "balance changed after the refused mutations (got $balance)"
echo "    refused both, balance intact at $balance"

echo "==> check 2: a purchase moves the moving average, keeping precision"
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into purchases (id, company_id, ordered_at, received_at, created_by)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1',
          now() - interval '6 days', now(), '00000000-0000-4000-8000-000000000001');
-- 100 kg at R$ 4.72/kg, then 100 kg at R$ 5.90/kg
insert into purchase_lines (company_id, purchase_id, item_id, purchase_quantity, base_units, total_cents)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1',
          '00000000-0000-4000-8000-0000000000b1', 4, 100000, 47200);
insert into purchase_lines (company_id, purchase_id, item_id, purchase_quantity, base_units, total_cents)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1',
          '00000000-0000-4000-8000-0000000000b1', 4, 100000, 59000);
SQL

average=$(psql -d "$DB" -Atc "select round(average_rate, 3) from item_costs;")
[ "$average" = "0.531" ] || fail "expected the average to land at 0.531 cents/g, got $average"

last=$(psql -d "$DB" -Atc "select round(last_rate, 3) from item_costs;")
[ "$last" = "0.590" ] || fail "expected the last price to be 0.590 cents/g, got $last"

history=$(psql -d "$DB" -Atc "select count(*) from item_cost_history;")
[ "$history" = "2" ] || fail "price history should have written itself twice, got $history"

echo "    average $average, last $last, $history history rows written on their own"

echo "==> check 3: a product cannot be half-manufactured"
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into items (id, company_id, kind, name, base_unit)
  values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c1',
          'product', 'Popsicle', 'un');
insert into recipes (id, company_id, name, yield_amount, yield_unit)
  values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1',
          'Strawberry mix', 40000, 'ml');
SQL

# A recipe with no portion size cannot say what one unit costs, and a portion
# size with no recipe has nothing to take a portion of. Either both or neither.
if psql -d "$DB" -q -c "insert into products (company_id, item_id, recipe_id)
    values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2',
            '00000000-0000-4000-8000-0000000000f1');" >/dev/null 2>&1; then
  fail "a product was accepted with a recipe but no portion size"
fi

psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "insert into products (company_id, item_id, recipe_id, yield_per_unit, unit_packaging_cents)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2',
          '00000000-0000-4000-8000-0000000000f1', 75, 5);"

unit=$(psql -d "$DB" -Atc "select base_unit from items where id = '00000000-0000-4000-8000-0000000000b2';")
[ "$unit" = "un" ] || fail "expected the base unit to survive the insert, got $unit"
echo "    half-manufactured product refused, complete one accepted in $unit"
echo
echo "OK - migrations apply and all three guarantees hold."

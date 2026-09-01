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
#   4. One company cannot read another's rows, and someone without view_cost
#      gets a null where the money is - enforced by the policy, in the query,
#      not by hiding a control in the interface.
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
-- Supabase derives auth.uid() from the request's JWT. Here it reads a settable
-- GUC instead, which is what lets check 4 below run a query *as a given user*
-- and watch row level security decide what they may see.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003');
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

echo "==> check 4: one company cannot see another, and an operator cannot see money"
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
-- A second company on the same server, with its own stock. This is the shape
-- of the real risk: the app is sold to many factories and they share a database.
insert into companies (id, name)
  values ('00000000-0000-4000-8000-0000000000c2', 'Rival Co');
insert into locations (id, company_id, kind, name, capacity_crates)
  values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2',
          'cold_room', 'Their cold room', 80);
insert into items (id, company_id, kind, name, base_unit)
  values ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000c2',
          'input', 'Their secret input', 'g');
insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id,
                       quantity_base_units, location_id, unit_cost_cents)
  values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c2',
          'production', now(), '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-0000000000b3', 1000,
          '00000000-0000-4000-8000-0000000000a2', 999);

-- Give the first company's movement a cost, so there is something to hide.
insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id,
                       quantity_base_units, location_id, unit_cost_cents)
  values ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1',
          'production', now(), '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-0000000000b1', 100,
          '00000000-0000-4000-8000-0000000000a1', 118);

-- An owner of company 1, and an operator of company 1 with no view_cost.
insert into memberships (company_id, user_id, display_name, capabilities)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000002',
          'Dona', array['view_cost','manage_company','record_production']::capability[]),
         ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000003',
          'Operador', array['record_production']::capability[]);

-- A role that is not the table owner, so row level security actually applies.
-- On Supabase this is `authenticated`; the grants below mirror what it holds.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user;
  end if;
end
$$;
grant usage on schema public, private, auth to app_user;
grant select on all tables in schema public to app_user;
grant execute on function private.current_companies() to app_user;
grant execute on function private.has_capability(uuid, capability) to app_user;
grant execute on function auth.uid() to app_user;
SQL

# Runs one query as a given signed-in user. `-q` keeps psql from echoing the
# SET command tags, so what comes back is only the answer.
as_user() {
  psql -d "$DB" -Atqc "set role app_user; set test.uid = '$1'; $2"
}

OWNER=00000000-0000-4000-8000-000000000002
OPERATOR=00000000-0000-4000-8000-000000000003

theirs=$(as_user "$OWNER" "select count(*) from items where name = 'Their secret input';")
[ "$theirs" = "0" ] || fail "company 1 could see company 2's items (got $theirs)"

mine=$(as_user "$OWNER" "select count(*) from items;")
[ "$mine" = "2" ] || fail "the owner should see exactly their own 2 items, got $mine"

# The same query, run by someone with no membership at all.
stranger=$(as_user "00000000-0000-4000-8000-000000000001" "select count(*) from items;")
[ "$stranger" = "0" ] || fail "a user with no membership saw $stranger items"

# Cost is filtered by the policy, not by hiding a button: same row, same view,
# and the operator gets a null where the owner gets a number.
owner_cost=$(as_user "$OWNER" "select unit_cost_cents from movements_visible where id = '00000000-0000-4000-8000-0000000000d3';")
[ "$owner_cost" = "118" ] || fail "the owner should see the cost, got '$owner_cost'"

operator_cost=$(as_user "$OPERATOR" "select coalesce(unit_cost_cents::text, 'null') from movements_visible where id = '00000000-0000-4000-8000-0000000000d3';")
[ "$operator_cost" = "null" ] || fail "an operator without view_cost saw the cost: '$operator_cost'"

operator_rows=$(as_user "$OPERATOR" "select count(*) from movements_visible;")
[ "$operator_rows" = "2" ] || fail "the operator should still see their movements, got $operator_rows"

echo "    tenants isolated, and the operator sees the movement without the money"
echo
echo "OK - migrations apply and all four guarantees hold."

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
#   5. Um pedido nasce no estado que a EMPRESA configurou, e sair do pendente é
#      de quem tem approve_order - nem da tela, nem de quem só despacha.
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
-- E o `auth.jwt()`, pelo mesmo motivo e do mesmo jeito. Duas funções do servidor
-- leem o e-mail de dentro dele para batizar a associação — a do dono
-- (`create_company_for_me`) e a de quem pede (`request_to_join`) —, e sem este
-- talo elas nem chegam a ser exercitadas aqui: aplicar uma função não a executa,
-- então a ausência passava despercebida.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb
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

# And nothing anywhere keeps a second answer to the same question.
#
# An append-only ledger is only the source of truth while it is the *only*
# source. This project shipped a `on_hand_base_units` column on the device for
# months, next to a ledger that was never written to, and every test passed the
# whole time - the arithmetic was right, so nothing looked wrong. The name is
# what gives it away, every time, because whoever adds one is describing
# exactly what it is.
stored=$(psql -d "$DB" -Atqc "select count(*) from information_schema.columns
   where table_schema = 'public'
     and column_name ~* '(^|_)(on_hand|current_stock|stock_level|estoque_atual|quantity_on_hand|saldo_atual)';")
[ "$stored" = "0" ] || fail "$stored column(s) store a stock total the ledger would disagree with"
echo "    and no table keeps a running total beside it"

echo "==> check 2: a purchase moves the moving average, keeping precision"
# On its own item, with no opening balance. Sugar carries a production movement
# from the seed, and blending against it would make this check about two things
# at once - which is how a test ends up asserting a number nobody can derive.
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into items (id, company_id, kind, name, purchase_unit, purchase_to_base)
  values ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000c1',
          'input', 'Cane sugar', '25kg sack', 25000);

insert into purchases (id, company_id, ordered_at, received_at, created_by)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1',
          now() - interval '6 days', now(), '00000000-0000-4000-8000-000000000001');

-- 100 kg at R$ 4.72/kg, then 100 kg at R$ 5.90/kg. Each line is followed by the
-- movement it causes, carrying the same id - which is what lets the trigger ask
-- the ledger what was held *before* this arrival without depending on which of
-- the two rows reaches the server first.
insert into purchase_lines (id, company_id, purchase_id, item_id, purchase_quantity, base_units, total_cents)
  values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1',
          '00000000-0000-4000-8000-0000000000e1',
          '00000000-0000-4000-8000-0000000000b4', 4, 100000, 47200);
insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id,
                       quantity_base_units, location_id, unit_cost_rate)
  values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1',
          'purchase', now(), '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-0000000000b4', 100000,
          '00000000-0000-4000-8000-0000000000a1', 0.472);

insert into purchase_lines (id, company_id, purchase_id, item_id, purchase_quantity, base_units, total_cents)
  values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000c1',
          '00000000-0000-4000-8000-0000000000e1',
          '00000000-0000-4000-8000-0000000000b4', 4, 100000, 59000);
insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id,
                       quantity_base_units, location_id, unit_cost_rate)
  values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000c1',
          'purchase', now(), '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-0000000000b4', 100000,
          '00000000-0000-4000-8000-0000000000a1', 0.590);
SQL

CANE=00000000-0000-4000-8000-0000000000b4
average=$(psql -d "$DB" -Atc "select round(average_rate, 3) from item_costs where item_id = '$CANE';")  # proofgate-allow
[ "$average" = "0.531" ] || fail "expected the average to land at 0.531 cents/g, got $average"

last=$(psql -d "$DB" -Atc "select round(last_rate, 3) from item_costs where item_id = '$CANE';")  # proofgate-allow
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
                       quantity_base_units, location_id, unit_cost_rate)
  values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c2',
          'production', now(), '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-0000000000b3', 1000,
          '00000000-0000-4000-8000-0000000000a2', 9.99);

-- Give the first company's movement a cost, so there is something to hide.
insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id,
                       quantity_base_units, location_id, unit_cost_rate)
  values ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1',
          'production', now(), '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-0000000000b1', 100,
          -- Sub-cent on purpose: a gram of sugar out of a R$ 118 sack of 25 kg.
          -- Stored as bigint cents, as it was until 0008, this is zero.
          '00000000-0000-4000-8000-0000000000a1', 0.472);

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
grant execute on function auth.jwt() to app_user;
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
[ "$mine" = "3" ] || fail "the owner should see exactly their own 3 items, got $mine"

# The same query, run by someone with no membership at all.
stranger=$(as_user "00000000-0000-4000-8000-000000000001" "select count(*) from items;")
[ "$stranger" = "0" ] || fail "a user with no membership saw $stranger items"

# Cost is filtered by the policy, not by hiding a button: same row, same view,
# and the operator gets a null where the owner gets a number.
owner_cost=$(as_user "$OWNER" "select unit_cost_rate from movements_visible where id = '00000000-0000-4000-8000-0000000000d3';")
[ "$owner_cost" = "0.472" ] || fail "the frozen cost lost its precision, got '$owner_cost'"

operator_cost=$(as_user "$OPERATOR" "select coalesce(unit_cost_rate::text, 'null') from movements_visible where id = '00000000-0000-4000-8000-0000000000d3';")
[ "$operator_cost" = "null" ] || fail "an operator without view_cost saw the cost: '$operator_cost'"

# The seeded production, the two purchases from check 2, and the costed
# production above - all of company 1, none of the rival's.
operator_rows=$(as_user "$OPERATOR" "select count(*) from movements_visible;")
[ "$operator_rows" = "4" ] || fail "the operator should still see their movements, got $operator_rows"

# Pedir para entrar não é entrar.
#
# O dono manda um código; quem digita vira uma linha em `memberships`, e é aí
# que estava o buraco: a permissão inteira deste sistema perguntava se existe
# uma linha, não se ela está ativa. Quem descobrisse o código entrava antes de
# alguém dizer sim.
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into auth.users (id) values ('00000000-0000-4000-8000-000000000005');
insert into memberships (company_id, user_id, display_name, capabilities, state)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000005',
          'Pediu para entrar', array['view_cost','manage_company']::capability[], 'pending');
SQL

WAITING=00000000-0000-4000-8000-000000000005

pending_items=$(as_user "$WAITING" "select count(*) from items;")
[ "$pending_items" = "0" ] || fail "quem está esperando aprovação viu $pending_items itens"

pending_cost=$(as_user "$WAITING" "select count(*) from movements_visible;")
[ "$pending_cost" = "0" ] || fail "quem está esperando aprovação viu movimento"

# E aprovar é o que abre a porta - senão esta checagem passaria com um usuário
# simplesmente quebrado.
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  update memberships set state = 'active'
   where user_id = '00000000-0000-4000-8000-000000000005';" >/dev/null

approved_items=$(as_user "$WAITING" "select count(*) from items;")
[ "$approved_items" = "3" ] || fail "aprovado deveria ver os 3 itens da empresa, viu $approved_items"

echo "    tenants isolated, the operator sees no money, and pending sees nothing at all"

echo "==> check 5: the ledger accepts what phase 1 actually records"
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
-- Somebody at the door: they may check in what arrived and count a shelf, and
-- they may not see a cost. That is the whole point of capabilities.
insert into auth.users (id) values ('00000000-0000-4000-8000-000000000004');
insert into memberships (company_id, user_id, display_name, capabilities)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000004',
          'Conferente', array['check_receipt','adjust_stock']::capability[]);

grant insert on movements to app_user;
SQL

CHECKER=00000000-0000-4000-8000-000000000004
M=00000000-0000-4000-8000-0000000000
rows() { psql -d "$DB" -Atqc "$1"; }

# The probes below interpolate `$M` into SQL, which is normally the shape of an
# injection and is flagged as such. It is safe here for a reason worth writing
# down rather than waving away: `$M` is a fixed UUID prefix set on the line
# above, `$CHECKER` and `$OPERATOR` are literals from this file, and nothing on
# these lines comes from outside it. Binding them through psql variables would
# hide which row each statement is about, which is the only thing these checks
# are for. The marker goes on each line so the exemption is per statement and
# a new one has to justify itself.

# Some of the inserts below are meant to be refused, so a non-zero exit is a
# result rather than a crash. What is asserted is what ended up in the table.


# The first movement any real factory records: sugar arriving against an
# invoice. Until 0007 the enum had no word for it.
as_user "$CHECKER" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  item_id, quantity_base_units, location_id, unit_cost_rate) values
  ('${M}d4','${M}c1','purchase',now(),'$CHECKER','${M}b1',25000,'${M}a1',0.472);" >/dev/null 2>&1 || true  # proofgate-allow
# Asked by id, not by kind: check 2 posts purchases of its own, and an
# assertion that counts everything breaks whenever a neighbouring check grows.
posted=$(rows "select count(*) from movements where id = '${M}d4';")  # proofgate-allow
[ "$posted" = "1" ] || fail "a purchase could not be recorded"

# A count that found the books correct. Worth storing precisely because
# nothing moved: it is the difference between a checked shelf and a forgotten one.
as_user "$CHECKER" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  item_id, quantity_base_units, location_id) values
  ('${M}d5','${M}c1','adjustment',now(),'$CHECKER','${M}b1',0,'${M}a1');" >/dev/null 2>&1 || true  # proofgate-allow
counted=$(rows "select count(*) from movements where kind = 'adjustment' and quantity_base_units = 0;")
[ "$counted" = "1" ] || fail "a count that found nothing wrong was refused"

# And the relaxation stayed narrow. A production that produced nothing is
# still nonsense and is still refused.
as_user "$OWNER" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  item_id, quantity_base_units, location_id) values
  ('${M}d6','${M}c1','production',now(),'$OWNER','${M}b1',0,'${M}a1');" >/dev/null 2>&1 || true  # proofgate-allow
empty=$(rows "select count(*) from movements where kind = 'production' and quantity_base_units = 0;")
[ "$empty" = "0" ] || fail "a production that made nothing was accepted"

# The new kind answers to a capability like every other one. An operator who
# may record production may not sign for a delivery.
as_user "$OPERATOR" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  item_id, quantity_base_units, location_id) values
  ('${M}d7','${M}c1','purchase',now(),'$OPERATOR','${M}b1',1000,'${M}a1');" >/dev/null 2>&1 || true  # proofgate-allow
sneaked=$(rows "select count(*) from movements where id = '${M}d7';")  # proofgate-allow
[ "$sneaked" = "0" ] || fail "someone without check_receipt signed for a delivery"

# Attribution cannot be handed to somebody else, and this is the check that
# decides whether a shared phone can work at all.
#
# The owner holds every capability there is. He still cannot post a movement
# that says the operator recorded it. That is `recorded_by = auth.uid()` in the
# append policy doing its job: you may only say that YOU did something, so the
# ledger's answer to "who" cannot be handed around.
#
# Which settles the shared-device question in the only place that counts: the
# ACCOUNT cannot be handed around. Who was holding the phone is a different
# question, answered by `operator_id` - and by a PERSON, who may have no account
# at all. That is the whole point of `0035`: a shared phone is a question on a
# screen, not an authentication problem.
as_user "$OWNER" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  item_id, quantity_base_units, location_id) values
  ('${M}d8','${M}c1','production',now(),'$OPERATOR','${M}b1',500,'${M}a1');" >/dev/null 2>&1 || true  # proofgate-allow
borrowed=$(rows "select count(*) from movements where id = '${M}d8';")  # proofgate-allow
[ "$borrowed" = "0" ] || fail "somebody signed a movement in another person's name"

# And the answer that the refusal above does NOT block: naming who was holding
# the phone. The account stays the session's own - incedível - while
# `operator_id` says who was operating, chosen at the moment of the record.
# Two questions, two columns; that is what makes a shared device a question on
# a screen instead of an authentication problem.
#
# E quem é nomeado aqui NÃO tem conta: é uma pessoa da empresa, com perfil, como
# a fábrica de verdade tem. Antes da `0035` esta linha só aceitava um id de
# membership, e nomear quem entra pela grade de PIN era impossível.
psql -d "$DB" -q -c "insert into profiles (id, company_id, template_role, capabilities)
  values ('${M}f1','${M}c1','operator', array['record_production']::capability[]);" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into people (id, company_id, name, profile_id)
  values ('${M}f2','${M}c1','Quem estava com o celular','${M}f1');" >/dev/null  # proofgate-allow

as_user "$OWNER" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  operator_id, item_id, quantity_base_units, location_id) values
  ('${M}d9','${M}c1','production',now(),'$OWNER','${M}f2',
   '${M}b1',500,'${M}a1');" >/dev/null 2>&1 || true  # proofgate-allow
named=$(rows "select count(*) from movements m join people g on g.id = m.operator_id
  where m.id = '${M}d9' and g.name = 'Quem estava com o celular';")  # proofgate-allow
[ "$named" = "1" ] || fail "a linha não pôde dizer quem estava operando"

echo "    purchases post, an empty count is kept, an empty production is not"
echo "    and nobody can record a movement in somebody else's name"

echo "==> check 6: a fila do aparelho chega inteira, e os dois lados fecham o mesmo número"

# A metade da barra que faltava.
#
# Tudo o mais exercita um módulo ou dirige o aplicativo, e nenhum dos dois
# enxerga a costura entre o SQLite do celular e o Postgres do servidor. Seis
# defeitos moraram exatamente ali - coluna que não existe do outro lado, enum
# escrito diferente, inteiro onde o servidor quer booleano - porque não havia
# código para estar errado.
#
# Aqui uma sessão de verdade roda no aparelho, a fila que ela produz é
# serializada pelo mesmo `serialize` que a sincronização vai usar, e o SQL
# entra neste Postgres com ON_ERROR_STOP. Qualquer divergência de forma para a
# execução.
QUEUE="$PGDATA/queue.sql"
if ! npx tsx scripts/device-session.ts > "$QUEUE" 2>"$PGDATA/queue.err"; then
  cat "$PGDATA/queue.err"
  fail "a sessão do aparelho não rodou"
fi

# A empresa e a conta dela. O login autentica o SISTEMA: quem sincroniza é a
# conta da empresa, e é sob ela que a fila inteira entra.
#
# E a empresa é LIDA da saída do aparelho, não escrita aqui. Enquanto este script
# semeava o id que ele mesmo escolhia — o mesmo número da conta, e o mesmo do
# carimbo compilado do aparelho —, a checagem fabricava à mão a condição que
# esconde o defeito: um uuid fazendo três papéis prova que as colunas batem e
# nada sobre o servidor aceitar uma fila carimbada por adoção.
DEVICE_ACCOUNT=00000000-0000-4000-8000-000000000001
DEVICE_COMPANY=$(sed -n 's/^-- DEVICE_COMPANY=//p' "$QUEUE" | tail -1)
if [ -z "$DEVICE_COMPANY" ]; then
  fail "a sessão do aparelho não disse qual empresa ela adotou"
fi
if [ "$DEVICE_COMPANY" = "$DEVICE_ACCOUNT" ]; then
  fail "a empresa do aparelho é o mesmo uuid da conta — a checagem voltaria a se provar sozinha"
fi
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  insert into companies (id, name)
    values ('$DEVICE_COMPANY', 'Fábrica local');
  insert into memberships (company_id, user_id, display_name, capabilities)
    values ('$DEVICE_COMPANY', '$DEVICE_ACCOUNT', 'Conta da empresa',
            enum_range(null::capability));
  -- INSERT e UPDATE, e o UPDATE não é excesso: a fila sobe com
  -- ON CONFLICT DO UPDATE, porque uma linha corrigida no aparelho offline tem
  -- de alcançar o servidor. A exceção é movements, que sobe com DO NOTHING -
  -- o livro-razão não se corrige, se estorna. Faltando o UPDATE, o Postgres
  -- responde apenas 'permission denied', sem dizer qual dos dois falta.
  grant insert, update on items, locations, products, lots, purchases, purchase_lines,
        recipes, recipe_versions, recipe_lines,
        product_lines, product_categories, product_types, flavors,
        orders, order_lines to app_user;
  -- Gente e perfil sobem com UPDATE pelo mesmo motivo que os cadastros: quem
  -- corrige o nome de alguém offline precisa que a correção alcance o servidor.
  -- A política ainda exige manage_company por cima disto — o grant abre a porta
  -- da tabela, o RLS decide quem passa.
  --
  -- (Sem crase nesta palavra, e sem aspas neste comentário: esta SQL viaja dentro
  -- de uma string de shell entre aspas duplas, onde crase é substituição de comando
  -- e aspas fecham a string. A verificação vinha imprimindo um command-not-found a
  -- cada execução, dentro de um comentário, sem consequência e sem ninguém olhar —
  -- e a minha primeira correção pôs aspas aqui, o que cortou a string ao meio e
  -- levou os grants embaixo junto. Prosa dentro de string de shell é onde o hábito
  -- de Markdown vira erro de execução.)
  grant insert, update on profiles, people to app_user;
  -- A transportadora sobe com UPDATE pelo mesmo motivo dos outros cadastros: quem
  -- corrige o telefone dela offline precisa que a correção alcance o servidor. A
  -- política continua exigindo manage_company por cima disto.
  grant insert, update on carriers to app_user;
  -- O pedido de Reset entra só com INSERT, como o razão e a história de preço: a
  -- política já recusa update e delete, e o grant não contradiz a política.
  grant insert on erase_requests to app_user;
  -- O acordo comercial: a linha corrente sobe com UPDATE, como qualquer cadastro
  -- que se corrige offline. A HISTÓRIA entra só com INSERT, pelo mesmo motivo do
  -- livro-razão e da leitura de sensor — por quanto se vendia em março não se
  -- corrige, se combina de novo. A política exige manage_company por cima dos dois.
  grant insert, update on location_prices to app_user;
  grant insert on sale_price_history to app_user;
  -- Leitura de sensor entra só com INSERT, como o livro-razão: a temperatura de
  -- ontem às três da manhã não se corrige, se mede de novo. Uma série que aceita
  -- UPDATE deixa de ser prova de nada.
  grant insert on movements, readings to app_user;" >/dev/null ||
  fail "não deu para preparar a conta da empresa"

# E aqui está a diferença que faltava: a fila entra COMO A CONTA, não como
# superusuário.
#
# Rodar isto com `-U postgres` foi o buraco desta checagem por semanas. Um
# superusuário ignora row level security por completo, então as 45 escritas
# passavam sem que uma única política fosse avaliada: provava que as colunas
# batiam e absolutamente nada sobre o servidor aceitar a escrita. A regra que
# decide se a sincronização funciona - `recorded_by = auth.uid()`, capacidade por
# tipo de movimento, isolamento por empresa - nunca era executada.
#
# Uma premissa errada minha atravessou a barra verde inteira por causa disso.
printf 'set role app_user;\nset test.uid = %s;\n' "'$DEVICE_ACCOUNT'" > "$PGDATA/queue-rls.sql"
cat "$QUEUE" >> "$PGDATA/queue-rls.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$PGDATA/queue-rls.sql" >/dev/null 2>"$PGDATA/queue-rls.err" || {
  head -5 "$PGDATA/queue-rls.err"
  fail "a fila do aparelho foi recusada pelo servidor sob a política"
}

writes=$(grep -c '^insert into' "$QUEUE")
echo "    $writes escritas replicadas sob a política, sem uma recusa"

# E a política está mesmo sendo avaliada, não apenas presente.
#
# A mesma fila, byte por byte, sob uma conta que não é membro desta empresa. Se
# passar, a checagem acima não provou nada - foi o que aconteceu por semanas com
# o superusuário. A primeira escrita tem de ser recusada.
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  insert into auth.users (id) values ('00000000-0000-4000-8000-00000000000f');" >/dev/null ||
  fail "não deu para criar a conta de fora"
printf 'set role app_user;\nset test.uid = %s;\n' "'00000000-0000-4000-8000-00000000000f'" \
  > "$PGDATA/queue-outsider.sql"
cat "$QUEUE" >> "$PGDATA/queue-outsider.sql"
if psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$PGDATA/queue-outsider.sql" >/dev/null 2>&1; then
  fail "uma conta de fora da empresa conseguiu subir a fila inteira"
fi
echo "    e a mesma fila, por quem não é da empresa, para na primeira linha"

# A mesma fila de novo, e é aqui que o ON CONFLICT sai do papel.
#
# Num banco vazio nenhuma linha conflita, então o DO UPDATE nunca dispara e a
# política de UPDATE nunca é avaliada - a passagem anterior não diz nada sobre
# ela. Um aparelho reenvia a fila o tempo todo: sinal que caiu no meio, tela
# fechada antes do fim, bateria acabando. Reenviar tem de ser inofensivo.
#
# E o livro-razão tem de se comportar diferente do resto: movements sobe com DO
# NOTHING, então a segunda passagem não pode mexer em nenhum movimento. Se o
# saldo mudar aqui, o ledger virou mutável sem ninguém notar.
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$PGDATA/queue-rls.sql" >/dev/null 2>"$PGDATA/queue-again.err" || {
  head -3 "$PGDATA/queue-again.err"
  fail "reenviar a fila foi recusado - a sincronização não é idempotente"
}
echo "    e reenviada inteira, sem estrago"

SUGAR=$(grep -oE 'DEVICE_SUGAR_ID=[0-9a-f-]+' "$QUEUE" | cut -d= -f2)
DEV_BALANCE=$(grep -oE 'DEVICE_SUGAR_BALANCE=-?[0-9]+' "$QUEUE" | cut -d= -f2)
DEV_AVERAGE=$(grep -oE 'DEVICE_SUGAR_AVERAGE=[0-9.]+' "$QUEUE" | cut -d= -f2)

# O saldo do servidor é a soma do livro-razão, calculada por ele, não enviada.
srv_balance=$(psql -d "$DB" -Atqc "select coalesce(sum(quantity_base_units), 0)
  from movements where item_id = '$SUGAR';")  # proofgate-allow
[ "$srv_balance" = "$DEV_BALANCE" ] || fail "saldo divergente: aparelho $DEV_BALANCE, servidor $srv_balance"

# E a média: o gatilho do Postgres calculou a dele sozinho, a partir das linhas
# de nota que chegaram. Se as duas implementações da média móvel discordarem,
# é aqui que aparece - e é a única checagem do projeto que compara duas
# implementações independentes da mesma regra.
srv_average=$(psql -d "$DB" -Atqc "select round(new_rate, 4) from item_cost_history
  where item_id = '$SUGAR' order by observed_at desc, ctid desc limit 1;")  # proofgate-allow
[ "$srv_average" = "$DEV_AVERAGE" ] || fail "média divergente: aparelho $DEV_AVERAGE, servidor $srv_average"

# E a média do PRODUTO, que é a metade que não existia. Nenhuma nota compra
# picolé: o servidor só o conhece pelo movimento de produção, e até a 0025 não
# olhava para ele — `item_costs` do produto vinha vazio e o estoque da loja
# valia R$ 0,00 com mil e quatrocentos picolés dentro.
PRODUCT=$(grep -oE 'DEVICE_PRODUCT_ID=[0-9a-f-]+' "$QUEUE" | cut -d= -f2)
DEV_PRODUCT_AVERAGE=$(grep -oE 'DEVICE_PRODUCT_AVERAGE=[0-9.]+' "$QUEUE" | cut -d= -f2)

srv_product_average=$(psql -d "$DB" -Atqc "select round(average_rate, 4) from item_costs
  where item_id = '$PRODUCT';")  # proofgate-allow
[ -n "$srv_product_average" ] || fail "o servidor não sabe quanto vale o que o tacho fez"
[ "$srv_product_average" = "$DEV_PRODUCT_AVERAGE" ] ||
  fail "média do produto divergente: aparelho $DEV_PRODUCT_AVERAGE, servidor $srv_product_average"

# E o LOTE chegou dizendo de que ficha ele saiu.
#
# "Sem uma recusa" não prova que a coluna atravessou: uma coluna que o
# serializador esquecesse de mandar entraria como nula e a fila passaria verde -
# é o mesmo defeito de uma asserção de ausência sem a de presença ao lado. Aqui
# a chave estrangeira do servidor também é exercitada de verdade: o lote aponta
# para uma `recipe_versions` que subiu antes dele, na mesma fila.
srv_lot_sheet=$(psql -d "$DB" -Atqc "select count(*) from lots l
  join recipe_versions v on v.id = l.recipe_version_id;")  # proofgate-allow
[ "$srv_lot_sheet" -ge 1 ] ||
  fail "o lote chegou sem dizer qual ficha rodou - a coluna não atravessou a fila"

echo "    saldo $srv_balance e média $srv_average, iguais nos dois lados"
echo "    e o produto do tacho vale $srv_product_average nos dois, sem nota nenhuma"
echo "    e o lote diz de qual ficha saiu, com a versão do lado de lá"

echo "==> check 7: a grade do produto recusa o cadastro impossível"

# Esta checagem nasceu de um ataque adversarial que derrubou a primeira versão
# da 0018 inteira, e três dos achados eram invisíveis de fora: a migração nem
# aplicava (chamava as funções sem o schema `private`), a chave composta era
# MATCH SIMPLE — que DESLIGA a checagem quando qualquer coluna do par é nula, e
# nulo é o estado normal deste desenho —, e a unique de nome era texto cru, que
# deixa "Morango" e "morango" entrarem como sabores diferentes.
#
# Nenhuma das três aparece num teste de unidade: são garantias do Postgres, e
# só um Postgres de verdade responde por elas.
G=00000000-0000-4ddd-8000-0000000000
psql -d "$DB" -q -c "insert into companies (id, name) values ('${G}01','Grade');" >/dev/null  # proofgate-allow

psql -d "$DB" -q -c "insert into product_lines (id, company_id, name) values
  ('${G}11','${G}01','Picolé'), ('${G}12','${G}01','Pote de sorvete');" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into product_types (id, company_id, line_id, name) values
  ('${G}21','${G}01','${G}11','Tradicional'), ('${G}22','${G}01','${G}12','500 ml');" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into flavors (id, company_id, name) values
  ('${G}31','${G}01','Morango');" >/dev/null  # proofgate-allow

# Caixa e espaço não são identidade: sem isto o relatório soma seis morangos.
if psql -d "$DB" -q -c "insert into flavors (id, company_id, name)
  values ('${G}32','${G}01','  morango ');" >/dev/null 2>&1; then  # proofgate-allow
  fail "'morango' entrou como sabor diferente de 'Morango'"
fi

psql -d "$DB" -q -c "insert into items (id, company_id, kind, name) values
  ('${G}41','${G}01','product','Picolé tradicional de morango'),
  ('${G}42','${G}01','product','Outro'), ('${G}43','${G}01','product','Terceiro');" >/dev/null  # proofgate-allow

# Tipo de outra linha: "Picolé 500 ml" não existe.
if psql -d "$DB" -q -c "insert into products (id, company_id, item_id, line_id, type_id)
  values ('${G}51','${G}01','${G}41','${G}11','${G}22');" >/dev/null 2>&1; then  # proofgate-allow
  fail "um Picolé de 500 ml entrou: a linha e o tipo não batem"
fi

# E o buraco que o MATCH SIMPLE abria: tipo que não existe em lugar nenhum,
# passando escondido atrás de uma linha nula.
if psql -d "$DB" -q -c "insert into products (id, company_id, item_id, line_id, type_id)
  values ('${G}52','${G}01','${G}41',null,'${G}22');" >/dev/null 2>&1; then  # proofgate-allow
  fail "tipo sem linha entrou: a chave composta está em MATCH SIMPLE"
fi

# O cadastro certo entra.
psql -d "$DB" -q -c "insert into products (id, company_id, item_id, line_id, type_id, flavor_id)
  values ('${G}53','${G}01','${G}41','${G}11','${G}21','${G}31');" >/dev/null  # proofgate-allow

# E não entra duas vezes.
if psql -d "$DB" -q -c "insert into products (id, company_id, item_id, line_id, type_id, flavor_id)
  values ('${G}54','${G}01','${G}42','${G}11','${G}21','${G}31');" >/dev/null 2>&1; then  # proofgate-allow
  fail "o mesmo picolé tradicional de morango entrou duas vezes"
fi

# Nem a fábrica de um doce só, que não preenche nível nenhum: dois nulos
# colidem aqui, ao contrário do padrão do Postgres.
psql -d "$DB" -q -c "insert into products (id, company_id, item_id)
  values ('${G}55','${G}01','${G}42');" >/dev/null  # proofgate-allow
if psql -d "$DB" -q -c "insert into products (id, company_id, item_id)
  values ('${G}56','${G}01','${G}43');" >/dev/null 2>&1; then  # proofgate-allow
  fail "dois produtos sem classificação nenhuma entraram: falta nulls not distinct"
fi

# A semana tem sete dias, e o acordo de entrega é um bitmask. Um número fora
# dela é erro de digitação ou aparelho velho mandando outra coisa, e o banco é
# o único lugar que responde por isso quando a fila vem de um app que não é
# este. Sem a restrição, a loja "recebe no dia 300" e nada acusa.
if psql -d "$DB" -q -c "insert into locations (id, company_id, kind, name, delivery_days)
  values ('${G}61','${G}01','own_store','Loja Impossível',200);" >/dev/null 2>&1; then  # proofgate-allow
  fail "um acordo de entrega fora da semana entrou"
fi
psql -d "$DB" -q -c "insert into locations (id, company_id, kind, name, delivery_days)
  values ('${G}62','${G}01','own_store','Loja de terça e sexta',36);" >/dev/null  # proofgate-allow

echo "    tipo de outra linha, tipo órfão, sabor repetido e produto duplicado, todos recusados"
echo "    e a semana de entrega não tem trezentos dias"

echo "==> check 8: o pedido nasce onde a empresa mandou, e sair do pendente é de quem aprova"

# A aprovação de pedido é configuração da empresa, e a regra não pode morar na
# tela: um cliente que manda o pedido pelo próprio aparelho escolheria nascer
# aprovado, porque "status" é um campo como outro qualquer no JSON.
P=00000000-0000-4eee-8000-0000000000
psql -d "$DB" -q -c "insert into auth.users (id) values ('${P}91'), ('${P}92');" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into companies (id, name, orders_need_approval)
  values ('${P}01','Fábrica que aprova', true);" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into memberships (company_id, user_id, display_name, capabilities)
  values ('${P}01','${P}91','Vendedora', array['place_order','dispatch','check_receipt']::capability[]),
         ('${P}01','${P}92','Dona', array['place_order','approve_order']::capability[]);" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into locations (id, company_id, kind, name)
  values ('${P}11','${P}01','customer','Cliente do centro');" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into items (id, company_id, kind, name)
  values ('${P}21','${P}01','product','Picolé de morango');" >/dev/null  # proofgate-allow

psql -d "$DB" -q -c "grant insert, update on orders, order_lines to app_user;" >/dev/null

# A vendedora anota o pedido dizendo 'open'. O banco põe em 'pending' assim
# mesmo, porque a empresa pediu aprovação.
PEDIDO="insert into orders (id, company_id, place_id, status, recorded_by) values ('${P}31','${P}01','${P}11','open','${P}91');"  # proofgate-allow
as_user "${P}91" "$PEDIDO" >/dev/null ||
  fail "quem tem place_order não conseguiu anotar um pedido"

nasceu=$(psql -d "$DB" -Atqc "select status from orders where id = '${P}31';")  # proofgate-allow
[ "$nasceu" = "pending" ] ||
  fail "o pedido nasceu '$nasceu': a tela escolheu o estado que era do banco"

# E a mesma vendedora, que despacha mas não aprova, não tira do pendente.
APROVA="update orders set status = 'open' where id = '${P}31';"  # proofgate-allow
if as_user "${P}91" "$APROVA" >/dev/null 2>&1; then
  fail "quem despacha aprovou um pedido sem ter approve_order"
fi

# Quem aprova, aprova.
as_user "${P}92" "$APROVA" >/dev/null ||
  fail "quem tem approve_order não conseguiu aprovar"

# Linha de pedido de outra empresa não entra, e quantidade zero não é pedido.
if psql -d "$DB" -q -c "insert into order_lines (id, company_id, order_id, item_id, base_units)
  values ('${P}41','${P}01','${P}31','00000000-0000-4000-8000-0000000000a1',10);" >/dev/null 2>&1; then  # proofgate-allow
  fail "uma linha apontou para o item de outra empresa"
fi
if psql -d "$DB" -q -c "insert into order_lines (id, company_id, order_id, item_id, base_units)
  values ('${P}42','${P}01','${P}31','${P}21',0);" >/dev/null 2>&1; then  # proofgate-allow
  fail "um pedido de zero unidade entrou"
fi

echo "    o estado inicial é do banco, aprovar é de quem aprova, e a linha não cruza empresa"

echo "==> check 9: o reenvio da fila passa pela capacidade MÍNIMA de quem escreveu"

# A garantia que faltava, e a ausência dela deixou passar um defeito crítico.
#
# A checagem 6 sobe a fila com uma conta que tem `enum_range(null::capability)` —
# TODAS as capacidades. A checagem 8 dá à vendedora `place_order` MAIS `dispatch`.
# Nenhuma conta com a capacidade mínima de um papel real jamais rodou a SEGUNDA
# passagem, e é na segunda que o defeito mora: a fila sobe com `on conflict do
# update`, e uma política de update que peça mais do que a de insert recusa o
# reenvio e trava a fila para sempre atrás daquela linha.
#
# Aqui a gerente de loja tem exatamente o que o produto dá a ela em
# `src/domain/access.ts`: place_order, view_sale_price, check_receipt,
# record_loss. Nada de approve_order, nada de dispatch, nada de manage_company.
psql -d "$DB" -q -c "insert into auth.users (id) values ('${P}93');" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into memberships (company_id, user_id, display_name, capabilities)
  values ('${P}01','${P}93','Gerente da loja',
          array['place_order','view_sale_price','check_receipt','record_loss']::capability[]);" >/dev/null  # proofgate-allow

# Primeira subida: entra.
UM="insert into orders (id, company_id, place_id, status, recorded_by) values ('${P}51','${P}01','${P}11','open','${P}93');"  # proofgate-allow
as_user "${P}93" "$UM" >/dev/null ||
  fail "a gerente da loja não conseguiu anotar o pedido dela"

# Segunda subida: é o MESMO caminho que a fila do aparelho usa quando o sinal caiu
# no meio do envio. Sem a política de reenvio, o Postgres recusa exatamente aqui.
DOIS="insert into orders (id, company_id, place_id, status, recorded_by) values ('${P}51','${P}01','${P}11','open','${P}93') on conflict (id) do update set place_id = excluded.place_id, status = excluded.status, recorded_by = excluded.recorded_by;"  # proofgate-allow  # proofgate-allow
as_user "${P}93" "$DOIS" >/dev/null ||
  fail "o reenvio do pedido foi recusado: a fila do aparelho trava aqui, e tudo o que veio depois fica preso atrás dela"

# E o reenvio não decidiu nada. A empresa exige aprovação, então o pedido dela
# nasceu pendente e TEM que continuar pendente depois de duas subidas dizendo
# 'open'. Se virou 'open', o reenvio aprovou um pedido — o oposto do que a
# checagem 8 protege.
depois=$(psql -d "$DB" -Atqc "select status from orders where id = '${P}51';")  # proofgate-allow
[ "$depois" = "pending" ] ||
  fail "o reenvio deixou o pedido em '$depois': reenviar decidiu, e aprovar não é de quem só anota"

# E quem decide continua decidindo, senão o conserto teria quebrado a checagem 8.
as_user "${P}92" "update orders set status = 'open' where id = '${P}51';" >/dev/null ||  # proofgate-allow
  fail "quem tem approve_order deixou de conseguir aprovar depois do conserto"

echo "    a fila sobe duas vezes pela capacidade mínima, e o reenvio não decide nada"

echo "==> check 10: o razão recusa item e local de outra empresa"

# A garantia que faltava embaixo da fundação multi-empresa.
#
# A checagem 4 prova o ISOLAMENTO DE LEITURA: uma empresa não vê a outra. A
# escrita tinha um buraco de outra forma — a política pergunta se a pessoa pode
# gravar naquela empresa, e ninguém perguntava se o ITEM é daquela empresa. As
# chaves de `movements` eram simples.
#
# O id não precisa ser adivinhado: `ensureLocation` cria o lugar padrão com
# `id = company_id`, então o almoxarifado de B tem o id de B.
psql -d "$DB" -q -c "insert into auth.users (id) values ('${P}94');" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into companies (id, name) values ('${P}02','Fábrica vizinha');" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into memberships (company_id, user_id, display_name, capabilities)
  values ('${P}01','${P}94','Operadora', array['record_production']::capability[]);" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into locations (id, company_id, kind, name)
  values ('${P}12','${P}01','store_room','Almoxarifado de casa'),
         ('${P}13','${P}02','store_room','Almoxarifado da vizinha');" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into items (id, company_id, kind, name)
  values ('${P}22','${P}02','input','Polpa da vizinha');" >/dev/null  # proofgate-allow

# O item da vizinha, no razão de casa: recusado.
FORA="insert into movements (id, company_id, kind, occurred_at, recorded_at, item_id, quantity_base_units, location_id, recorded_by) values ('${P}61','${P}01','production', now(), now(), '${P}22', 100, '${P}12', '${P}94');"  # proofgate-allow
if as_user "${P}94" "$FORA" >/dev/null 2>&1; then
  fail "o razão aceitou um item de OUTRA empresa — o saldo de casa passa a falar de coisa que não é de casa, e append-only quer dizer que a linha não sai nunca"
fi

# O local da vizinha, no razão de casa: recusado também.
LUGAR="insert into movements (id, company_id, kind, occurred_at, recorded_at, item_id, quantity_base_units, location_id, recorded_by) values ('${P}62','${P}01','production', now(), now(), '${P}21', 100, '${P}13', '${P}94');"  # proofgate-allow
if as_user "${P}94" "$LUGAR" >/dev/null 2>&1; then
  fail "o razão aceitou um LOCAL de outra empresa"
fi

# E o movimento de casa, com item e local de casa, continua entrando — senão o
# conserto teria trancado a porta com a fábrica do lado de fora.
CASA="insert into movements (id, company_id, kind, occurred_at, recorded_at, item_id, quantity_base_units, location_id, recorded_by) values ('${P}63','${P}01','production', now(), now(), '${P}21', 100, '${P}12', '${P}94');"  # proofgate-allow
as_user "${P}94" "$CASA" >/dev/null ||
  fail "o movimento legítimo da própria empresa passou a ser recusado"

echo "    item e local de fora são recusados, e o de casa entra"

echo "==> check 11: o aparelho emprestado cria o lugar padrão, e nada além dele"

# Quarta aparição da fila travada, com forma nova: não é ausência de política nem
# capacidade errada no update — é a linha de ESCRITURAÇÃO DO PRÓPRIO SISTEMA
# exigindo a capacidade de administrar a empresa.
#
# `ensureLocation` cria o lugar padrão no PRIMEIRO movimento de qualquer
# aparelho e o enfileira, porque ele tem que chegar antes do movimento que se
# apoia nele. A `locations_manage` exige `manage_company`, que só o dono tem.
#
# A operadora aqui tem exatamente o que a decisão do dono dá ao celular
# emprestado: produção e nada de dinheiro.
psql -d "$DB" -q -c "insert into auth.users (id) values ('${P}95');" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into companies (id, name) values ('${P}03','Fábrica do aparelho');" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into memberships (company_id, user_id, display_name, capabilities)
  values ('${P}03','${P}95','Operadora do turno',
          array['record_production','dispatch','check_receipt','record_loss','adjust_stock']::capability[]);" >/dev/null  # proofgate-allow

psql -d "$DB" -q -c "grant insert, update on locations to app_user;" >/dev/null

# O lugar padrão: id IGUAL ao da empresa, que é o único id que ele pode ter.
PADRAO="insert into locations (id, company_id, name, kind) values ('${P}03','${P}03','','store_room');"  # proofgate-allow
as_user "${P}95" "$PADRAO" >/dev/null ||
  fail "o aparelho emprestado não conseguiu criar o lugar padrão: a fila trava na primeira produção do dia e nada mais sobe daquele celular"

# E o reenvio, que é o caso normal de quem perdeu sinal no meio.
REENVIO="insert into locations (id, company_id, name, kind) values ('${P}03','${P}03','','store_room') on conflict (id) do update set name = excluded.name, kind = excluded.kind;"  # proofgate-allow
as_user "${P}95" "$REENVIO" >/dev/null ||
  fail "o reenvio do lugar padrão foi recusado, e a fila trava atrás dele"

# Mas cadastrar um lugar DE VERDADE continua sendo de quem administra. Se esta
# linha passar, o conserto virou permissão nova em vez de escrituração.
OUTRO="insert into locations (id, company_id, name, kind) values ('${P}14','${P}03','Câmara fria','cold_room');"  # proofgate-allow
if as_user "${P}95" "$OUTRO" >/dev/null 2>&1; then
  fail "quem só produz cadastrou um lugar novo — o conserto abriu permissão em vez de deixar passar a escrituração"
fi

echo "    o lugar padrão passa e é reenviável, e cadastrar lugar continua sendo de quem administra"

echo "==> check 12: a leitura da câmara sobe duas vezes, e a segunda não reescreve nada"

# QUINTA aparição da fila travada, e a primeira achada procurando a família.
#
# `readings` nasceu na 0024 com política de leitura e de insert, e mais nada — e a
# leitura é a escrita com MAIOR chance de subir duas vezes em todo o aplicativo: ela é
# anotada dentro da câmara, a -18 °C, onde o sinal não chega. Sem o reenvio passar, o
# motor para no primeiro buraco.
#
# **E o `update` aqui é DELIBERADO, contra a aparência — lido em 11 de setembro, depois de
# eu tê-lo tirado por engano.** A guarda nova dos grants (`src/sync/grants.test.ts`)
# apontou que `readings` está em `APENAS_INSERE` e ganhava `update`, e a leitura rápida
# disso é "privilégio a mais numa tabela append-only". Ela está errada, e o que a corrige é
# a sonda de baixo: o `on conflict do update` existe para provar que a **POLÍTICA** recusa
# a reescrita — e para a política ser exercitada, o privilégio tem de deixar a instrução
# CHEGAR nela. Sem o grant, o que reprova é `permission denied`, que é a prova mais fraca
# e não diz nada sobre a política. É a mesma lição que a checagem 11 tem escrita três
# blocos acima: *"o conserto virou permissão nova em vez de escrituração"*.
#
# Então a checagem tem DUAS sondas, e elas provam coisas diferentes:
#   1. o `do nothing` — o que o aparelho manda de verdade: o reenvio ENTRA e não muda nada;
#   2. o `do update` — o que um cliente com defeito mandaria: a política o neutraliza.
# Tirar a segunda deixaria o servidor defendido pelo cliente, que é defesa nenhuma.
#
# A razão acima está registrada em `UPDATE_DE_PROPOSITO` (`src/sync/grants.test.ts`), e a
# guarda cobra as duas pontas: grant sem razão escrita reprova, e razão escrita sem grant
# reprova também — desculpa que perdeu o objeto libera o privilégio de graça amanhã.
psql -d "$DB" -q -c "grant insert, update on readings to app_user;" >/dev/null

# A operadora do turno tem `adjust_stock`, que é a capacidade da contagem — a
# mesma do gesto de ir até a câmara e anotar o que viu.
LEITURA="insert into readings (id, company_id, location_id, kind, value, unit, taken_at, recorded_by) values ('${P}71','${P}03','${P}03','temperature',-18.4,'C', now(), '${P}95');"  # proofgate-allow
as_user "${P}95" "$LEITURA" >/dev/null ||
  fail "a operadora não conseguiu anotar a temperatura da câmara"

# O reenvio como o aparelho o manda: `do nothing`, que é o que `APENAS_INSERE` decide.
# O valor vem DIFERENTE de propósito — se o servidor sobrescrevesse, a série deixaria de
# ser prova, e esta linha é a única que separa "aceitou o reenvio" de "aceitou a reescrita".
RELEITURA="insert into readings (id, company_id, location_id, kind, value, unit, taken_at, recorded_by) values ('${P}71','${P}03','${P}03','temperature',-99.9,'C', now(), '${P}95') on conflict (id) do nothing;"  # proofgate-allow
as_user "${P}95" "$RELEITURA" >/dev/null ||
  fail "o reenvio da leitura foi recusado: a fila do aparelho trava aqui, e é a escrita que mais reenvia porque acontece onde não há sinal"
# A comparação é NUMÉRICA dentro do banco, e não de texto aqui: `value` é
# `numeric(14,4)`, então o valor certo volta como `-18.4000` e uma igualdade de string
# reprova a garantia estando ela cumprida — foi o que aconteceu na primeira escrita desta
# linha, e o script acusou o servidor de sobrescrever o que ele tinha preservado.
[ "$(rows "select value = -18.4 from readings where id = '${P}71';")" = "t" ] \
  || fail "o reenvio SOBRESCREVEU a leitura: uma série que aceita reescrita não é prova de nada"

# E o reenvio não reescreve o que foi visto. Uma leitura diferente é outra
# leitura, e outra leitura é outra linha.
OUTRO_VALOR="insert into readings (id, company_id, location_id, kind, value, unit, taken_at, recorded_by) values ('${P}71','${P}03','${P}03','temperature',-2.0,'C', now(), '${P}95') on conflict (id) do update set value = excluded.value;"  # proofgate-allow
as_user "${P}95" "$OUTRO_VALOR" >/dev/null ||
  fail "o reenvio com valor diferente foi recusado em vez de ser devolvido ao valor original"
valor=$(psql -d "$DB" -Atqc "select value from readings where id = '${P}71';")  # proofgate-allow
case "$valor" in
  -18.4*) : ;;
  *) fail "o reenvio reescreveu a leitura para '$valor': a câmara passou a dizer que estava a -2 °C quando estava a -18,4" ;;
esac

echo "    a leitura é reenviável, e o reenvio não muda o que foi visto"

echo "==> check 13: quem aprova um pedido não reescreve quem o anotou"

# A assinatura é incedível — e ela era, no insert e no reenvio, e NÃO era na
# decisão.
#
# `orders_place` exige `recorded_by = auth.uid()`; `orders_resend` (0027) exige nos
# dois lados. Mas `orders_decide` — a porta de quem aprova, despacha ou administra
# — só pergunta pela capacidade. Quem aprova podia, no mesmo update, trocar QUEM
# anotou o pedido: a gerente da loja some do registro e outra pessoa aparece no
# lugar dela.
#
# Numa fábrica de seis pessoas isso não é invasão de fora: é o dono reescrevendo o
# passado de dentro, no único campo que o livro de pedidos tem para dizer quem
# pediu o quê. `movements` não tem esse buraco porque não tem política de update
# nenhuma — a imutabilidade dele é gatilho.
ANOTA="insert into orders (id, company_id, place_id, status, recorded_by) values ('${P}52','${P}01','${P}11','open','${P}93');"  # proofgate-allow
as_user "${P}93" "$ANOTA" >/dev/null ||
  fail "a gerente da loja não conseguiu anotar o segundo pedido"

# Quem aprova aprova — e é a mesma linha que tenta trocar o autor.
CEDE="update orders set status = 'open', recorded_by = '${P}92' where id = '${P}52';"  # proofgate-allow
as_user "${P}92" "$CEDE" >/dev/null ||
  fail "quem tem approve_order deixou de conseguir aprovar"

autor=$(psql -d "$DB" -Atqc "select recorded_by from orders where id = '${P}52';")  # proofgate-allow
[ "$autor" = "${P}93" ] ||
  fail "o autor do pedido virou '$autor': quem aprova reescreveu quem anotou, e o registro deixou de dizer quem pediu"

# E a aprovação em si funcionou, senão o conserto teria travado a decisão.
estado=$(psql -d "$DB" -Atqc "select status from orders where id = '${P}52';")  # proofgate-allow
[ "$estado" = "open" ] ||
  fail "o pedido ficou em '$estado': o conserto do autor travou a aprovação"

echo "    aprovar decide o pedido e não muda quem o anotou"

echo "==> check 14: uma devolução diz por que voltou, e só ela tem motivo de devolução"

# O tipo `return` separou a devolução da transferência. O MOTIVO não separava
# nada: "a loja não vendeu" e "a carga chegou derretida" entravam como a mesma
# linha, e as duas mandam fazer coisas opostas — a primeira manda produzir menos
# para aquela loja, a segunda manda olhar o caminhão.
#
# A regra tem duas metades, e a segunda é a que costuma faltar: obrigatório NA
# devolução, e proibido FORA dela. Sem a segunda, uma transferência entre salas
# nossas carregaria motivo de devolução — dado errado entrando com cara de dado
# certo, e o Espelho da Loja contando devolução que nunca houve.
SEM_MOTIVO="insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id, quantity_base_units, location_id) values ('${P}61','${P}01','return',now(),'${P}91','${P}21',500,'${P}11');"  # proofgate-allow
if as_user "${P}91" "$SEM_MOTIVO" >/dev/null 2>&1; then
  fail "uma devolução sem motivo foi aceita: o razão grava aritmética sem notícia"
fi

COM_MOTIVO="insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id, quantity_base_units, location_id, return_reason) values ('${P}62','${P}01','return',now(),'${P}91','${P}21',500,'${P}11','unsold');"  # proofgate-allow
as_user "${P}91" "$COM_MOTIVO" >/dev/null ||
  fail "uma devolução COM motivo foi recusada: a regra travou o caminho que ela existe para permitir"

# E a metade de trás: transferência com motivo de devolução não passa.
INTRUSO="insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id, quantity_base_units, location_id, return_reason) values ('${P}63','${P}01','transfer',now(),'${P}91','${P}21',500,'${P}11','unsold');"  # proofgate-allow
if as_user "${P}91" "$INTRUSO" >/dev/null 2>&1; then
  fail "uma transferência com motivo de devolução foi aceita: o relatório da loja contaria devolução que não houve"
fi

echo "    devolução sem motivo é recusada, com motivo passa, e fora dela o motivo não entra"

echo "==> check 15: pessoa não é conta, e o operador do movimento aponta para gente"

# A `0014` fez `movements.operator_id` apontar para `memberships`, e todo
# membership exige `auth.users`. Lido junto: só dá para NOMEAR quem tem login.
#
# Isso contraria a decisão que a própria `0014` cita no topo — "o login autentica
# o sistema, não a pessoa". Quem entra pela grade de nomes com PIN, de luva, no
# celular compartilhado da empresa, não tem conta nenhuma e nunca vai ter.
#
# Esta checagem prova as duas metades: a pessoa existe SEM conta, e o operador só
# aceita gente. Sem a segunda metade, a coluna continuaria aceitando um id de
# membership e ninguém notaria até a primeira sincronia de verdade.
psql -d "$DB" -q -c "insert into profiles (id, company_id, template_role, capabilities)
  values ('${P}71','${P}01','driver', array['dispatch','check_receipt','record_loss']::capability[]);" >/dev/null  # proofgate-allow

# A pessoa entra sem `auth.users` nenhum atrás dela. Se `people` exigisse conta,
# este insert falharia aqui — que é exatamente o defeito que a 0035 desfaz.
psql -d "$DB" -q -c "insert into people (id, company_id, name, profile_id)
  values ('${P}81','${P}01','Zeca da câmara','${P}71');" >/dev/null ||  # proofgate-allow
  fail "uma pessoa sem conta foi recusada: a grade de nomes com PIN não teria quem mostrar"

psql -d "$DB" -q -c "grant insert on movements to app_user;" >/dev/null

# O movimento com um OPERADOR de verdade passa.
COM_GENTE="insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id, quantity_base_units, location_id, operator_id) values ('${P}64','${P}01','transfer',now(),'${P}91','${P}21',10,'${P}11','${P}81');"  # proofgate-allow
as_user "${P}91" "$COM_GENTE" >/dev/null ||
  fail "um movimento com operador PESSOA foi recusado: a coluna não aponta para gente"

# E o id de um membership não passa mais. Este é o ponto: antes da 0035 ele era o
# único que passava, e a pessoa sem conta é que não tinha como ser nomeada.
MEMBRO=$(psql -d "$DB" -Atqc "select id from memberships where user_id = '${P}91';")  # proofgate-allow
COM_CONTA="insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id, quantity_base_units, location_id, operator_id) values ('${P}65','${P}01','transfer',now(),'${P}91','${P}21',10,'${P}11','$MEMBRO');"  # proofgate-allow
if as_user "${P}91" "$COM_CONTA" >/dev/null 2>&1; then
  fail "o operador aceitou um id de CONTA: as duas perguntas voltaram a ser uma coluna só"
fi

# E o aparelho responde por uma pessoa, pela mesma razão e pela mesma regra.
psql -d "$DB" -q -c "insert into devices (id, company_id, name, responsible_id)
  values ('${P}82','${P}01','Celular da câmara','${P}81');" >/dev/null ||  # proofgate-allow
  fail "o aparelho não pôde apontar para uma pessoa"

if psql -d "$DB" -q -c "insert into devices (id, company_id, name, responsible_id)
  values ('${P}83','${P}01','Tablet da expedição','$MEMBRO');" >/dev/null 2>&1; then  # proofgate-allow
  fail "o responsável pelo aparelho aceitou um id de CONTA"
fi

# Quem não gere a empresa não cadastra gente — a permissão mora na consulta.
NOVA_PESSOA="insert into people (id, company_id, name, profile_id) values ('${P}84','${P}01','Quem não devia','${P}71');"  # proofgate-allow
if as_user "${P}91" "$NOVA_PESSOA" >/dev/null 2>&1; then
  fail "quem não tem manage_company cadastrou uma pessoa"
fi

echo "    pessoa existe sem conta, o operador só aceita gente, e cadastrar gente pede manage_company"

echo "==> check 16: o PIN é atribuição, e o banco recusa o que não é PIN"

# O PIN da grade de nomes é ATRIBUIÇÃO, não autenticação — o raciocínio inteiro
# está na 0036 e em `docs/estudo-entrada.md`. O que o banco garante não é
# segredo: é FORMA. Quatro a oito dígitos, ou nada.
#
# A restrição existe para o erro impedir em vez de reclamar, e para impedir dos
# dois lados: o aparelho valida antes de gravar, e se algum dia ele esquecer, a
# linha é recusada aqui em vez de virar um PIN com letra que ninguém consegue
# digitar num teclado numérico.
psql -d "$DB" -q -c "update people set pin = '1234' where id = '${P}81';" >/dev/null ||  # proofgate-allow
  fail "um PIN de quatro dígitos foi recusado"

psql -d "$DB" -q -c "update people set pin = '12345678' where id = '${P}81';" >/dev/null ||  # proofgate-allow
  fail "um PIN de oito dígitos foi recusado"

# Nulo é o caso NORMAL: a fábrica que não quis PIN escolhe com um toque só.
psql -d "$DB" -q -c "update people set pin = null where id = '${P}81';" >/dev/null ||  # proofgate-allow
  fail "tirar o PIN foi recusado, e pessoa sem PIN é o caso comum"

if psql -d "$DB" -q -c "update people set pin = '123' where id = '${P}81';" >/dev/null 2>&1; then  # proofgate-allow
  fail "o banco aceitou um PIN de três dígitos"
fi

if psql -d "$DB" -q -c "update people set pin = 'abcd' where id = '${P}81';" >/dev/null 2>&1; then  # proofgate-allow
  fail "o banco aceitou letra no PIN: ninguém digita isso num teclado numérico de luva"
fi

echo "    quatro a oito dígitos ou nada, e nada é o caso comum"

echo
echo "==> check 17: tabela append-only sobe append-only, e quem decide é o banco"

# A regra que este projeto aprendeu tarde, três vezes no mesmo dia.
#
# Uma tabela cuja política no servidor só tem `for insert` NUNCA vai ganhar o
# privilégio de UPDATE. Se a fila subir uma linha dela com `on conflict do update`,
# o Postgres recusa no plano — e recusa dizendo apenas "permission denied for
# table", sem falar de política e sem dizer qual privilégio falta. Foi assim que
# `sale_price_history` parou a checagem 6, e antes dela `movements` e `readings`
# ensinaram o mesmo.
#
# O que existia contra isso era uma LISTA ESCRITA À MÃO dentro do gerador da fila.
# Lista escrita à mão envelhece calada, e este arquivo já registrou esse padrão em
# quatro guardas diferentes. Aqui quem responde é o `pg_policies` do banco que
# acabou de aplicar as migrações: append-only não é o que eu lembro, é o que a
# política diz.
DIVERGENTES=$(psql -d "$DB" -At -c "
  with so_insert as (
    select tablename
      from pg_policies
     where schemaname = 'public'
     group by tablename
    having bool_and(cmd = 'INSERT')
  )
  select tablename from so_insert;")

for TABELA in $DIVERGENTES; do
  # A fila só fala das tabelas que ela envia; uma append-only que não atravessa não
  # tem como divergir de nada.
  grep -q "insert into $TABELA " "$QUEUE" || continue
  if grep -E "insert into $TABELA .*do update" "$QUEUE" >/dev/null; then
    fail "$TABELA só aceita INSERT no servidor e a fila a sobe com DO UPDATE"
  fi
done

# E a outra direção, que é a que envelhece calada: subir append-only uma tabela que
# o servidor deixa corrigir seria uma correção offline que nunca alcança o servidor
# — o defeito silencioso, sem erro nenhum, que é sempre o pior dos dois.
#
# Com uma exceção registrada, e ela apareceu na primeira execução desta checagem:
# `readings` GANHOU política de update na 0031, escrita quando a fila subia tudo com
# DO UPDATE. Hoje o aparelho a sobe uma vez só, pela regra escrita no gerador — uma
# série que aceita UPDATE deixa de ser prova de nada, e a temperatura de ontem às
# três da manhã não se corrige, se mede de novo. O servidor continua mais permissivo
# do que o aparelho precisa, o que não é defeito: é permissão concedida a um caminho
# que o aparelho deixou de usar. Fica escrito para não virar alarme repetido — e para
# que o dia em que alguém retirar a política saiba por que ela estava lá.
MAIS_LARGO_QUE_PRECISA="readings"

CORRIGIVEIS=$(psql -d "$DB" -At -c "
  select distinct tablename
    from pg_policies
   where schemaname = 'public' and cmd in ('ALL', 'UPDATE');")

for TABELA in $CORRIGIVEIS; do
  grep -q "insert into $TABELA " "$QUEUE" || continue
  case " $MAIS_LARGO_QUE_PRECISA " in *" $TABELA "*) continue ;; esac
  if grep -E "insert into $TABELA .*do nothing" "$QUEUE" >/dev/null; then
    fail "$TABELA aceita correção no servidor e a fila a sobe com DO NOTHING: a correção offline nunca chega"
  fi
done

# E o registro se confere contra o sistema, senão ele envelhece calado como toda
# lista escrita à mão: a exceção que deixou de ser exceção tem de reprovar aqui.
for TABELA in $MAIS_LARGO_QUE_PRECISA; do
  grep -E "insert into $TABELA .*do nothing" "$QUEUE" >/dev/null ||
    fail "$TABELA está registrada como append-only no aparelho e a fila já a sobe corrigível: tire o registro"
done

echo "    o que o servidor deixa corrigir sobe corrigível, e o que ele não deixa sobe uma vez só"

echo
echo "==> check 18: a empresa nasce com a segunda porta, e o código dá para ditar"

# A `0011` criou `companies.join_code` com o propósito escrito ao lado — é o
# segundo caminho de entrada, o código que o dono dita para alguém pedir
# associação. A `0040` criou a empresa e o dono numa transação e NÃO gerou o
# código: empresa nascida naquele dia tinha a coluna nula, e o caminho
# documentado simplesmente não existia.
#
# É a doença do portão P1 um nível abaixo do código, e pior: no código o
# compilador acaba reclamando de algo sem uso; num esquema, ninguém reclama
# nunca. Por isso a garantia mora aqui e não numa leitura de arquivo.

# 1. A função existe e produz código do tamanho combinado.
TAMANHO=$(psql -d "$DB" -At -c "select length(private.fresh_join_code());")
[ "$TAMANHO" = "6" ] ||
  fail "o código de convite saiu com $TAMANHO caracteres; o combinado são 6, para caber num aviso falado"

# 2. E ele evita o que se confunde ao ser DITO no chão de fábrica, com barulho.
#    Zero e ó, um e i e L, cinco e esse, dois e zê: quem soletra duas vezes
#    desiste de usar.
CONFUNDE=$(psql -d "$DB" -At -c "
  select count(*) from generate_series(1, 200) as g
   where private.fresh_join_code() ~ '[OIL0125SZ]';")
[ "$CONFUNDE" = "0" ] ||
  fail "$CONFUNDE de 200 códigos trouxeram caractere ambíguo (O I L 0 1 2 5 S Z): o código é ditado em voz alta"

# 3. Duzentos códigos, duzentos diferentes. Não prova ausência de colisão — prova
#    que a geração não está presa num valor, que é o defeito que de fato acontece.
DISTINTOS=$(psql -d "$DB" -At -c "
  select count(distinct c) from (select private.fresh_join_code() as c from generate_series(1, 200)) as t;")
[ "$DISTINTOS" -ge 195 ] ||
  fail "200 códigos gerados renderam só $DISTINTOS distintos: a geração está presa"

# 4. E nenhuma empresa fica sem a porta — nem as que já existiam quando a
#    migração rodou, que é o que o `update` do fim dela conserta.
SEM_CODIGO=$(psql -d "$DB" -At -c "select count(*) from companies where join_code is null;")
[ "$SEM_CODIGO" = "0" ] ||
  fail "$SEM_CODIGO empresa(s) sem código de convite: a segunda porta de entrada não existe para elas"

echo "    o código sai com seis, sem caractere que se confunde ao ser dito, e nenhuma empresa fica sem ele"

echo
echo "==> check 19: pedir para entrar não é entrar, e pedir duas vezes não desfaz nada"

# A `0011` desenhou os dois caminhos que o dono decidiu — ele cadastra, ou aprova
# quem pediu com o código —, e o caminho de QUEM PEDE nunca existiu. Ele não podia
# existir como insert do aplicativo: quem ainda não é membro não enxerga a empresa
# (`companies_read` filtra por associação ativa) e não pode escrever em
# `memberships` (`memberships_manage` exige já ser membro ativo). Duas portas
# trancadas por dentro, do lado de fora desta vez.
#
# O que esta garantia protege não é o caminho feliz: é a linha que fica PENDENTE.
# Se um segundo pedido reescrevesse a primeira linha, quem já esperava voltaria ao
# fim da fila — e se quem já é membro ATIVO pedisse de novo, seria rebaixado e
# perderia o acesso. Esse é o defeito que dá para escrever sem perceber.

CODIGO=$(psql -d "$DB" -At -c "select join_code from companies limit 1;")
EMPRESA=$(psql -d "$DB" -At -c "select id from companies where join_code = '$CODIGO';")
DONO=$(psql -d "$DB" -At -c "select user_id from memberships where company_id = '$EMPRESA' and state = 'active' limit 1;")
# Uma conta NOVA, criada aqui: os três usuários semeados no topo já têm
# associação nas empresas da verificação, e usar um deles fazia a função sair
# cedo — corretamente — enquanto o teste lia a linha antiga e acusava a função.
# Foi o primeiro veredito desta garantia, e o defeito era do figurante.
FORASTEIRO='00000000-0000-4000-8000-0000000000ff'
psql -d "$DB" -q -c "insert into auth.users (id) values ('$FORASTEIRO') on conflict do nothing;"

# 1. Código que não existe é recusado, e a recusa não escreve nada.
if psql -d "$DB" -q -c "
  set local test.uid = '$FORASTEIRO';
  select public.request_to_join('ZZZZZZ');" >/dev/null 2>&1; then
  fail "um código inexistente foi aceito: qualquer conta entraria na fila de qualquer empresa"
fi

# 2. O código vale em minúscula e com espaço colado — ele é DITADO em voz alta e
#    digitado de luva, e recusar por causa disso é transformar um acerto em erro.
NOME=$(psql -d "$DB" -At -c "
  set local test.uid = '$FORASTEIRO';
  set local test.jwt = '{\"email\": \"forasteiro@exemplo.com\"}';
  select public.request_to_join(' $(echo "$CODIGO" | tr 'A-Z' 'a-z') ');")
[ -n "$NOME" ] || fail "o código válido em minúscula e com espaço foi recusado"

# 3. E o que entrou é PENDENTE e sem capacidade nenhuma.
ESTADO=$(psql -d "$DB" -At -c "
  select state || '/' || coalesce(array_length(capabilities, 1), 0)
    from memberships where company_id = '$EMPRESA' and user_id = '$FORASTEIRO';")
[ "$ESTADO" = "pending/0" ] ||
  fail "o pedido entrou como '$ESTADO' e devia ser 'pending/0': pedir para entrar não é entrar"

# 4. Pedir de novo não cria segunda linha nem reescreve a primeira.
psql -d "$DB" -q -c "
  set local test.uid = '$FORASTEIRO';
  set local test.jwt = '{\"email\": \"forasteiro@exemplo.com\"}';
  select public.request_to_join('$CODIGO');" >/dev/null
LINHAS=$(psql -d "$DB" -At -c "
  select count(*) from memberships where company_id = '$EMPRESA' and user_id = '$FORASTEIRO';")
[ "$LINHAS" = "1" ] || fail "pedir duas vezes rendeu $LINHAS linhas: a fila duplica"

# 5. E quem JÁ é membro ativo não é rebaixado por pedir de novo.
psql -d "$DB" -q -c "
  set local test.uid = '$DONO';
  set local test.jwt = '{\"email\": \"dono@exemplo.com\"}';
  select public.request_to_join('$CODIGO');" >/dev/null
AINDA=$(psql -d "$DB" -At -c "
  select state from memberships where company_id = '$EMPRESA' and user_id = '$DONO';")
[ "$AINDA" = "active" ] ||
  fail "quem já era membro ativo virou '$AINDA' ao pedir de novo: um toque tirava o dono do sistema"

echo "    código errado é recusado, o certo entra pendente e sem capacidade, e pedir de novo não desfaz nada"

echo "==> check 20: o pedido de Reset é fato, o prazo é do servidor, e nada morre antes de vencer"

# A empresa e a conta do dono desta checagem. Uma segunda empresa entra junto: o Reset
# tem de destruir SÓ quem pediu, e provar isolamento com uma empresa só é provar nada.
R=00000000-0000-4dd0-8000-0000000000
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id) values ('${R}91'), ('${R}92');
insert into companies (id, name) values ('${R}01', 'Reset Co'), ('${R}02', 'Vizinha Co');
insert into memberships (company_id, user_id, display_name, capabilities)
  values ('${R}01', '${R}91', 'Dona do Reset', enum_range(null::capability)),
         ('${R}02', '${R}92', 'Dona da vizinha', enum_range(null::capability));
insert into locations (id, company_id, kind, name)
  values ('${R}a1', '${R}01', 'factory', 'Fábrica'),
         ('${R}a2', '${R}02', 'factory', 'Fábrica');
insert into items (id, company_id, kind, name, purchase_unit, purchase_to_base)
  values ('${R}b1', '${R}01', 'input', 'Polpa', 'balde', 10000),
         ('${R}b2', '${R}02', 'input', 'Polpa', 'balde', 10000);
insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id,
                       quantity_base_units, location_id)
  values ('${R}d1', '${R}01', 'purchase', now(), '${R}91', '${R}b1', 5000, '${R}a1'),
         ('${R}d2', '${R}02', 'purchase', now(), '${R}92', '${R}b2', 7000, '${R}a2');
SQL

# 1. Quem NÃO administra não pede. O `app_user` é o papel do aplicativo, e a conta é a
#    da empresa: sem a capacidade, a política recusa antes de qualquer coisa.
psql -d "$DB" -q -c "
  insert into memberships (company_id, user_id, display_name, capabilities)
    values ('${R}01', '${R}92', 'Operadora', array['record_production']::capability[]);" >/dev/null
#
#    E isto roda numa STRING só, não num heredoc: `set local` vale dentro de
#    transação, e o psql manda uma string como UM lote — que é uma transação. Num
#    heredoc cada linha é a sua, o `set local` se perde, e a checagem passa a
#    exercitar uma sessão sem identidade nenhuma. Foi o que me custou a primeira
#    execução: ela acusou o servidor de aceitar o que ele tinha recusado.
if psql -d "$DB" -q -c "
  set role app_user;
  set local test.uid = '${R}92';
  insert into erase_requests (id, company_id, area, requested_by)
    values ('${R}e9', '${R}01', 'all', '${R}92');" >/dev/null 2>&1; then
  fail "quem não administra a empresa conseguiu pedir o Reset dela"
fi

# 2. O dono pede, e o PRAZO é do servidor: o pedido manda uma data no passado e o
#    servidor a sobrescreve com os dez dias da empresa. Um aparelho com a data adiantada
#    destruiria no ato o que a empresa combinou guardar.
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  set role app_user;
  set local test.uid = '${R}91';
  insert into erase_requests (id, company_id, area, requested_by, effective_at)
    values ('${R}e1', '${R}01', 'all', '${R}91', now() - interval '30 days');" >/dev/null
FOLGA=$(psql -d "$DB" -At -c "
  select round(extract(epoch from (effective_at - requested_at)) / 86400)
    from erase_requests where id = '${R}e1';")
[ "$FOLGA" = "10" ] ||
  fail "o prazo do pedido ficou em '$FOLGA' dias e o padrão da empresa é 10: quem manda no prazo é o servidor"

# 3. Pedido é fato: sem update e sem delete, nem para quem pediu.
if psql -d "$DB" -q -c "
  set role app_user;
  set local test.uid = '${R}91';
  update erase_requests set area = 'inputs' where id = '${R}e1';" >/dev/null 2>&1; then
  fail "o pedido de Reset foi reescrito — pedido não se reescreve, desistir é outro pedido"
fi
if psql -d "$DB" -q -c "
  set role app_user;
  set local test.uid = '${R}91';
  delete from erase_requests where id = '${R}e1';" >/dev/null 2>&1; then
  fail "o pedido de Reset foi apagado — ele é fato, e fato não se apaga"
fi

# 4. E nada morre antes de vencer.
VENCIDOS=$(psql -d "$DB" -At -c "select private.run_due_erases();")
[ "$VENCIDOS" = "0" ] || fail "o Reset executou $VENCIDOS pedido(s) que ainda não venceram"
AINDA=$(psql -d "$DB" -At -c "select count(*) from movements where company_id = '${R}01';")
[ "$AINDA" = "1" ] || fail "o razão da empresa perdeu linha antes do prazo: sobrou $AINDA"

echo "    quem não administra não pede, o prazo é do servidor, o pedido não se reescreve, e nada morre antes"

echo "==> check 21: vencido, o Reset destrói só quem pediu — e a porta fecha atrás dele"

# A empresa escolhe destruir no ato, que é um dos três casos que o dono nomeou.
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  update companies set erase_grace_days = 0 where id = '${R}01';" >/dev/null
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  set role app_user;
  set local test.uid = '${R}91';
  insert into erase_requests (id, company_id, area, requested_by)
    values ('${R}e2', '${R}01', 'all', '${R}91');" >/dev/null

FEITOS=$(psql -d "$DB" -At -c "select private.run_due_erases();")
[ "$FEITOS" = "1" ] || fail "o Reset vencido executou $FEITOS pedido(s), e devia ser 1"

SOBROU=$(psql -d "$DB" -At -c "select count(*) from movements where company_id = '${R}01';")
[ "$SOBROU" = "0" ] || fail "o Reset deixou $SOBROU linha(s) do razão da empresa que pediu"

VIZINHA=$(psql -d "$DB" -At -c "select count(*) from movements where company_id = '${R}02';")
[ "$VIZINHA" = "1" ] ||
  fail "o Reset de uma empresa mexeu no razão da vizinha: sobraram $VIZINHA de 1"

MARCADO=$(psql -d "$DB" -At -c "
  select count(*) from erase_requests where id = '${R}e2' and done_at is not null;")
[ "$MARCADO" = "1" ] || fail "o pedido executado não ficou marcado como feito — a próxima execução o repetiria"

# E a porta FECHA: um delete comum no razão continua sendo recusado, inclusive para o
# dono do banco, que é o que a checagem 1 prova no começo. Sem isto, a migração do Reset
# teria trocado a tranca do livro-razão por um bilhete.
if psql -d "$DB" -q -c "delete from movements where company_id = '${R}02';" >/dev/null 2>&1; then
  fail "depois do Reset o razão aceitou um DELETE comum — a porta do apagamento ficou aberta"
fi
# Nem pondo a bandeira à mão como a conta do aplicativo: ela não é dona da tabela.
if psql -d "$DB" -q -c "
  set role app_user;
  select set_config('private.erasing', 'sim', false);
  delete from movements where company_id = '${R}02';" >/dev/null 2>&1; then
  fail "a conta do aplicativo abriu o razão só pondo a bandeira — o par tem de exigir o dono da tabela"
fi

echo "    destrói quem pediu, não toca a vizinha, marca o pedido, e o razão volta a ser intocável"

echo "==> check 22: uma sala fica dentro de UMA unidade, e nunca dentro da vizinha"

# Duas empresas, cada uma com a sua unidade. A `U` é o prefixo desta checagem.
U=cccc0000-0000-4000-8000-0000000000
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  insert into companies (id, name, join_code) values
    ('${U}01', 'Fabrica A', 'UNIDA1'),
    ('${U}02', 'Fabrica B', 'UNIDB2');
  insert into locations (id, company_id, kind, name) values
    ('${U}01', '${U}01', 'factory', 'A matriz'),
    ('${U}02', '${U}02', 'factory', 'B matriz'),
    ('${U}11', '${U}01', 'cold_room', 'Camara de A');" >/dev/null

# 1. A câmara de A entra na unidade de A. Este é o caminho normal.
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  update locations set parent_location_id = '${U}01' where id = '${U}11';" >/dev/null

# 2. E ela NÃO entra na unidade da vizinha. Sem a chave composta isto passaria, e o
#    saldo de uma fábrica passaria a somar a sala de um concorrente.
if psql -d "$DB" -q -c "
  update locations set parent_location_id = '${U}02' where id = '${U}11';" >/dev/null 2>&1; then
  fail "uma sala aceitou ficar dentro da unidade de OUTRA empresa"
fi

# 3. Uma sala não é a própria unidade.
if psql -d "$DB" -q -c "
  update locations set parent_location_id = '${U}11' where id = '${U}11';" >/dev/null 2>&1; then
  fail "uma sala aceitou ser o próprio pai"
fi

# 4. E apagar a unidade não leva a sala embora — `restrict` e não `cascade`, porque
#    sala apagada em cascata levaria o location_id de movimento com ela.
if psql -d "$DB" -q -c "
  delete from locations where id = '${U}01';" >/dev/null 2>&1; then
  fail "apagar a unidade levou a sala junto: o restrict virou cascade"
fi

# 5. O backfill: a câmara que existia ANTES da 0046 ficou dentro da unidade padrão.
#    Sem isto o recorte por unidade excluiria a câmara de quem já usa o aplicativo,
#    e o saldo cairia calado.
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  insert into locations (id, company_id, kind, name, parent_location_id) values
    ('${U}12', '${U}02', 'store_room', 'Almoxarifado de B', null);
  update locations sala set parent_location_id = sala.company_id
   where sala.kind in ('cold_room','store_room') and sala.parent_location_id is null
     and sala.id <> sala.company_id
     and exists (select 1 from locations u where u.id = sala.company_id and u.company_id = sala.company_id);" >/dev/null
DENTRO=$(psql -d "$DB" -At -c "select parent_location_id from locations where id = '${U}12';")
[ "$DENTRO" = "${U}02" ] || fail "o backfill não pôs a sala interna dentro da unidade: veio '$DENTRO'"

echo "    a sala entra na unidade da própria empresa, nunca na da vizinha, nunca em si mesma, e o backfill alcança a que já existia"


echo "==> check 23: quem CONTA pode gravar a venda que a contagem dele descobriu"

# A venda ganhou escritor em 8 de setembro: numa loja própria, o que a contagem
# encontra de FALTA foi comprado por alguém. Isso põe uma pergunta nova para o
# servidor, e ela é do tipo que o SQLite não sabe fazer — QUEM pode escrever uma
# venda.
#
# **A `0001` respondeu `dispatch`, e respondeu certo para o mundo dela:** a única
# venda imaginável era carregar mercadoria para um cliente, e quem carrega despacha.
# Com a contagem escrevendo venda, a mesma linha passa a ter duas origens, e a
# segunda é autorizada por outra capacidade: quem conta tem `adjust_stock`.
#
# O Conferente da check 5 é exatamente esse caso — `['check_receipt','adjust_stock']`,
# sem `dispatch`. Sem esta garantia o defeito é do pior tipo que este repositório
# conhece: a contagem é aceita no celular, a linha entra na fila, o servidor a recusa
# por permissão, e **tudo o que a fábrica gravar depois fica preso atrás dela**. E
# nada disso aparece em teste do aparelho, porque o SQLite não tem política.
V=dddd0000-0000-4000-8000-0000000000
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  insert into locations (id, company_id, kind, name) values
    ('${V}a1', '${M}c1', 'own_store', 'Loja do balcao');" >/dev/null  # proofgate-allow

# 1. O Conferente conta a loja e a falta entra como VENDA, com o preço congelado.
as_user "$CHECKER" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  item_id, quantity_base_units, location_id, unit_cost_rate, unit_price_rate) values
  ('${V}d1','${M}c1','sale',now(),'$CHECKER','${M}b1',-340,'${V}a1',0.64,2.2);" >/dev/null 2>&1 || true  # proofgate-allow
vendeu=$(rows "select count(*) from movements where id = '${V}d1';")  # proofgate-allow
[ "$vendeu" = "1" ] || fail "quem conta não conseguiu gravar a venda que a contagem dele descobriu: a fila trava aqui"

# 2. E a relaxação ficou ESTREITA. Quem não conta nem despacha continua sem vender —
#    senão a garantia acima teria comprado o buraco em vez de fechar a porta certa.
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into auth.users (id) values ('00000000-0000-4000-8000-000000000009');
insert into memberships (company_id, user_id, display_name, capabilities)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000009',
          'Só pede', array['place_order']::capability[]);
SQL
SOPEDE=00000000-0000-4000-8000-000000000009
as_user "$SOPEDE" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  item_id, quantity_base_units, location_id, unit_price_rate) values
  ('${V}d2','${M}c1','sale',now(),'$SOPEDE','${M}b1',-10,'${V}a1',2.2);" >/dev/null 2>&1 || true  # proofgate-allow
colou=$(rows "select count(*) from movements where id = '${V}d2';")  # proofgate-allow
[ "$colou" = "0" ] || fail "quem só faz pedido gravou uma venda: a porta abriu demais"

# 3. O portão da LEITURA continua sendo outro, e é aqui que a fundação se prova: o
#    Conferente congelou um preço que ele NÃO PODE VER. Permissão mora na consulta,
#    então não existe número para vazar — e o fato não depende de quem segurou o
#    celular. Se o portão estivesse no caminho da escrita, a contagem do operador
#    gravaria venda sem preço e a receita do mês sairia menor para quem conta e
#    maior para quem administra, as duas sem uma reclamação.
# Quem PODE ver preço é quem tem `view_sale_price`, e a Dona da check 3 não tem — ela
# tem `view_cost`. As duas capacidades são separadas de propósito: o gerente de uma
# loja precisa do preço e não do custo, e o comprador precisa dos dois. Ler com o
# ator errado aqui provaria o contrário do que a garantia afirma.
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into auth.users (id) values ('00000000-0000-4000-8000-000000000008');
insert into memberships (company_id, user_id, display_name, capabilities)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000008',
          'Gerente da loja', array['view_sale_price','adjust_stock']::capability[]);
SQL
GERENTE=00000000-0000-4000-8000-000000000008

gerente_preco=$(as_user "$GERENTE" "select unit_price_rate from movements_visible where id = '${V}d1';")  # proofgate-allow
[ "$gerente_preco" = "2.2" ] || fail "o preço congelado não chegou a quem pode vê-lo: '$gerente_preco'"

# E a assimetria com o custo, que é o que prova que são duas perguntas: o mesmo
# gerente NÃO vê o custo, e a Dona vê o custo e não vê o preço. Uma capacidade só
# respondendo as duas seria o defeito que este projeto já pagou noutra coluna.
gerente_custo=$(as_user "$GERENTE" "select coalesce(unit_cost_rate::text, 'null') from movements_visible where id = '${V}d1';")  # proofgate-allow
[ "$gerente_custo" = "null" ] || fail "quem vê preço passou a ver custo: '$gerente_custo'"

dona_preco=$(as_user "$OWNER" "select coalesce(unit_price_rate::text, 'null') from movements_visible where id = '${V}d1';")  # proofgate-allow
[ "$dona_preco" = "null" ] || fail "quem tem view_cost e não view_sale_price leu o preço: '$dona_preco'"

conf_preco=$(as_user "$CHECKER" "select coalesce(unit_price_rate::text, 'null') from movements_visible where id = '${V}d1';")  # proofgate-allow
[ "$conf_preco" = "null" ] || fail "quem não tem view_sale_price leu o preço: '$conf_preco'"

# E a linha NÃO está escondida: a quantidade chega, só o dinheiro não. Esconder a
# linha inteira faria o saldo da loja divergir entre duas pessoas da mesma empresa.
conf_qtd=$(as_user "$CHECKER" "select quantity_base_units from movements_visible where id = '${V}d1';")  # proofgate-allow
[ "$conf_qtd" = "-340" ] || fail "a venda desapareceu para quem não vê preço: o saldo passa a depender de quem pergunta"

echo "    quem conta grava a venda, quem só pede não, e o preço congelado não chega a quem não pode vê-lo"


echo "==> check 24: desfazer uma conferência que BATEU não é recusado pelo banco"

# A restrição `movement_moved_something` (0008, ampliada pela 0017) deixa passar
# quantidade zero em dois casos — contagem de prateleira e conferência COM posto —
# e recusava o ESPELHO dos dois. `reverseGroup` grava o contrário de cada linha do
# ato: o contrário de zero é zero, e o estorno não copia `post`.
#
# É o defeito mais caro que este projeto conhece: o SQLite do aparelho não tem a
# restrição, então a linha entra, a tela diz que desfez, e o servidor recusa. Recusa
# por restrição não é recuperável, e a fila daquele celular para atrás dela — calada.
W=eeee0000-0000-4000-8000-0000000000

# 1. A conferência que bateu (a linha legítima que a 0017 abriu).
as_user "$CHECKER" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  item_id, quantity_base_units, location_id, post) values
  ('${W}f1','${M}c1','discrepancy',now(),'$CHECKER','${M}b1',0,'${V}a1','checked');" >/dev/null 2>&1 || true  # proofgate-allow
conferiu=$(rows "select count(*) from movements where id = '${W}f1';")  # proofgate-allow
[ "$conferiu" = "1" ] || fail "a conferência que bateu não entrou: a 0017 quebrou"

# 2. E DESFAZÊ-LA entra também — que é o que faltava.
as_user "$CHECKER" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  item_id, quantity_base_units, location_id, reverses_movement_id) values
  ('${W}f2','${M}c1','reversal',now(),'$CHECKER','${M}b1',0,'${V}a1','${W}f1');" >/dev/null 2>&1 || true  # proofgate-allow
desfez=$(rows "select count(*) from movements where id = '${W}f2';")  # proofgate-allow
[ "$desfez" = "1" ] || fail "desfazer a conferência que bateu foi recusado: a fila do aparelho para aqui, calada"

# 3. E a exceção ficou ESTREITA. Linha de zero que não desfaz nada e não tem posto
#    continua recusada — senão a garantia acima teria comprado o buraco que a 0008
#    escreveu para fechar: ruído no livro-razão.
as_user "$CHECKER" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  item_id, quantity_base_units, location_id) values
  ('${W}f3','${M}c1','transfer',now(),'$CHECKER','${M}b1',0,'${V}a1');" >/dev/null 2>&1 || true  # proofgate-allow
ruido=$(rows "select count(*) from movements where id = '${W}f3';")  # proofgate-allow
[ "$ruido" = "0" ] || fail "uma linha que não move nada e não desfaz nada entrou: a porta abriu demais"

echo "    a conferência que bateu entra, desfazê-la entra, e ruído continua recusado"


echo "==> check 25: apagar os INSUMOS deixa o catálogo de produtos de pé"

# O Reset por área promete apagar uma área. A `0045` apagava `items` sem dizer de que
# espécie, e `items` guarda as cinco — então "apagar insumos" tinha dois desfechos, os
# dois errados, e qual deles dependia do dado:
#
#   * `products.item_id` referencia `items` com CASCADE: sem lote no caminho, o catálogo
#     de PRODUTOS ia junto, em silêncio, depois de uma confirmação que contou outra coisa;
#   * `lots.item_id` referencia `items` com RESTRICT e o ramo não apaga lotes: com
#     qualquer corrida de produção gravada, o `delete` levantava chave estrangeira e
#     NADA era apagado.
#
# Nada disso é visível de dentro do aparelho: o SQLite tem outra semântica de chave
# (`movements.item_id` é CASCADE lá e RESTRICT aqui), e o `itemKindsFor` de
# `src/data/erase.ts` sempre nomeou as três espécies. Era o servidor que divergia.
RST=cccc0000-0000-4000-8000-0000000000
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
insert into auth.users (id) values ('${RST}a0');
-- Prazo zero: o pedido vence no ato, que é um dos três casos que o dono nomeou.
insert into companies (id, name, erase_grace_days) values ('${RST}a1', 'Reset Co', 0);
insert into memberships (company_id, user_id, display_name, capabilities)
  values ('${RST}a1', '${RST}a0', 'Dona do Reset', enum_range(null::capability));
insert into locations (id, company_id, kind, name) values ('${RST}a2','${RST}a1','factory','Fábrica');

-- Um insumo, uma embalagem, um material de loja — e um PRODUTO, que é o que não pode ir.
insert into items (id, company_id, kind, name, base_unit) values
  ('${RST}b1','${RST}a1','input','Polpa','g'),
  ('${RST}b2','${RST}a1','packaging','Saquinho','un'),
  ('${RST}b3','${RST}a1','store_supply','Guardanapo','un'),
  ('${RST}b4','${RST}a1','product','Picolé','un');
insert into products (id, company_id, item_id) values ('${RST}c1','${RST}a1','${RST}b4');
-- O lote é o que fazia o jeito antigo abortar: toda corrida de produção grava um.
insert into lots (id, company_id, item_id, code) values ('${RST}d1','${RST}a1','${RST}b4','L-1');
SQL

# --- O CASO FALSO, primeiro: o jeito antigo reprova nesta mesma cena. ---
#
# Sem isto a checagem abaixo não distingue o mundo consertado do quebrado, que é a régua
# que este repositório cobra de todo guarda. Os dois desfechos são demonstrados, cada um
# dentro de uma transação que volta atrás.
antigo_fk=$(psql -d "$DB" -Atq -c "begin; delete from public.items where company_id = '${RST}a1'; rollback;" 2>&1 || true)  # proofgate-allow
case "$antigo_fk" in
  *"violates foreign key"*) : ;;
  *) fail "o delete sem espécie NÃO levantou chave estrangeira nesta cena: a checagem não separa os dois mundos" ;;
esac

antigo_cascata=$(psql -d "$DB" -Atq -c "begin;
  delete from public.lots where company_id = '${RST}a1';
  delete from public.items where company_id = '${RST}a1';
  select count(*) from public.products where company_id = '${RST}a1';
  rollback;" 2>&1 | tail -1)  # proofgate-allow
[ "$antigo_cascata" = "0" ] || fail "o delete sem espécie não levou os produtos por cascata (contou '$antigo_cascata'): a cena não reproduz o defeito"

# --- E agora o conserto, na mesma cena. ---
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "insert into erase_requests (id, company_id, area, requested_by)
  values ('${RST}e1','${RST}a1','inputs','${RST}a0');" >/dev/null  # proofgate-allow
feitos=$(rows "select private.run_due_erases();")  # proofgate-allow
# O motivo vem junto: o executor engole a exceção de propósito (é isso que a checagem 26
# prova), então uma checagem que só diga "não executou" manda quem lê abrir o banco.
porque=$(rows "select coalesce(last_error, '(sem erro registrado)') from erase_requests where id = '${RST}e1';")  # proofgate-allow
[ "$feitos" = "1" ] || fail "o Reset de insumos não executou (devolveu '$feitos') — o banco disse: $porque"

sobrou_insumo=$(rows "select count(*) from items where company_id = '${RST}a1' and kind in ('input','packaging','store_supply');")  # proofgate-allow
[ "$sobrou_insumo" = "0" ] || fail "sobraram $sobrou_insumo insumos: o Reset não fez o que prometeu"

sobrou_produto=$(rows "select count(*) from items where company_id = '${RST}a1' and kind = 'product';")  # proofgate-allow
[ "$sobrou_produto" = "1" ] || fail "o item do PRODUTO sumiu junto com os insumos: a segunda confirmação mentiu"

catalogo=$(rows "select count(*) from products where company_id = '${RST}a1';")  # proofgate-allow
[ "$catalogo" = "1" ] || fail "o catálogo de produtos foi apagado por um Reset de insumos"

lote=$(rows "select count(*) from lots where company_id = '${RST}a1';")  # proofgate-allow
[ "$lote" = "1" ] || fail "o lote sumiu num Reset que não fala de lote"

echo "    o Reset de insumos leva as três espécies de insumo e deixa produto, catálogo e lote"


echo "==> check 26: um pedido que falha não trava o Reset das outras empresas"

# `private.run_due_erases()` percorre os pedidos vencidos de TODAS as empresas. Na `0045`
# o laço era uma transação só: uma exceção em qualquer pedido abortava a função inteira —
# nenhuma empresa atendida, nenhum pedido marcado, e o agendador tentando de novo na noite
# seguinte com o mesmo pedido na frente. É a família de defeito que este repositório já
# conhece da fila do aparelho: **recusa que nenhuma tentativa resolve tem de sair da
# frente**, e tem de deixar rastro.
ISO=cccc0000-0000-4000-8000-0000000001
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
insert into auth.users (id) values ('${ISO}a0'), ('${ISO}a1');

-- A empresa que VAI FALHAR: uma ficha usa o insumo, e recipe_lines.item_id e RESTRICT.
-- (sem crase: este heredoc nao e citado, e crase ali dentro o shell EXECUTA.)
insert into companies (id, name, erase_grace_days) values ('${ISO}a2', 'Trava Co', 0);
insert into memberships (company_id, user_id, display_name, capabilities)
  values ('${ISO}a2', '${ISO}a0', 'Dona 1', enum_range(null::capability));
insert into items (id, company_id, kind, name, base_unit) values ('${ISO}b1','${ISO}a2','input','Açúcar','g');
insert into recipes (id, company_id, name, yield_amount) values ('${ISO}c1','${ISO}a2','Base', 40000);
insert into recipe_versions (id, company_id, recipe_id, version) values ('${ISO}d1','${ISO}a2','${ISO}c1', 1);
insert into recipe_lines (id, company_id, recipe_version_id, item_id, quantity)
  values ('${ISO}d2','${ISO}a2','${ISO}d1','${ISO}b1', 500);

-- A empresa que VAI PASSAR, e o pedido dela é o segundo da fila.
insert into companies (id, name, erase_grace_days) values ('${ISO}a3', 'Passa Co', 0);
insert into memberships (company_id, user_id, display_name, capabilities)
  values ('${ISO}a3', '${ISO}a1', 'Dona 2', enum_range(null::capability));
insert into recipes (id, company_id, name, yield_amount) values ('${ISO}c2','${ISO}a3','Outra', 20000);
SQL

# A ordem do laço é por `requested_at`, então o que falha entra primeiro de propósito:
# é essa ordem que provava o defeito antigo — o segundo nunca chegava a ser tentado.
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "insert into erase_requests (id, company_id, area, requested_by, requested_at)
  values ('${ISO}e1','${ISO}a2','inputs','${ISO}a0', now() - interval '2 hours');" >/dev/null  # proofgate-allow
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "insert into erase_requests (id, company_id, area, requested_by, requested_at)
  values ('${ISO}e2','${ISO}a3','recipes','${ISO}a1', now() - interval '1 hour');" >/dev/null  # proofgate-allow

# O CASO FALSO: o pedido da primeira empresa de fato levanta exceção nesta cena. Sem isso
# a checagem abaixo passaria com uma volta em que nada falhou — medindo nada.
falha=$(psql -d "$DB" -Atq -c "begin; delete from public.items where company_id = '${ISO}a2' and kind = 'input'; rollback;" 2>&1 || true)  # proofgate-allow
case "$falha" in
  *"violates foreign key"*) : ;;
  *) fail "o pedido que devia falhar não falha nesta cena: a checagem não mede isolamento" ;;
esac

atendidos=$(rows "select private.run_due_erases();")  # proofgate-allow
[ "$atendidos" = "1" ] || fail "esperava exatamente um pedido atendido, veio '$atendidos'"

# O que falhou: não marcado como feito, com a data e o motivo escritos.
travou_feito=$(rows "select coalesce(done_at::text,'null') from erase_requests where id = '${ISO}e1';")  # proofgate-allow
[ "$travou_feito" = "null" ] || fail "um pedido que falhou foi marcado como feito"
travou_motivo=$(rows "select case when failed_at is not null and coalesce(last_error,'') <> '' then 'sim' else 'nao' end from erase_requests where id = '${ISO}e1';")  # proofgate-allow
[ "$travou_motivo" = "sim" ] || fail "a falha não deixou rastro: quem olhar amanhã não sabe por que o Reset não aconteceu"

# E o insumo dele continua lá, porque a subtransação voltou atrás inteira.
travou_item=$(rows "select count(*) from items where company_id = '${ISO}a2';")  # proofgate-allow
[ "$travou_item" = "1" ] || fail "o pedido falhou e mesmo assim apagou coisa: a subtransação não voltou atrás"

# O que estava ATRÁS dele na fila foi atendido — que é a coisa inteira.
passou=$(rows "select coalesce(done_at::text,'null') from erase_requests where id = '${ISO}e2';")  # proofgate-allow
[ "$passou" != "null" ] || fail "o pedido da segunda empresa ficou preso atrás do que falhou: o Reset trava o banco inteiro"
passou_receita=$(rows "select count(*) from recipes where company_id = '${ISO}a3';")  # proofgate-allow
[ "$passou_receita" = "0" ] || fail "o pedido foi marcado como feito e a receita continua lá"

echo "    o que falha anota o motivo e sai da frente; quem vem atrás é atendido na mesma volta"


echo "==> check 27: uma loja é atendida por UMA unidade, e nunca pela da vizinha"

# A `0050` deu à loja a unidade que produz para ela, e é uma relação DIFERENTE de estar
# dentro: `parent_location_id` soma no saldo, `served_by_location_id` não soma nada — ele
# só diz de quem é o pedido. Reusar o pai teria compilado e jogado o estoque de prateleira
# de loja dentro do saldo da fábrica.
#
# O que só o Postgres prova: a chave é COMPOSTA. Sem a empresa junto, a loja de uma
# fábrica apontaria para a unidade de um concorrente e a demanda de uma empresa passaria a
# somar o pedido da outra. O SQLite do aparelho não tem chave composta — é aqui, e só
# aqui, que essa metade existe.
SRV=cccc0000-0000-4000-8000-0000000002
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
insert into companies (id, name) values ('${SRV}a1', 'Serve Co'), ('${SRV}a2', 'Vizinha Co');
insert into locations (id, company_id, kind, name) values
  ('${SRV}b1','${SRV}a1','factory','Unidade um'),
  ('${SRV}b2','${SRV}a1','factory','Unidade dois'),
  ('${SRV}b3','${SRV}a2','factory','Unidade da vizinha');
insert into locations (id, company_id, kind, name) values ('${SRV}c1','${SRV}a1','own_store','Loja daqui');
SQL

# 1. A loja entra apontando para uma unidade da PRÓPRIA empresa.
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "update locations set served_by_location_id = '${SRV}b2' where id = '${SRV}c1';" >/dev/null  # proofgate-allow
atende=$(rows "select served_by_location_id from locations where id = '${SRV}c1';")  # proofgate-allow
[ "$atende" = "${SRV}b2" ] || fail "a loja não conseguiu dizer que unidade a atende: '$atende'"

# 2. E NUNCA para a unidade da vizinha — é a chave composta que recusa.
psql -d "$DB" -q -c "update locations set served_by_location_id = '${SRV}b3' where id = '${SRV}c1';" >/dev/null 2>&1 || true  # proofgate-allow
vizinha=$(rows "select served_by_location_id from locations where id = '${SRV}c1';")  # proofgate-allow
[ "$vizinha" = "${SRV}b2" ] || fail "a loja passou a ser atendida pela unidade de OUTRA empresa: '$vizinha'"

# 3. Nem por si mesma, que é a volta que a auto-referência deixa aberta.
psql -d "$DB" -q -c "update locations set served_by_location_id = '${SRV}c1' where id = '${SRV}c1';" >/dev/null 2>&1 || true  # proofgate-allow
propria=$(rows "select served_by_location_id from locations where id = '${SRV}c1';")  # proofgate-allow
[ "$propria" = "${SRV}b2" ] || fail "a loja passou a atender a si mesma: '$propria'"

# 4. O BACKFILL, replicado — e a cópia é conferida contra o arquivo.
#
# As migrações já rodaram quando as checagens começam, então toda linha criada aqui é
# posterior ao backfill. A saída (a mesma da check 22) é reexecutar a instrução; o risco
# dela é a cópia envelhecer e a checagem passar a provar um backfill que não existe mais.
# Então a cópia é conferida contra o arquivo antes de valer — que é a metade que faltava
# na check 22.
BACKFILL="where loja.kind in ('own_store', 'customer')"
grep -qF "$BACKFILL" supabase/migrations/0050_who_serves_this_store.sql ||
  fail "o backfill da 0050 mudou de forma e esta checagem ficou provando uma cópia velha"

psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
insert into companies (id, name) values ('${SRV}a3', 'Antiga Co');
-- A unidade padrao: a que carrega o id da empresa, como ensureLocation cria.
insert into locations (id, company_id, kind, name) values ('${SRV}a3','${SRV}a3','factory','Fabrica');
insert into locations (id, company_id, kind, name) values
  ('${SRV}d1','${SRV}a3','own_store','Loja de antes'),
  ('${SRV}d2','${SRV}a3','cold_room','Camara de antes');
update locations loja
   set served_by_location_id = loja.company_id
 where loja.kind in ('own_store', 'customer')
   and loja.served_by_location_id is null
   and loja.id <> loja.company_id
   and exists (select 1 from locations u
                where u.id = loja.company_id and u.company_id = loja.company_id);
SQL
antiga=$(rows "select coalesce(served_by_location_id::text,'null') from locations where id = '${SRV}d1';")  # proofgate-allow
[ "$antiga" = "${SRV}a3" ] || fail "o backfill não deu à loja existente a unidade que a atende: '$antiga'"

# 5. E a sala interna NÃO ganhou: ela fica DENTRO de uma unidade, não é atendida por uma.
#    Sem esta metade o backfill teria misturado as duas relações, que é o defeito que a
#    coluna separada existe para não ter — e uma checagem que só olha a loja não veria.
sala=$(rows "select coalesce(served_by_location_id::text,'null') from locations where id = '${SRV}d2';")  # proofgate-allow
[ "$sala" = "null" ] || fail "uma sala interna foi marcada como ATENDIDA: as duas relações se misturaram"

echo "    a loja diz que unidade a atende, nunca a da vizinha nem a si mesma, e o backfill não toca sala"

echo "==> check 28: a segunda conferência da mesma remessa é recusada, e a terceira passa"

# A `0051` põe no servidor a regra que o aparelho ganhou em 9 de setembro. Ela é a metade
# que só o Postgres tem: dois celulares offline na mesma doca conferem a mesma carga, os
# dois aceitam localmente, e é aqui — na chegada — que a segunda tem de morrer.
#
# O que esta checagem prova, e cada metade já foi um defeito possível:
#   1. a primeira conferência entra;
#   2. a perna IRMÃ, do mesmo ato e de OUTRO item, entra — sem isto a regra recusaria a
#      própria conferência que existe para proteger, a partir do segundo item;
#   3. a segunda do MESMO par (grupo, item) é recusada;
#   4. depois do estorno, conferir de novo passa — o caminho legítimo que um índice único
#      teria fechado junto, e a razão de a regra ser gatilho e não índice.
#
# Reusa a empresa e o usuário das checagens acima: usuário novo pede linha em `users`, e
# `recorded_by` é chave estrangeira para lá.
CHK=dddd0000-0000-4000-8000-0000000003
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
insert into items (id, company_id, kind, name, base_unit) values
  ('${CHK}c2','${M}c1','product','Picole da conferencia','un');
-- A carga: duas pernas de ENTRADA na loja, um grupo so.
insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id,
                       quantity_base_units, location_id, counterpart_location_id,
                       movement_group_id)
values
  ('${CHK}d1','${M}c1','transfer', now(), '$CHECKER', '${M}b1',  40, '${V}a1','${M}a1','${CHK}e1'),
  ('${CHK}d2','${M}c1','transfer', now(), '$CHECKER', '${CHK}c2', 25, '${V}a1','${M}a1','${CHK}e1');
SQL

confere() { # $1 = id da linha, $2 = item — sai 0 se a linha entrou
  psql -d "$DB" -q -c "insert into movements (id, company_id, kind, occurred_at, recorded_by,
      item_id, quantity_base_units, location_id, counterpart_location_id, movement_group_id, post)
    values ('$1','${M}c1','discrepancy', now(), '$CHECKER', '$2', -3, '${V}a1','${M}a1','${CHK}e1','checked');" \
    >/dev/null 2>&1  # proofgate-allow
  [ "$(rows "select count(*) from movements where id = '$1';")" = "1" ]  # proofgate-allow
}

# 1. A primeira entra.
confere "${CHK}f1" "${M}b1" || fail "a primeira conferência da remessa foi recusada"

# 2. A perna IRMÃ, outro item do mesmo ato, entra — a regra é por (grupo, item).
confere "${CHK}f2" "${CHK}c2" || fail "a segunda PERNA do mesmo ato foi recusada: a regra virou por grupo"

# 3. A segunda conferência do mesmo par morre aqui.
confere "${CHK}f3" "${M}b1" && fail "a segunda conferência do mesmo item passou: o saldo dobra"

# 4. Desfeita a primeira, conferir de novo passa. Um índice único teria fechado isto.
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "insert into movements (id, company_id, kind, occurred_at,
    recorded_by, item_id, quantity_base_units, location_id, counterpart_location_id,
    movement_group_id, reverses_movement_id)
  values ('${CHK}f4','${M}c1','reversal', now(), '$CHECKER', '${M}b1', 3, '${V}a1','${M}a1','${CHK}e1',
          '${CHK}f1');" >/dev/null  # proofgate-allow
confere "${CHK}f5" "${M}b1" || fail "depois do estorno a remessa não pôde ser conferida de novo"

# 5. E a RETENTATIVA da própria linha aceita não é duplicação — a forma com que o aparelho
#    escreve de verdade, que nenhuma das quatro acima usava.
#
#    A fila sobe por `upsert(..., { onConflict: 'id' })`, que em SQL é
#    `insert ... on conflict (id) do nothing` (`src/sync/transporte.ts`). Gatilho `before
#    insert` dispara ANTES de o conflito de chave ser detectado, então a mesma linha reenviada
#    passa pelo gatilho como se fosse nova — e o gatilho encontra ela mesma de pé.
#
#    O caminho é o comum, não o raro: o servidor grava, a resposta se perde na doca (que é a
#    razão de a fila existir), `markSent` não roda, e o `drain` seguinte reenvia a MESMA
#    entrada. A recusa volta como 23505, `classeDaRecusa` chama de permanente, e a conferência
#    de um celular sozinho é posta de lado para sempre — contra a fundação escrita da fila,
#    "mandar a mesma entrada duas vezes é inofensivo", e contra o docblock desta migração.
#
#    As quatro checagens acima não podiam pegar: todas usam `insert` cru com id NOVO.
psql -d "$DB" -q -c "insert into movements (id, company_id, kind, occurred_at, recorded_by,
    item_id, quantity_base_units, location_id, counterpart_location_id, movement_group_id, post)
  values ('${CHK}f5','${M}c1','discrepancy', now(), '$CHECKER', '${M}b1', -3, '${V}a1','${M}a1','${CHK}e1','checked')
  on conflict (id) do nothing;" >/dev/null 2>"$PGDATA/retry.err" || true  # proofgate-allow
if [ -s "$PGDATA/retry.err" ]; then
  echo "    $(head -1 "$PGDATA/retry.err")"
  fail "a RETENTATIVA da própria conferência foi recusada: um celular sozinho, sem duplicação nenhuma, tem a conferência posta de lado para sempre"
fi

echo "    uma conferência de pé por remessa e item, com o caminho de desfazer aberto"

echo "==> check 29: a variação é do TIPO — o mesmo nome cabe duas vezes, e nunca na empresa vizinha"

# A `0055` move o sabor da empresa para o tipo, e o motivo veio do dono descrevendo a
# fábrica do pai: *"morango leite e morango agua ... usam receitas diferentes"*. Com o nome
# único por empresa, cadastrar os dois morangos era IMPOSSÍVEL — não confuso, impossível.
#
# Três metades, e cada uma já foi um defeito possível:
#   1. o mesmo nome em DOIS tipos entra — sem isto a migração não resolve nada;
#   2. o mesmo nome no MESMO tipo morre — sem isto a grade aceita duplicata e o índice
#      único de produto (linha, tipo, sabor) passa a apontar para dois sabores iguais;
#   3. a variação NÃO pode apontar para o tipo da empresa vizinha — é a fundação
#      multi-empresa, e é a metade que só existe no Postgres: no SQLite do aparelho não
#      há chave composta em `ALTER TABLE ADD COLUMN`, e a garantia mora na escrita.
SAB=eeee0000-0000-4000-8000-0000000001
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
insert into product_lines (id, company_id, name) values ('${SAB}a1','${M}c1','Picole da 29');
insert into product_types (id, company_id, line_id, name) values
  ('${SAB}b1','${M}c1','${SAB}a1','Leite da 29'),
  ('${SAB}b2','${M}c1','${SAB}a1','Agua da 29');
SQL

sabor() { # $1 = id, $2 = tipo, $3 = nome — sai 0 se entrou
  psql -d "$DB" -q -c "insert into flavors (id, company_id, type_id, name)
    values ('$1','${M}c1','$2','$3');" >/dev/null 2>&1  # proofgate-allow
  [ "$(rows "select count(*) from flavors where id = '$1';")" = "1" ]  # proofgate-allow
}

# 1. Morango no leite e morango na água: dois registros, o mesmo nome.
sabor "${SAB}c1" "${SAB}b1" 'Morango' || fail "morango do leite foi recusado"
sabor "${SAB}c2" "${SAB}b2" 'Morango' || fail "morango da agua foi recusado: o nome ainda e unico na empresa"

# 2. Morango de novo no MESMO tipo morre.
sabor "${SAB}c3" "${SAB}b1" 'Morango' && fail "morango repetido no mesmo tipo passou"

# 3. E o tipo da vizinha é recusado pela chave composta, não pela tela.
# O `|| true` não é frouxidão: esta inserção TEM de falhar, e sem ele o `set -e` derruba
# o script exatamente quando a garantia está sendo cumprida — foi o que aconteceu na
# primeira escrita desta checagem, e ela morreu sem imprimir uma palavra.
psql -d "$DB" -q -c "insert into flavors (id, company_id, type_id, name)
  values ('${SAB}c4','${M}c2','${SAB}b1','Roubado');" >/dev/null 2>&1 || true  # proofgate-allow
[ "$(rows "select count(*) from flavors where id = '${SAB}c4';")" = "0" ] \
  || fail "uma variacao apontou para o tipo de OUTRA empresa"

echo "    o mesmo nome cabe em dois tipos, morre repetido no mesmo, e nao cruza a empresa"

echo "==> check 30: a categoria entra entre o produto e o tipo, e nada é obrigatório"

# A `0057` acrescenta o quarto nivel, e o dono disse a regra junto: *"o produto nao
# necessariamente requeira todas as subclasses"*. Entao as quatro metades sao:
#   1. o mesmo nome de tipo em DUAS categorias do mesmo produto entra;
#   2. o mesmo nome na MESMA categoria morre;
#   3. tipo SEM categoria continua entrando — e e o caso comum, o da fabrica do dono;
#   4. a grade de quatro colunas recusa o mesmo produto duas vezes, INCLUSIVE quando
#      nenhum nivel foi preenchido (a fabrica de um doce so, que e quem o `nulls not
#      distinct` protege).
CAT=dddd0000-0000-4000-8000-0000000001
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
insert into product_lines (id, company_id, name) values ('${CAT}a1','${M}c1','Picole da 30');
insert into product_categories (id, company_id, line_id, name) values
  ('${CAT}b1','${M}c1','${CAT}a1','Sem lactose'),
  ('${CAT}b2','${M}c1','${CAT}a1','Tradicional da 30');
SQL

tipo() { # $1 = id, $2 = categoria (ou vazio), $3 = nome — sai 0 se entrou
  if [ -n "$2" ]; then
    psql -d "$DB" -q -c "insert into product_types (id, company_id, line_id, category_id, name)
      values ('$1','${M}c1','${CAT}a1','$2','$3');" >/dev/null 2>&1  # proofgate-allow
  else
    psql -d "$DB" -q -c "insert into product_types (id, company_id, line_id, name)
      values ('$1','${M}c1','${CAT}a1','$3');" >/dev/null 2>&1  # proofgate-allow
  fi
  [ "$(rows "select count(*) from product_types where id = '$1';")" = "1" ]  # proofgate-allow
}

# 1. "500 ml" na categoria sem lactose E na tradicional: dois registros, o mesmo nome.
tipo "${CAT}c1" "${CAT}b1" '500 ml' || fail "o tipo da primeira categoria foi recusado"
tipo "${CAT}c2" "${CAT}b2" '500 ml' || fail "o mesmo nome na OUTRA categoria foi recusado: a categoria nao esta no indice"

# 2. "500 ml" de novo na MESMA categoria morre.
tipo "${CAT}c3" "${CAT}b1" '500 ml' && fail "tipo repetido na mesma categoria passou"

# 3. E o caso comum: tipo SEM categoria. E o que a fabrica do dono usa, e o que a
#    decisao dele exige — nenhuma subclasse e obrigatoria.
tipo "${CAT}c4" "" 'Leite da 30' || fail "tipo sem categoria foi recusado: a decisao do dono diz o contrario"
tipo "${CAT}c5" "" 'Leite da 30' && fail "tipo sem categoria repetido passou: o coalesce do indice nao pegou"

# 4. A grade de quatro colunas, com os niveis de baixo VAZIOS — que e o caso que so o
#    `nulls not distinct` protege: no padrao do Postgres dois nulos nao colidem, entao a
#    fabrica que classifica pouco ficaria sem guarda justamente por classificar pouco.
#
#    O produto leva a linha que esta checagem criou, e nada abaixo. Sem a linha, o caso
#    e o do produto totalmente sem nivel — e esse JA EXISTE nas fixtures, entao tentar
#    inserir o primeiro aqui falha por colidir com ele. Amarrar a garantia ao estado de
#    outra checagem e frageis; este caso se basta.
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
insert into items (id, company_id, kind, name, base_unit) values ('${CAT}d1','${M}c1','product','Doce unico da 30','unit');
insert into products (id, company_id, item_id, line_id) values ('${CAT}e1','${M}c1','${CAT}d1','${CAT}a1');
SQL
# Esta TEM de falhar, e o `|| true` nao e frouxidao: sem ele o `set -e` derruba o
# script exatamente quando a garantia esta sendo cumprida.
psql -d "$DB" -q -c "insert into products (id, company_id, item_id)
  values ('${CAT}e2','${M}c1','${CAT}d1');" >/dev/null 2>&1 || true  # proofgate-allow
[ "$(rows "select count(*) from products where id = '${CAT}e2';")" = "0" ] \
  || fail "o produto sem nivel nenhum entrou duas vezes: a fabrica de um doce so ficou sem guarda"

# E a categoria da empresa VIZINHA e recusada pela chave composta, nao pela tela.
psql -d "$DB" -q -c "insert into product_types (id, company_id, line_id, category_id, name)
  values ('${CAT}c9','${M}c2','${CAT}a1','${CAT}b1','Roubado');" >/dev/null 2>&1 || true  # proofgate-allow
[ "$(rows "select count(*) from product_types where id = '${CAT}c9';")" = "0" ] \
  || fail "um tipo apontou para a categoria de OUTRA empresa"

echo "    o mesmo nome cabe em duas categorias, morre repetido na mesma, e sem categoria tambem vale"

echo "==> check 31: a variacao estreita na CATEGORIA, e o nivel de baixo nao existe sem o de cima"

# A `0059` existe porque a segunda aprovacao do dono de 11 de setembro abriu um buraco na
# primeira. Ele fixou a cadeia (Produto -> Categoria -> Tipo -> Variacao) e depois aprovou
# o que cada nivel SIGNIFICA: categoria muda a RECEITA, tipo muda tamanho, variacao muda o
# sabor. Pela regra nova Leite/Agua saem de "tipo" e vem para "categoria" — e a variacao so
# sabia estreitar em linha ou em tipo. Com o tipo vazio no picole, "morango so no leite"
# ficava inexpressavel: morango virava variacao do produto inteiro e voltava a ser
# oferecido no de agua, que e o que ele mandou travar quando a `0055` nasceu.
#
# Quatro metades, e cada uma ja foi um defeito possivel:
#   1. o mesmo nome de variacao em DUAS categorias do mesmo produto entra;
#   2. o mesmo nome na MESMA categoria morre — senao o indice nao ganhou a coluna;
#   3. variacao SEM categoria continua entrando, e repetida morre — e o caso comum, a
#      fabrica que nunca usou o nivel;
#   4. categoria preenchida com a LINHA vazia e recusada pelo CHECK — o nivel de baixo
#      nao existe sem o de cima.
#
# E a quinta, que e a fundacao: a categoria da empresa vizinha nao classifica nada aqui.
VAR=cccc0000-0000-4000-8000-0000000001
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
insert into product_lines (id, company_id, name) values ('${VAR}a1','${M}c1','Picole da 31');
insert into product_categories (id, company_id, line_id, name) values
  ('${VAR}b1','${M}c1','${VAR}a1','Leite da 31'),
  ('${VAR}b2','${M}c1','${VAR}a1','Agua da 31');
SQL

variacao() { # $1 = id, $2 = categoria (ou vazio), $3 = nome — sai 0 se entrou
  if [ -n "$2" ]; then
    psql -d "$DB" -q -c "insert into flavors (id, company_id, line_id, category_id, name)
      values ('$1','${M}c1','${VAR}a1','$2','$3');" >/dev/null 2>&1  # proofgate-allow
  else
    psql -d "$DB" -q -c "insert into flavors (id, company_id, line_id, name)
      values ('$1','${M}c1','${VAR}a1','$3');" >/dev/null 2>&1  # proofgate-allow
  fi
  [ "$(rows "select count(*) from flavors where id = '$1';")" = "1" ]  # proofgate-allow
}

# 1. Morango no leite E na agua: dois registros, o mesmo nome. E a trava inteira.
variacao "${VAR}c1" "${VAR}b1" 'Morango' || fail "o morango da primeira categoria foi recusado"
variacao "${VAR}c2" "${VAR}b2" 'Morango' || fail "o mesmo nome na OUTRA categoria foi recusado: a categoria nao esta no indice"

# 2. Morango de novo na MESMA categoria morre.
variacao "${VAR}c3" "${VAR}b1" 'Morango' && fail "variacao repetida na mesma categoria passou"

# 3. E o caso comum: variacao do produto inteiro, sem categoria.
variacao "${VAR}c4" "" 'Coco da 31' || fail "variacao sem categoria foi recusada: nenhum nivel e obrigatorio"
variacao "${VAR}c5" "" 'Coco da 31' && fail "variacao sem categoria repetida passou: o coalesce do indice nao pegou"

# 4. O CHECK da direcao: categoria preenchida com a linha vazia nao entra. Esta TEM de
#    falhar, e o `|| true` nao e frouxidao — sem ele o `set -e` derruba o script
#    exatamente quando a garantia esta sendo cumprida.
psql -d "$DB" -q -c "insert into flavors (id, company_id, category_id, name)
  values ('${VAR}c6','${M}c1','${VAR}b1','Sem linha');" >/dev/null 2>&1 || true  # proofgate-allow
[ "$(rows "select count(*) from flavors where id = '${VAR}c6';")" = "0" ] \
  || fail "uma variacao nomeou a categoria sem nomear o produto: o CHECK da direcao nao pegou"

# 4b. O caso FALSO do mesmo CHECK, e ele e o que da valor ao de cima: a variacao orfa da
#     regra da `0055` — sem linha e com TIPO — continua entrando. Um CHECK escrito largo
#     recusaria dado que ja existe e que a tela mostra de proposito.
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
insert into product_types (id, company_id, line_id, name) values ('${VAR}d1','${M}c1','${VAR}a1','Tipo da 31');
insert into flavors (id, company_id, type_id, name) values ('${VAR}c7','${M}c1','${VAR}d1','Orfa da 31');
SQL
[ "$(rows "select count(*) from flavors where id = '${VAR}c7';")" = "1" ] \
  || fail "o CHECK novo recusou a variacao orfa que a 0055 deixou: ele foi escrito largo demais"

# 5. E a categoria da empresa VIZINHA e recusada pela chave composta.
psql -d "$DB" -q -c "insert into flavors (id, company_id, line_id, category_id, name)
  values ('${VAR}c8','${M}c2','${VAR}a1','${VAR}b1','Roubado');" >/dev/null 2>&1 || true  # proofgate-allow
[ "$(rows "select count(*) from flavors where id = '${VAR}c8';")" = "0" ] \
  || fail "uma variacao apontou para a categoria de OUTRA empresa"

echo "    morango cabe em duas categorias, morre repetido na mesma, e nao existe sem produto"

echo "==> check 32: o CÓDIGO da recusa é o que o aparelho trata como permanente"

# **O elo que faltava era uma suposição na minha própria mão.**
#
# A `0051` recusa a segunda conferência com `errcode = 'unique_violation'`, e
# `src/sync/recusa.ts` promove `23505` a recusa PERMANENTE — a fila põe a linha de lado em
# vez de tentar para sempre. Entre as duas pontas existe um fato que ninguém media: **que o
# Postgres traduz `unique_violation` em `23505`.** `src/sync/recusa.test.ts` prova que a
# migração NOMEIA o código, e faz isso bem; a tradução, porém, era uma constante escrita por
# mim dentro do próprio teste (`{ '23505': 'unique_violation' }`). Duas coisas escritas pela
# mesma mão não guardam nada, e esta era a mão.
#
# Se a tradução estivesse errada, NADA ficaria vermelho e o efeito seria o defeito mais caro
# que este projeto conhece: a recusa CERTA volta classificada como passageira, a fila tenta de
# novo para sempre, e tudo o que o aparelho gravou depois fica preso atrás — calado.
#
# A garantia 28 dispara exatamente este erro e joga o código no lixo (`2>&1 >/dev/null`),
# porque ela pergunta outra coisa: se a linha entrou. Esta pergunta o código.
#
# Lido de DENTRO do Postgres — `sqlstate` num bloco com `exception` —, e não da mensagem do
# `psql`: formato de texto de cliente muda de versão, `sqlstate` é o valor.
#
# Reusa o estado da 28, como ela mesma reusa a empresa das anteriores: lá a `f5` ficou como a
# conferência de pé do par (grupo, item), então uma segunda bate na mesma parede.
CODIGO=$(psql -d "$DB" -Atq -c "
create or replace function pg_temp.conferir_de_novo() returns text language plpgsql as \$fn\$
begin
  insert into movements (id, company_id, kind, occurred_at, recorded_by, item_id,
      quantity_base_units, location_id, counterpart_location_id, movement_group_id, post)
  values ('${CHK}fa','${M}c1','discrepancy', now(), '$CHECKER', '${M}b1', -3,
          '${V}a1','${M}a1','${CHK}e1','checked');
  return 'ENTROU';
exception when others then
  return sqlstate;
end \$fn\$;
select pg_temp.conferir_de_novo();")  # proofgate-allow

[ -n "$CODIGO" ] || fail "a medida do código não devolveu nada: a régua não mediu, e régua que não mede concorda com qualquer coisa"
[ "$CODIGO" != "ENTROU" ] || fail "a segunda conferência da mesma remessa PASSOU: a 0051 não está de pé e o saldo dobra"

# A lista que o APARELHO usa, lida do arquivo dele. Duas mãos: o código vem do Postgres, a
# lista vem do TypeScript, e nenhuma das duas passou pela outra.
#
# **A leitura se separa do CONTEÚDO, e isso saiu de provar a régua.** Esvaziar a lista é a
# mutação que a guarda de TypeScript aceita de graça — `CODIGOS_PERMANENTES` vazio satisfaz
# "todo código promovido tem migração" sem esforço —, e é justamente o buraco que esta
# garantia existe para tapar. Com uma checagem só, lista vazia sairia como "não deu para ler"
# e a mensagem mandaria consertar a régua em vez do defeito. São duas perguntas: a linha
# existe, e o que tem nela.
[ "$(grep -c '^const PERMANENTES' src/sync/recusa.ts)" = "1" ] \
  || fail "não achei a linha de PERMANENTES em src/sync/recusa.ts: a forma mudou, e esta garantia ficaria verde sem medir nada"
PERMANENTES=$(sed -n "s/^const PERMANENTES[^(]*(\[\([^]]*\)\]).*/\1/p" src/sync/recusa.ts | tr -d "' " | tr ',' ' ')

case " $PERMANENTES " in
  *" $CODIGO "*) ;;
  *) fail "o servidor recusa a conferência duplicada com SQLSTATE $CODIGO, e o aparelho só trata [$PERMANENTES] como permanente: a fila vai tentar de novo para sempre e travar calada, com tudo o que vier atrás preso" ;;
esac

echo "    o servidor recusa com $CODIGO, e a fila do aparelho sabe pôr esse código de lado"

echo
echo "OK - migrations apply and all thirty-two guarantees hold."


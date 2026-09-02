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
# Which settles the shared-device question in the only place that counts. A
# phone that passes from hand to hand cannot sync everybody's work under one
# account and label each movement with whoever was holding it - the server
# refuses. The person operating has to BE the session, and the device carries
# one per person.
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
as_user "$OWNER" "insert into movements (id, company_id, kind, occurred_at, recorded_by,
  operator_id, item_id, quantity_base_units, location_id) values
  ('${M}d9','${M}c1','production',now(),'$OWNER',
   (select id from memberships where user_id = '$OPERATOR'),
   '${M}b1',500,'${M}a1');" >/dev/null 2>&1 || true  # proofgate-allow
named=$(rows "select count(*) from movements m join memberships mb on mb.id = m.operator_id
  where m.id = '${M}d9' and mb.user_id = '$OPERATOR';")  # proofgate-allow
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
DEVICE_ACCOUNT=00000000-0000-4000-8000-000000000001
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  insert into companies (id, name)
    values ('$DEVICE_ACCOUNT', 'Fábrica local');
  insert into memberships (company_id, user_id, display_name, capabilities)
    values ('$DEVICE_ACCOUNT', '$DEVICE_ACCOUNT', 'Conta da empresa',
            enum_range(null::capability));
  -- INSERT e UPDATE, e o UPDATE não é excesso: a fila sobe com
  -- ON CONFLICT DO UPDATE, porque uma linha corrigida no aparelho offline tem
  -- de alcançar o servidor. A exceção é movements, que sobe com DO NOTHING -
  -- o livro-razão não se corrige, se estorna. Faltando o UPDATE, o Postgres
  -- responde apenas 'permission denied', sem dizer qual dos dois falta.
  grant insert, update on items, locations, products, purchases, purchase_lines,
        recipes, recipe_versions, recipe_lines,
        product_lines, product_types, flavors,
        orders, order_lines to app_user;
  grant insert on movements to app_user;" >/dev/null ||
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

echo "    saldo $srv_balance e média $srv_average, iguais nos dois lados"

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

echo "    tipo de outra linha, tipo órfão, sabor repetido e produto duplicado, todos recusados"

echo "==> check 8: o pedido nasce onde a empresa mandou, e sair do pendente é de quem aprova"

# A aprovação de pedido é configuração da empresa, e a regra não pode morar na
# tela: um cliente que manda o pedido pelo próprio aparelho escolheria nascer
# aprovado, porque "status" é um campo como outro qualquer no JSON.
P=00000000-0000-4eee-8000-0000000000
psql -d "$DB" -q -c "insert into auth.users (id) values ('${P}91'), ('${P}92');" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into companies (id, name, orders_need_approval)
  values ('${P}01','Fábrica que aprova', true);" >/dev/null  # proofgate-allow
psql -d "$DB" -q -c "insert into memberships (company_id, user_id, display_name, capabilities)
  values ('${P}01','${P}91','Vendedora', array['place_order','dispatch']::capability[]),
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

echo
echo "OK - migrations apply and all eight guarantees hold."


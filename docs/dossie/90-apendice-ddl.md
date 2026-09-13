## Apêndice A — Esquema do servidor, DDL consolidado

As 32 migrações do Postgres, na ordem, transcritas por inteiro. A ordem importa: o
esquema é append-only, e cada arquivo pressupõe todos os anteriores. O nome de cada
arquivo é a justificativa da migração — foi convenção do projeto, e vale manter.

### `0001_foundation.sql`

```sql
-- =============================================================================
-- Foundation: tenancy, capabilities, and the movement ledger.
--
-- Three things here are load-bearing and cannot be retrofitted later:
--
--   1. Every row carries company_id from the very first migration. Adding
--      tenancy after real customers are inside is what kills products.
--   2. Permission is enforced by capability in the database, not by hiding a
--      button. Hiding a button is decoration, not security.
--   3. The ledger is append-only at the database level. UPDATE and DELETE are
--      revoked and blocked by trigger, so "correct by reversal" is a property
--      of the system rather than a habit people can drift away from.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tenancy
-- -----------------------------------------------------------------------------

create table companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  -- Locale travels with the company, not the phone: a Brazilian factory whose
  -- owner reads the app in English still bills in BRL.
  language      text not null default 'pt-BR',
  currency      text not null default 'BRL',
  time_zone     text not null default 'America/Sao_Paulo',
  -- Module switches. A small customer must see four buttons, not thirty.
  -- Turning one off never deletes data; it only leaves the screen.
  modules       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

comment on column companies.modules is
  'Feature switches (lots, qr, fiscal, finance, sanitary, balancing, ...). '
  'Disabled means invisible, never greyed out - a locked field reads as a '
  'money grab, which is exactly the review the market leader earns.';

-- Capabilities, not roles. A role is a bundle of these; every company that buys
-- this app has a different org chart, so the bundle is configuration.
create type capability as enum (
  'view_cost',
  'view_sale_price',
  'record_production',
  'dispatch',
  'check_receipt',
  'record_loss',
  'place_order',
  'approve_order',
  'adjust_stock',
  'view_finance',
  'issue_invoice',
  'manage_company'
);

create table memberships (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text not null,
  capabilities  capability[] not null default '{}',
  -- Screens Mode or Conversation Mode. Deliberately not called "simple mode":
  -- nobody should open a setting that implies they are the simple one.
  prefers_conversation boolean not null default false,
  -- 1 informs, 2 prepares (default), 3 routine, 4 autonomous. Regardless of
  -- level, the floor in check_assistant_floor() always demands a human.
  assistant_autonomy   smallint not null default 2
                       check (assistant_autonomy between 1 and 4),
  created_at    timestamptz not null default now(),
  unique (company_id, user_id)
);

create index memberships_user_idx on memberships (user_id);

-- -----------------------------------------------------------------------------
-- Helpers used by every policy below
-- -----------------------------------------------------------------------------

create or replace function current_companies()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from memberships where user_id = auth.uid();
$$;

create or replace function has_capability(target_company uuid, needed capability)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = target_company
      and needed = any (capabilities)
  );
$$;

-- -----------------------------------------------------------------------------
-- Reference data
-- -----------------------------------------------------------------------------

create type location_kind as enum ('factory', 'cold_room', 'store_room', 'own_store', 'customer', 'vehicle');

create table locations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  kind          location_kind not null,
  name          text not null,
  -- Capacity is declared in crates, never in cubic metres. Asking someone for
  -- a volume is hostile; asking how many crates fit is the same question in
  -- the language they already use.
  capacity_crates integer,
  -- A simple aisle/shelf address, so a picking list can come out in walking
  -- order instead of alphabetically. This saves more time in a -20C room than
  -- any other optimisation on the screen.
  address_code  text,
  -- Collected from day one even though routing ships much later: history
  -- cannot be created retroactively.
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  created_at    timestamptz not null default now()
);

create index locations_company_idx on locations (company_id);

create type item_kind as enum ('input', 'packaging', 'product', 'resale', 'store_supply');

create table items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  kind          item_kind not null,
  name          text not null,
  -- Generic packaging hierarchy, smallest first, e.g.
  -- [{"id":"unit","perBaseUnit":1},{"id":"box","perBaseUnit":50},
  --  {"id":"crate","perBaseUnit":300}]
  -- The next customer may stack Unit -> Pack -> Bale instead.
  packaging     jsonb not null default '[{"id":"unit","perBaseUnit":1}]'::jsonb,
  -- Purchase unit differs from usage unit: sugar is bought in 25kg sacks and
  -- used in 350g doses. Without the factor the cost is quietly wrong.
  purchase_unit text,
  purchase_to_base numeric(14,4),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index items_company_idx on items (company_id, kind) where active;

create table lots (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  item_id       uuid not null references items(id) on delete restrict,
  code          text not null,
  produced_on   date,
  expires_on    date,
  created_at    timestamptz not null default now(),
  unique (company_id, code)
);

create index lots_expiry_idx on lots (company_id, expires_on) where expires_on is not null;

-- -----------------------------------------------------------------------------
-- The ledger
-- -----------------------------------------------------------------------------

create type movement_kind as enum (
  'production', 'consumption', 'transfer', 'sale',
  'loss', 'return', 'adjustment', 'discrepancy', 'reversal'
);

create type loss_reason as enum ('melted', 'broken', 'expired', 'courtesy', 'internal_use');

create type control_post as enum ('picked', 'loaded', 'delivered', 'checked');

create table movements (
  -- Generated on the device so replaying an offline queue twice is harmless.
  id            uuid primary key,
  company_id    uuid not null references companies(id) on delete cascade,

  kind          movement_kind not null,
  -- When it happened in the world, not when it reached the server. An entry
  -- made in a freezer with no signal keeps its real time.
  occurred_at   timestamptz not null,
  recorded_at   timestamptz not null default now(),
  recorded_by   uuid not null references auth.users(id),

  item_id       uuid not null references items(id) on delete restrict,
  -- Always the smallest unit. Signed: negative leaves, positive arrives.
  quantity_base_units bigint not null check (quantity_base_units <> 0),

  location_id   uuid not null references locations(id) on delete restrict,
  counterpart_location_id uuid references locations(id) on delete restrict,

  lot_id        uuid references lots(id) on delete restrict,
  post          control_post,
  loss_reason   loss_reason,

  -- Cost frozen at this instant. A sugar price change in March must not rewrite
  -- January's margin.
  unit_cost_cents  bigint,
  unit_price_cents bigint,

  reverses_movement_id uuid references movements(id),

  -- Set when the assistant drafted this movement, storing the phrase the person
  -- actually typed. Makes "what did the assistant post this month?" answerable.
  -- Autonomy without a trail is what breaks trust in the data.
  assistant_phrase text,

  note          text,

  -- A loss with no reason becomes "unexplained shrinkage", and the report loses
  -- credibility with the team. The database refuses to let that happen.
  constraint loss_needs_reason
    check (kind <> 'loss' or loss_reason is not null),
  constraint reversal_points_somewhere
    check (kind <> 'reversal' or reverses_movement_id is not null)
);

create index movements_balance_idx
  on movements (company_id, item_id, location_id, occurred_at);
create index movements_lot_idx
  on movements (company_id, lot_id) where lot_id is not null;
create index movements_assistant_idx
  on movements (company_id, recorded_at) where assistant_phrase is not null;

-- Append-only, enforced by the database.
create or replace function reject_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'The ledger is append-only. Correct a movement by inserting a reversal, '
    'which keeps the original visible and the history honest.';
end;
$$;

create trigger movements_are_immutable
  before update or delete on movements
  for each row execute function reject_ledger_mutation();

-- Balance is derived, never stored. This view is the single source both the
-- screens and the assistant read from - two consumers, one truth. An assistant
-- with its own SQL would eventually report a different number than the screen,
-- and the app would lose its credibility in a single day.
create view stock_balances as
  select
    company_id,
    item_id,
    location_id,
    sum(quantity_base_units) as base_units
  from movements
  group by company_id, item_id, location_id;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------

alter table companies   enable row level security;
alter table memberships enable row level security;
alter table locations   enable row level security;
alter table items       enable row level security;
alter table lots        enable row level security;
alter table movements   enable row level security;

create policy companies_read on companies
  for select using (id in (select current_companies()));

create policy companies_write on companies
  for update using (has_capability(id, 'manage_company'));

create policy memberships_read on memberships
  for select using (company_id in (select current_companies()));

create policy memberships_manage on memberships
  for all using (has_capability(company_id, 'manage_company'))
  with check (has_capability(company_id, 'manage_company'));

create policy locations_read on locations
  for select using (company_id in (select current_companies()));

create policy locations_manage on locations
  for all using (has_capability(company_id, 'manage_company'))
  with check (has_capability(company_id, 'manage_company'));

create policy items_read on items
  for select using (company_id in (select current_companies()));

create policy items_manage on items
  for all using (has_capability(company_id, 'manage_company'))
  with check (has_capability(company_id, 'manage_company'));

create policy lots_read on lots
  for select using (company_id in (select current_companies()));

create policy lots_write on lots
  for insert with check (has_capability(company_id, 'record_production'));

create policy movements_read on movements
  for select using (company_id in (select current_companies()));

-- Each movement kind needs its own capability. The assistant inherits these
-- automatically because it calls the same queries the screens do - the filter
-- lives in the query, never in an instruction asking a model to keep a secret.
create policy movements_append on movements
  for insert with check (
    recorded_by = auth.uid()
    and case kind
      when 'production'  then has_capability(company_id, 'record_production')
      when 'consumption' then has_capability(company_id, 'record_production')
      when 'transfer'    then has_capability(company_id, 'dispatch')
      when 'sale'        then has_capability(company_id, 'dispatch')
      when 'loss'        then has_capability(company_id, 'record_loss')
      when 'return'      then has_capability(company_id, 'check_receipt')
      when 'discrepancy' then has_capability(company_id, 'check_receipt')
      when 'adjustment'  then has_capability(company_id, 'adjust_stock')
      when 'reversal'    then has_capability(company_id, 'adjust_stock')
    end
  );

-- Cost is filtered at the query, so it never reaches an unauthorised context.
create view movements_visible with (security_invoker = true) as
  select
    m.id, m.company_id, m.kind, m.occurred_at, m.recorded_at, m.recorded_by,
    m.item_id, m.quantity_base_units, m.location_id, m.counterpart_location_id,
    m.lot_id, m.post, m.loss_reason, m.reverses_movement_id,
    m.assistant_phrase, m.note,
    case when has_capability(m.company_id, 'view_cost')
         then m.unit_cost_cents end as unit_cost_cents,
    case when has_capability(m.company_id, 'view_sale_price')
         then m.unit_price_cents end as unit_price_cents
  from movements m;
```

### `0002_recipes.sql`

```sql
-- =============================================================================
-- Recipes, costing and purchasing.
--
-- The rule this schema is built around: registering a purchase is the same
-- event that moves the cost. Nobody ever "updates the price of sugar" as a
-- chore - they enter the invoice, every recipe that uses sugar recalculates,
-- and the price history writes itself.
--
-- Note on precision: unit costs are numeric, not bigint. Money paid is integer
-- cents, but a *rate* is not money - strawberry pulp at R$ 12.40/kg is 1.24
-- cents per gram, and forcing that into a whole cent loses a fifth of it before
-- the first multiplication. A millilitre of mix rounds straight to zero.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Suppliers and purchases
-- -----------------------------------------------------------------------------

create table suppliers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,
  tax_id        text,
  -- What they promise. The system trusts the observed value instead, computed
  -- from deliveries: suppliers say three days and deliver in six.
  promised_lead_days smallint,
  created_at    timestamptz not null default now()
);

create index suppliers_company_idx on suppliers (company_id);

create table purchases (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  supplier_id   uuid references suppliers(id) on delete restrict,
  ordered_at    timestamptz,
  received_at   timestamptz,
  invoice_number text,
  freight_cents bigint not null default 0,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

create table purchase_lines (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  purchase_id   uuid not null references purchases(id) on delete cascade,
  item_id       uuid not null references items(id) on delete restrict,
  -- What the buyer typed: 8 sacks. Converted to base units on the way in, so
  -- the ledger only ever sees the smallest unit.
  purchase_quantity numeric(14,4) not null check (purchase_quantity > 0),
  base_units    bigint not null check (base_units > 0),
  total_cents   bigint not null check (total_cents >= 0),
  -- Ordered vs received, so the discrepancy is caught before the invoice is
  -- paid: ordered 10 sacks, 9 arrived, the invoice charges 10.
  expected_base_units bigint
);

create index purchase_lines_item_idx on purchase_lines (company_id, item_id);

comment on column purchase_lines.expected_base_units is
  'What the order asked for. Compared against base_units at receiving; a '
  'mismatch blocks before payment rather than surfacing in a report later.';

-- -----------------------------------------------------------------------------
-- Item costing
-- -----------------------------------------------------------------------------

-- Moving weighted average, recomputed as purchases land. Last price stays
-- visible for negotiation ("R$ 118 here; R$ 112 last month at supplier B"),
-- but the average is what a batch is costed against - a single unlucky invoice
-- should not make margin jump.
create table item_costs (
  company_id    uuid not null references companies(id) on delete cascade,
  item_id       uuid not null references items(id) on delete cascade,
  -- Fractional cents per base unit. See the precision note at the top.
  average_rate  numeric(18,8) not null default 0,
  last_rate     numeric(18,8),
  on_hand_base_units bigint not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (company_id, item_id)
);

-- Every change is kept. The price history the user asked for is not a separate
-- feature anyone has to remember to fill in - it is a by-product of buying.
create table item_cost_history (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  item_id       uuid not null references items(id) on delete cascade,
  purchase_line_id uuid references purchase_lines(id) on delete set null,
  previous_rate numeric(18,8),
  new_rate      numeric(18,8) not null,
  observed_at   timestamptz not null default now()
);

create index item_cost_history_idx on item_cost_history (company_id, item_id, observed_at desc);

-- -----------------------------------------------------------------------------
-- Recipes
-- -----------------------------------------------------------------------------

create table recipes (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,
  -- What one batch yields, in the recipe's own measure (millilitres of mix,
  -- grams of dough). Deliberately separate from the product conversion so the
  -- same batch can become a popsicle, a 2L tub and a small cup.
  yield_amount  numeric(14,4) not null check (yield_amount > 0),
  yield_unit    text not null default 'ml',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index recipes_company_idx on recipes (company_id) where active;

-- Versions are kept, never overwritten. Production records which version it
-- used, so changing the formula does not rewrite last year's cost.
create table recipe_versions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  recipe_id     uuid not null references recipes(id) on delete cascade,
  version       integer not null,
  effective_from date not null default current_date,
  -- Expected loss as a fraction: 0.05 is 5%. Real ice cream operations lose
  -- 3-8% between leftover mix, breakage and freezer burn. Without this the
  -- theoretical cost is always optimistic, and the owner never learns why.
  loss_fraction numeric(5,4) not null default 0 check (loss_fraction >= 0 and loss_fraction < 1),
  note          text,
  created_at    timestamptz not null default now(),
  unique (recipe_id, version)
);

create table recipe_lines (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  recipe_version_id uuid not null references recipe_versions(id) on delete cascade,
  -- Exactly one of the two: a raw item, or another recipe. A cream base used by
  -- eight flavours is a sub-recipe, so a milk price rise moves all eight.
  item_id       uuid references items(id) on delete restrict,
  sub_recipe_id uuid references recipes(id) on delete restrict,
  quantity      numeric(14,4) not null check (quantity > 0),
  constraint one_source check (num_nonnulls(item_id, sub_recipe_id) = 1)
);

create index recipe_lines_version_idx on recipe_lines (recipe_version_id);

-- Cycle prevention lives in the application (see costRecipe / explodeRequirements
-- in src/domain/recipe.ts, which raise RecipeCycleError). Enforcing it here
-- would need a recursive trigger on every insert; the app catches it earlier
-- and can tell the user which recipes form the loop.

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------

create table products (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  item_id       uuid not null references items(id) on delete cascade,
  recipe_id     uuid references recipes(id) on delete restrict,
  -- How much of the batch one finished unit takes: 75 ml per popsicle.
  yield_per_unit numeric(14,4),
  -- Packaging that belongs to the unit rather than the batch: the stick, the
  -- wrapper. Kept apart so it can be stated instead of smeared into the mix.
  unit_packaging_cents bigint not null default 0,
  active        boolean not null default true,
  unique (company_id, item_id),
  -- A manufactured product needs a recipe and a conversion; a resale product
  -- needs neither, and its cost comes from the purchase invoice.
  constraint manufactured_needs_recipe
    check ((recipe_id is null) = (yield_per_unit is null))
);

create index products_company_idx on products (company_id) where active;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------

alter table suppliers         enable row level security;
alter table purchases         enable row level security;
alter table purchase_lines    enable row level security;
alter table item_costs        enable row level security;
alter table item_cost_history enable row level security;
alter table recipes           enable row level security;
alter table recipe_versions   enable row level security;
alter table recipe_lines      enable row level security;
alter table products          enable row level security;

-- Reference data is readable by anyone in the company.
create policy suppliers_read       on suppliers       for select using (company_id in (select current_companies()));
create policy recipes_read         on recipes         for select using (company_id in (select current_companies()));
create policy recipe_versions_read on recipe_versions for select using (company_id in (select current_companies()));
create policy recipe_lines_read    on recipe_lines    for select using (company_id in (select current_companies()));
create policy products_read        on products        for select using (company_id in (select current_companies()));

-- Cost is different: the operator records production without ever seeing what
-- anything costs. The filter lives in the policy, not in a hidden button.
create policy item_costs_read on item_costs
  for select using (has_capability(company_id, 'view_cost'));
create policy item_cost_history_read on item_cost_history
  for select using (has_capability(company_id, 'view_cost'));
create policy purchases_read on purchases
  for select using (has_capability(company_id, 'view_cost'));
create policy purchase_lines_read on purchase_lines
  for select using (has_capability(company_id, 'view_cost'));

create policy suppliers_manage       on suppliers       for all using (has_capability(company_id, 'manage_company')) with check (has_capability(company_id, 'manage_company'));
create policy recipes_manage         on recipes         for all using (has_capability(company_id, 'manage_company')) with check (has_capability(company_id, 'manage_company'));
create policy recipe_versions_manage on recipe_versions for all using (has_capability(company_id, 'manage_company')) with check (has_capability(company_id, 'manage_company'));
create policy recipe_lines_manage    on recipe_lines    for all using (has_capability(company_id, 'manage_company')) with check (has_capability(company_id, 'manage_company'));
create policy products_manage        on products        for all using (has_capability(company_id, 'manage_company')) with check (has_capability(company_id, 'manage_company'));

create policy purchases_write on purchases
  for insert with check (has_capability(company_id, 'view_finance'));
create policy purchase_lines_write on purchase_lines
  for insert with check (has_capability(company_id, 'view_finance'));

-- -----------------------------------------------------------------------------
-- A purchase moves the cost. One event, several consequences.
-- -----------------------------------------------------------------------------

create or replace function apply_purchase_to_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  held_units   bigint;
  held_rate    numeric(18,8);
  new_rate     numeric(18,8);
  line_rate    numeric(18,8);
begin
  line_rate := new.total_cents::numeric / new.base_units;

  select on_hand_base_units, average_rate
    into held_units, held_rate
    from item_costs
   where company_id = new.company_id and item_id = new.item_id;

  if held_units is null then
    held_units := 0;
    held_rate := 0;
  end if;

  -- Moving weighted average: the new lot blends in proportionally to what is
  -- already on hand. Negative stock (a count that is behind reality) is treated
  -- as zero rather than rejected - refusing it would push people to type
  -- something false.
  held_units := greatest(held_units, 0);
  new_rate := ((held_rate * held_units) + new.total_cents) / (held_units + new.base_units);

  insert into item_costs (company_id, item_id, average_rate, last_rate, on_hand_base_units, updated_at)
  values (new.company_id, new.item_id, new_rate, line_rate, held_units + new.base_units, now())
  on conflict (company_id, item_id) do update
    set average_rate = excluded.average_rate,
        last_rate = excluded.last_rate,
        on_hand_base_units = item_costs.on_hand_base_units + new.base_units,
        updated_at = now();

  -- The price history the user asked for, written as a by-product of buying.
  insert into item_cost_history (company_id, item_id, purchase_line_id, previous_rate, new_rate)
  values (new.company_id, new.item_id, new.id, nullif(held_rate, 0), new_rate);

  return new;
end;
$$;

create trigger purchase_moves_cost
  after insert on purchase_lines
  for each row execute function apply_purchase_to_cost();
```

### `0003_base_unit.sql`

```sql
-- =============================================================================
-- 0003 - the unit an item is actually used in
-- =============================================================================
--
-- 0001 recorded how an item is *bought* (a 25 kg sack) and how many base units
-- that holds (25,000). What it never recorded was what that base unit is
-- called. The app needed it the moment a screen tried to say a sentence:
--
--   "R$ 118 ÷ 25.000 = R$ 4,72 a cada 1.000 g"
--
-- Without the word, every hint has to guess "g" - which is wrong for syrup in
-- millilitres and absurd for sticks counted one by one. The device schema
-- already carries it, so the server has to as well or the sync loses it.
--
-- Existing rows default to 'un', the only honest answer for data recorded
-- before the question was asked: one of whatever it was.

alter table items
  add column if not exists base_unit text not null default 'un';

comment on column items.base_unit is
  'The smallest unit a recipe works in: g, ml, un. Purchase units convert into it.';
```

### `0004_harden.sql`

```sql
-- =============================================================================
-- 0004 - closing three holes the database linter found on first deploy
-- =============================================================================
--
-- Worth recording why these existed, because two of them are the kind of
-- mistake that looks like nothing and is everything:
--
--   1. `stock_balances` was created without `security_invoker`. A view defaults
--      to running with its creator's rights, which means it reads straight past
--      row level security: any signed-in user could have read the balances of
--      every company on the server. The whole point of stamping company_id on
--      the first migration was to make that impossible, and one missing option
--      on one view undid it. `movements_visible` had the option; this one did
--      not, which is exactly how these slip through.
--
--   2. A trigger function with a mutable search_path can be pointed at objects
--      the author did not mean, by anyone able to set a schema ahead of public.
--
--   3. The trigger behind the moving average was reachable as a REST endpoint.
--      It is a trigger, so nothing should ever call it directly.
--
-- What is deliberately left as it is: `current_companies()` and
-- `has_capability()` stay callable by signed-in users, because every policy in
-- 0001 and 0002 calls them and Postgres checks that permission as the querying
-- user. Neither takes an identity as input - both answer only about
-- `auth.uid()` - so a caller learns nothing about anyone but themselves.

alter view stock_balances set (security_invoker = true);

-- Recreated only to pin the search path; the body is unchanged.
create or replace function reject_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'The ledger is append-only. Correct a movement by inserting a reversal, '
    'which keeps the original visible and the history honest.';
end;
$$;

-- The API roles exist on Supabase and not in a bare Postgres, so the local
-- verification run skips this block instead of failing on an unknown role.
do $$
begin
  revoke execute on function apply_purchase_to_cost() from public;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function apply_purchase_to_cost() from anon;
    revoke execute on function current_companies() from anon;
    revoke execute on function has_capability(uuid, capability) from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function apply_purchase_to_cost() from authenticated;
    grant execute on function current_companies() to authenticated;
    grant execute on function has_capability(uuid, capability) to authenticated;
  end if;
end
$$;
```

### `0005_revoke_public_execute.sql`

```sql
-- =============================================================================
-- 0005 - the revoke 0004 missed
-- =============================================================================
--
-- 0004 revoked EXECUTE on the policy helpers from `anon` and the linter still
-- reported them as callable without signing in. The reason is a Postgres
-- default that is easy to forget: a new function grants EXECUTE to PUBLIC, and
-- every role inherits that. Revoking from one role changes nothing while the
-- grant to PUBLIC is still standing.
--
-- So: take it away from PUBLIC, then hand it back to `authenticated` alone.
-- The policies in 0001 and 0002 call these functions, and Postgres checks that
-- permission as the querying user, so signed-in users must keep it.
--
-- This is a separate migration rather than an edit to 0004 because 0004 has
-- already run. Migrations are append-only for the same reason the ledger is: a
-- file that says something different from what the database actually did is
-- worse than no file at all.

revoke execute on function current_companies() from public;
revoke execute on function has_capability(uuid, capability) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function current_companies() to authenticated;
    grant execute on function has_capability(uuid, capability) to authenticated;
  end if;
end
$$;
```

### `0006_private_helpers.sql`

```sql
-- =============================================================================
-- 0006 - take the policy helpers off the public API
-- =============================================================================
--
-- 0004 left `current_companies()` and `has_capability()` callable by signed-in
-- users on purpose, and said so: every policy calls them, Postgres checks that
-- permission as the querying user, and neither function takes an identity as
-- input. The reasoning holds. What it misses is that being *callable* is not
-- the same as being *published*: sitting in `public`, both are reachable as
-- REST endpoints at /rest/v1/rpc/, which turns an internal detail of the
-- policies into part of the product's public surface.
--
-- `has_capability(company, capability)` is the one that matters. It answers
-- only about the caller, so it leaks nobody else's permissions - but exposed as
-- an endpoint it is a probe anyone signed in can run against any company id
-- they can name, and it is the kind of surface that becomes a real problem the
-- day somebody adds a helper that does take an identity.
--
-- Moving them to a schema PostgREST does not serve removes the endpoint and
-- keeps the policies working. The policies survive because Postgres stores the
-- function's identity, not its name, so they follow the move on their own -
-- which is also why this is an ALTER and not a rewrite of forty policies.
--
-- `search_path = public` was already pinned on both in 0001, so the bodies
-- still find `memberships` from their new home.

create schema if not exists private;

comment on schema private is
  'Helpers the RLS policies call. Deliberately outside the API schema: these '
  'are how the walls are built, not something a client should be able to ask.';

alter function public.current_companies() set schema private;
alter function public.has_capability(uuid, capability) set schema private;

-- Grants follow the function, so EXECUTE is already right. What the move needs
-- is permission to reach the new schema at all - signed-in users only, since a
-- policy is evaluated as whoever is running the query.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema private to authenticated;
  end if;
end
$$;
```

### `0007_movement_kind_purchase.sql`

```sql
-- The ledger had no word for the one movement phase 1 actually makes.
--
-- `movement_kind` was written from the factory outwards: production, transfer,
-- sale, loss. Every one of them is stock the company already owns, moving.
-- Nothing in the list describes stock arriving from a supplier against an
-- invoice - which is the first movement any real installation will record,
-- because a factory buys sugar before it makes anything.
--
-- The gap was invisible while the ledger lived only on the server. It surfaced
-- the moment the device grew one and had to name what a purchase does to a
-- balance.
--
-- This is its own migration on purpose. Postgres will add a value to an enum
-- inside a transaction, but refuses to let the same transaction *use* it, and
-- the policy in the next step has to name it.
alter type movement_kind add value if not exists 'purchase';
```

### `0008_ledger_speaks_phase_one.sql`

```sql
-- Three more things the server would have refused from the phone.
--
-- All three were found the same way: by building the device's ledger against
-- this schema and asking, statement by statement, what Postgres would do with
-- what the phone is about to send. None of them could be seen by reading
-- either side alone.

-- 1. A new kind is locked out by default, and that default is correct.
--
-- The insert policy is a CASE over the kind with no ELSE, so an unlisted kind
-- evaluates to NULL and the write is refused. That is the right way round - a
-- movement nobody thought about must not be writable - but it means adding
-- 'purchase' to the enum without this step would give the app a word the
-- database silently ignores.
--
-- The helpers are schema-qualified because 0006 moved them into `private`,
-- out of PostgREST's reach. Policies already written kept working - a policy
-- stores the function it resolved to, not its name - but anything written
-- from here on has to say where the function lives.
--
-- Receiving a purchase is checking a receipt, so it answers to the capability
-- that already governs receiving: the buyer and the person at the door can
-- record what arrived, and neither of them needs to see a cost to do it.
drop policy movements_append on movements;

create policy movements_append on movements
  for insert with check (
    recorded_by = auth.uid()
    and case kind
      when 'purchase'    then private.has_capability(company_id, 'check_receipt')
      when 'production'  then private.has_capability(company_id, 'record_production')
      when 'consumption' then private.has_capability(company_id, 'record_production')
      when 'transfer'    then private.has_capability(company_id, 'dispatch')
      when 'sale'        then private.has_capability(company_id, 'dispatch')
      when 'loss'        then private.has_capability(company_id, 'record_loss')
      when 'return'      then private.has_capability(company_id, 'check_receipt')
      when 'discrepancy' then private.has_capability(company_id, 'check_receipt')
      when 'adjustment'  then private.has_capability(company_id, 'adjust_stock')
      when 'reversal'    then private.has_capability(company_id, 'adjust_stock')
    end
  );

-- 2. A count that finds nothing wrong was refused.
--
-- `quantity_base_units <> 0` reads as obviously right: a movement that moves
-- nothing is noise. It is right for every kind but one. A physical count is
-- recorded as the difference between the shelf and the ledger, and the most
-- valuable count result is a difference of zero - somebody walked to the
-- storeroom and the books were correct. Refusing to store that leaves a shelf
-- nobody has checked in months indistinguishable from one verified this
-- morning, which is precisely the confusion counting exists to end.
alter table movements drop constraint movements_quantity_base_units_check;

alter table movements add constraint movement_moved_something
  check (quantity_base_units <> 0 or kind = 'adjustment');

-- 3. The frozen cost of a gram of sugar was rounding to zero.
--
-- This project separates two kinds of number and enforces it in the type
-- system: `Cents` is money that was paid and is a whole number; `Rate` is a
-- price per unit and is fractional. Only the final amount rounds, once. The
-- ledger's own columns broke that rule - `unit_cost_cents bigint` is a rate
-- stored as money, and a sack of sugar at R$ 118 for 25 kg is 0.472 cents per
-- gram, which as a bigint is 0. Every cheap input would have frozen its cost
-- as nothing, and margin reports built on it would have looked plausible.
--
-- The table is empty in every environment, so the columns are replaced rather
-- than shadowed. A wrong column left beside a right one is the trap that put
-- a mutable stock total on the device in the first place.
-- The view reads both columns, so it stands down first and is rebuilt at the
-- end around the new names - keeping what it is for: cost is filtered in the
-- query, so a figure someone may not see never reaches a context that could
-- leak it.
drop view movements_visible;

alter table movements drop column unit_cost_cents;
alter table movements drop column unit_price_cents;

alter table movements add column unit_cost_rate  double precision;
alter table movements add column unit_price_rate double precision;

create view movements_visible with (security_invoker = true) as
  select
    m.id, m.company_id, m.kind, m.occurred_at, m.recorded_at, m.recorded_by,
    m.item_id, m.quantity_base_units, m.location_id, m.counterpart_location_id,
    m.lot_id, m.post, m.loss_reason, m.reverses_movement_id,
    m.assistant_phrase, m.note,
    case when private.has_capability(m.company_id, 'view_cost')
         then m.unit_cost_rate end as unit_cost_rate,
    case when private.has_capability(m.company_id, 'view_sale_price')
         then m.unit_price_rate end as unit_price_rate
  from movements m;
```

### `0009_average_asks_the_ledger.sql`

```sql
-- The server kept the same forbidden column the device did.
--
-- `item_costs.on_hand_base_units` was removed from the phone in the same round
-- that gave it a ledger, and this side was missed entirely. A guard added
-- straight afterwards found it on its first run, which is the whole argument
-- for guards: the fix is worth less than the thing that stops the fix being
-- undone, and this one caught a violation nobody was looking for any more.
--
-- Here it was worse than a duplicate. The trigger maintained the total from
-- purchase lines alone, so it counted arrivals and nothing else. The moment a
-- count, a loss or a production run existed, the column and the ledger would
-- answer "how much is there" with two different numbers, and the average cost
-- would be computed against the wrong one.
--
-- The fix is the same shape the device uses: ask the movements. What makes it
-- safe is a decision already taken there - a purchase line and the movement it
-- causes share one id, because they are one fact seen twice. So the trigger can
-- exclude this line's own movement by id and get "what was held before this
-- arrival" whether the movement reached the server before the line, after it,
-- or not yet at all. No ordering to depend on, and a replay cannot double it.

create or replace function apply_purchase_to_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  held_units   bigint;
  held_rate    numeric(18,8);
  new_rate     numeric(18,8);
  line_rate    numeric(18,8);
begin
  line_rate := new.total_cents::numeric / new.base_units;

  -- What was on hand before this arrival, from the only place that knows.
  select coalesce(sum(quantity_base_units), 0)
    into held_units
    from movements
   where company_id = new.company_id
     and item_id = new.item_id
     and id <> new.id;

  select average_rate
    into held_rate
    from item_costs
   where company_id = new.company_id and item_id = new.item_id;

  if held_rate is null then
    held_rate := 0;
  end if;

  -- Moving weighted average: the new lot blends in proportionally to what is
  -- already on hand. Negative stock (a count that is behind reality) is treated
  -- as zero rather than rejected - refusing it would push people to type
  -- something false.
  held_units := greatest(held_units, 0);
  new_rate := ((held_rate * held_units) + new.total_cents) / (held_units + new.base_units);

  insert into item_costs (company_id, item_id, average_rate, last_rate, updated_at)
  values (new.company_id, new.item_id, new_rate, line_rate, now())
  on conflict (company_id, item_id) do update
    set average_rate = excluded.average_rate,
        last_rate = excluded.last_rate,
        updated_at = now();

  -- The price history the user asked for, written as a by-product of buying.
  insert into item_cost_history (company_id, item_id, purchase_line_id, previous_rate, new_rate)
  values (new.company_id, new.item_id, new.id, nullif(held_rate, 0), new_rate);

  return new;
end;
$$;

alter table item_costs drop column on_hand_base_units;
```

### `0010_what_the_device_actually_sends.sql`

```sql
-- Two columns the device has been writing with nowhere to put them.
--
-- Found by taking the device's outbox and asking, row by row, what Postgres
-- would do with it. Neither is exotic; both were invisible because nothing had
-- ever tried to replay a queue against this schema.

-- 1. The order somebody wrote the ingredients in.
--
-- `recipe_lines.position` exists on the device and does not exist here, so a
-- recipe that synced would come back on another phone with its ingredients in
-- whatever order Postgres felt like. That is not a cosmetic loss: a technical
-- sheet is read top to bottom while somebody is working, and the person who
-- wrote it put the base first and the colouring last on purpose.
alter table recipe_lines add column position integer not null default 0;

create index recipe_lines_order_idx on recipe_lines (recipe_version_id, position);

-- 2. The supplier as a name, because that is what people type.
--
-- `supplier_id` points at the `suppliers` table, which is the right shape once
-- suppliers are a thing somebody manages. Today the buyer types "Fornecedor
-- Silva" into a field, and that text had nowhere to land - the invoice would
-- arrive on the server having forgotten who sold it.
--
-- Both columns stay: the name is what was typed, the id is what it resolves to
-- when suppliers become real. Neither is required, and a purchase carrying only
-- a name is a complete record of what actually happened.
alter table purchases add column supplier_name text;
```

### `0011_joining_a_company.sql`

```sql
-- Entrar numa empresa passa a ter dois caminhos, e um deles precisa de espera.
--
-- Decisão do dono: ele cria a empresa, e a partir daí ou cadastra as pessoas
-- diretamente, ou aprova quem pediu associação por um código da empresa.
--
-- O segundo caminho não existia no esquema, e a ausência era um buraco de
-- segurança: `memberships` não tem estado, então qualquer linha ali já vale
-- como membro. Quem descobrisse o código entraria com permissão antes de
-- alguém dizer sim.

create type membership_state as enum ('pending', 'active', 'revoked');

alter table memberships
  add column state membership_state not null default 'active';

-- Existir na tabela deixa de ser suficiente.
--
-- As duas funções abaixo são a permissão inteira deste sistema: uma diz de que
-- empresas você é, a outra diz o que você pode nela. Elas eram consultas sobre
-- *existir uma linha*. Agora são sobre existir uma linha **ativa** - e é aqui,
-- e só aqui, que "pendente" vira inofensivo. Filtrar na tela seria decoração.
create or replace function private.current_companies()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from memberships
   where user_id = auth.uid() and state = 'active';
$$;

create or replace function private.has_capability(target_company uuid, needed capability)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = target_company
      and state = 'active'
      and needed = any (capabilities)
  );
$$;

-- O código que alguém digita para pedir entrada.
--
-- Curto o bastante para ser dito em voz alta no chão de fábrica e trocável a
-- qualquer momento: quem sai da empresa não leva a porta junto. Ele não dá
-- acesso a nada sozinho - só cria um pedido, que continua `pending` até o dono
-- aprovar.
alter table companies add column join_code text unique;

-- Como se entra no aparelho do chão de fábrica.
--
-- "Depende de quem usa" vira dado, não código: uma fábrica dá um celular por
-- pessoa, outra tem um aparelho pendurado na câmara fria que passa de mão em
-- mão. Os dois caminhos existem no produto e a empresa escolhe.
--
-- O padrão é `personal` porque é o que não exige preparo nenhum: o dono instala,
-- entra, e está funcionando. Quem compartilha aparelho liga a outra opção.
create type floor_sign_in as enum ('personal', 'shared');

alter table companies
  add column floor_sign_in floor_sign_in not null default 'personal';
```

### `0012_who_or_where.sql`

```sql
-- O relatório operacional nomeia a pessoa, ou o lugar?
--
-- A pergunta parecia ser sobre o que gravar, e não era: `movements.recorded_by`
-- já é `not null` desde a primeira migração. O livro-razão sempre soube quem
-- fez. Auditoria precisa disso e continua tendo.
--
-- O que estava em aberto é outra coisa: se a **interface** atribui um movimento
-- de chão de fábrica a um nome. E isso é preferência de empresa - uma fábrica
-- de três pessoas não quer nome nenhum, uma de quarenta com problema de furo
-- quer - então vira dado, não código, e não vira pergunta ao dono.
--
-- O padrão é `false`, e o motivo está no tom de voz deste produto: ele orienta e
-- não fiscaliza, e nunca culpa pessoa. A cadeia de custódia existe para
-- LOCALIZAR a perda - a diferença entre dois postos diz se foi separação, rota
-- ou recebimento - e "faltaram 3 caixas na conferência" resolve isso sem que
-- ninguém precise ser nomeado. Equipe que vê o app como inimigo sabota o dado,
-- e aí não há relatório nenhum.
--
-- Quem quiser nomear liga. O dado está lá desde sempre.
alter table companies
  add column names_who_recorded boolean not null default false;

comment on column companies.names_who_recorded is
  'Se os relatórios operacionais mostram quem registrou. O ledger sempre grava; '
  'isto decide se a tela conta. Padrão falso: localizar a perda, não acusar.';
```

### `0013_the_device_is_accountable.sql`

```sql
-- O aparelho vira coisa cadastrada, com um responsável.
--
-- Decisão do dono, e ela resolve uma tensão que parecia insolúvel. O tom de voz
-- manda nunca culpar pessoa, e a cadeia de custódia existe para LOCALIZAR a
-- perda - então o relatório fala de onde, não de quem. Mas "onde" sozinho não
-- responde por nada: uma câmara fria não assina.
--
-- A resposta dele: **o aparelho tem responsável cadastrado.** O movimento
-- aponta para o aparelho, o aparelho aponta para uma pessoa, e a
-- responsabilidade existe sem que o relatório precise nomear ninguém a cada
-- caixa. Quem quiser nomear liga `companies.names_who_recorded`.
--
-- E resolve o caso que ele levantou junto: aparelho emprestado. Se o celular é
-- da empresa e passa de mão, quem está com ele entra numa conta de produção -
-- o papel `operator`, que não vê custo, nem preço, nem dinheiro. O aparelho
-- continua respondendo; o emprestado não ganha acesso que não é dele.

create table devices (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,

  -- Como as pessoas o chamam: "o celular da câmara", "o tablet da expedição".
  name           text not null,

  -- Quem responde por ele. `set null` e não `restrict`: quando a pessoa sai da
  -- empresa o aparelho continua existindo, agora sem dono - o que é exatamente
  -- a pergunta que o dono precisa ver na tela.
  responsible_id uuid references memberships(id) on delete set null,

  -- Onde ele costuma ficar, para pré-preencher o movimento em vez de perguntar.
  location_id    uuid references locations(id) on delete restrict,

  -- Aparelho não se apaga: some da lista e o histórico continua apontando para
  -- ele. Um movimento cuja origem sumiu é um movimento que não se pode
  -- explicar.
  active         boolean not null default true,
  created_at     timestamptz not null default now(),

  unique (company_id, name)
);

create index devices_company_idx on devices (company_id) where active;

alter table devices enable row level security;

create policy devices_read on devices
  for select using (company_id in (select private.current_companies()));

create policy devices_manage on devices
  for all using (private.has_capability(company_id, 'manage_company'))
  with check (private.has_capability(company_id, 'manage_company'));

-- De qual aparelho o movimento veio.
--
-- `restrict` de propósito, e não `set null`: o livro-razão recusa UPDATE por
-- gatilho, então uma exclusão em cascata que zerasse esta coluna seria recusada
-- de qualquer jeito - e apagar a origem de um movimento é perder a única coisa
-- que torna "onde" responsável por alguma coisa.
--
-- Nulo nas linhas antigas, e isso é honesto: elas foram gravadas antes de
-- existir aparelho cadastrado, e inventar um agora seria escrever história que
-- não aconteceu.
alter table movements
  add column device_id uuid references devices(id) on delete restrict;

create index movements_device_idx on movements (company_id, device_id)
  where device_id is not null;
```

### `0014_who_was_holding_it.sql`

```sql
-- Quem estava operando naquele momento, anotado no registro.
--
-- Decisão do dono, e ela desfaz um nó que eu tinha dado sozinho. O login
-- autentica **o sistema**: a conta é da empresa, e a empresa distribui acesso
-- criando outros e-mails ou mandando código de convite por perfil. Não é o
-- e-mail pessoal do operador que entra no app.
--
-- Então "quem gravou" e "quem estava operando" são duas perguntas diferentes, e
-- eu estava tentando fazer uma coluna responder as duas:
--
--   `recorded_by`  - qual CONTA escreveu. O servidor impõe
--                    `recorded_by = auth.uid()` desde a fundação: ninguém
--                    assina no nome de ninguém, nem o dono. Fica como está.
--   `operator_id`  - quem estava com o aparelho na hora. Anotado no momento do
--                    registro, escolhido na lista de gente da empresa.
--
-- Com as duas separadas, o celular compartilhado deixa de ser um problema de
-- autenticação e vira o que sempre foi: uma pergunta a mais na tela de
-- registro, para a empresa que quiser fazê-la.
alter table movements
  add column operator_id uuid references memberships(id) on delete restrict;

-- Nulo é o padrão e é honesto: a empresa que não quer nomear ninguém não
-- nomeia, e a linha continua respondendo pelo aparelho e pela conta. Quem quer
-- nomear liga `companies.names_who_recorded`, que já existe desde a 0012.
create index movements_operator_idx on movements (company_id, operator_id)
  where operator_id is not null;

comment on column movements.operator_id is
  'Quem estava operando quando a linha foi escrita. Diferente de recorded_by, '
  'que é a conta que escreveu e não pode ser cedida a ninguém.';
```

### `0015_the_phone_will_send_it_twice.sql`

```sql
-- O aparelho reenvia a fila, e o servidor precisa aguentar isso.
--
-- Defeito encontrado no dia em que a checagem 6 parou de rodar como
-- superusuário. Enquanto ela rodava assim, RLS ficava desligada e as 45
-- escritas passavam sem que uma política fosse avaliada; sob a política, a
-- SEGUNDA passagem da mesma fila é recusada:
--
--   new row violates row-level security policy (USING expression)
--   for table "purchases"
--
-- Porque `purchases` e `purchase_lines` têm política de leitura e de INSERT, e
-- nenhuma de UPDATE - e a fila sobe com ON CONFLICT DO UPDATE. Todas as outras
-- tabelas que ela escreve têm um `_manage FOR ALL`, que cobre update; estas
-- duas ficaram de fora quando foram escritas.
--
-- E reenviar não é caso raro: é o caso normal. Sinal que cai no meio da subida,
-- aplicativo fechado antes do fim, bateria acabando na câmara fria. O aparelho
-- reenvia até ter certeza, e sem isto ele reenviaria para sempre - a fila
-- travada atrás da primeira nota, sem nada na tela explicando o quê.
--
-- Por que UPDATE e não DO NOTHING nessas duas: uma nota corrigida no aparelho
-- precisa alcançar o servidor. Com DO NOTHING a correção seria descartada em
-- silêncio, e silêncio é a única coisa pior que a recusa.
--
-- E por que isto NÃO afrouxa o livro-razão: `movements` sobe com DO NOTHING e
-- continua sem política de UPDATE. Um movimento que chega duas vezes não faz
-- nada na segunda; um movimento errado se estorna, nunca se edita. A nota é
-- documento, o movimento é fato - e só o fato é imutável.
create policy purchases_update on purchases
  for update using (private.has_capability(company_id, 'view_finance'))
  with check (private.has_capability(company_id, 'view_finance'));

create policy purchase_lines_update on purchase_lines
  for update using (private.has_capability(company_id, 'view_finance'))
  with check (private.has_capability(company_id, 'view_finance'));
```

### `0016_the_act_and_its_lines.sql`

```sql
-- O que amarra as linhas de um mesmo ato.
--
-- Uma corrida de produção não é um movimento: é sete. Uma que faz 500 picolés
-- consumindo seis insumos escreve um `production` positivo e seis `consumption`
-- negativos — porque `movements` tem UM `item_id` e uma quantidade assinada, e
-- `stock_balances` é `sum(...) group by company_id, item_id, location_id`. Sete
-- itens numa linha só exigiriam um leitor que abre um payload, e o saldo
-- deixaria de ser uma soma.
--
-- Uma transferência é duas: saída negativa na origem, entrada positiva no
-- destino. Com uma linha só o destino não existe em consulta nenhuma —
-- fechar o saldo exigiria um UNION trocando `location_id` por
-- `counterpart_location_id` e invertendo o sinal, que é o caso especial que
-- esta fundação existe para não ter.
--
-- Sem um elo, "explique este número" seis meses depois vira arqueologia por
-- horário, e o estorno de uma corrida inteira não tem como se dizer atômico.
-- Com ele, `where movement_group_id = ?` devolve o ato completo.
--
-- Uma coluna genérica, e não uma por tipo de evento: o truque que este projeto
-- já usa — a linha de nota e o movimento dela compartilhando o mesmo id, porque
-- são um fato visto duas vezes — é 1:1 e não estica para sete linhas.
--
-- Nula nas linhas antigas, e isso é honesto: compra e contagem são atos de uma
-- linha só, e não havia grupo a que pertencer. Aditiva, sem backfill — que
-- seria impossível de qualquer jeito, porque o gatilho recusa UPDATE.
alter table movements
  add column movement_group_id uuid;

create index movements_group_idx on movements (company_id, movement_group_id)
  where movement_group_id is not null;

comment on column movements.movement_group_id is
  'As linhas de um mesmo ato: as sete de uma corrida de produção, as duas de '
  'uma transferência. Nulo quando o ato tem uma linha só.';
```

### `0017_a_check_that_matched_is_a_fact.sql`

```sql
-- A conferência que bateu também é um fato, e o esquema a recusava.
--
-- `movement_moved_something` (0008) exige que toda linha mova alguma coisa,
-- com uma exceção só: `adjustment`, que é contagem de prateleira e pode dar
-- zero de diferença. A regra está certa - linha que não move nada é ruído num
-- livro-razão, e foi escrita para impedir exatamente isso.
--
-- Mas ela deixa de fora o caso que a tela de transporte precisa: a loja
-- conferiu o que chegou e bateu. Essa linha não move mercadoria nenhuma, e é
-- justamente por não mover que ela vale - é a prova de que alguém abriu a caixa
-- e contou. Sem poder gravá-la, o app só saberia registrar conferência quando
-- deu diferença, e "a Loja Norte ainda não conferiu" ficaria impossível de
-- distinguir de "a Loja Norte conferiu e estava tudo certo".
--
-- Então `discrepancy` entra na mesma exceção, e por um motivo mais estreito que
-- o de `adjustment`: só quando a linha diz em que posto de controle ela
-- aconteceu. Diferença de zero sem posto continua sendo ruído e continua
-- recusada.
alter table movements drop constraint movement_moved_something;

alter table movements add constraint movement_moved_something
  check (
    quantity_base_units <> 0
    or kind = 'adjustment'
    or (kind = 'discrepancy' and post is not null)
  );
```

### `0018_a_product_has_a_family.sql`

```sql
-- -----------------------------------------------------------------------------
-- 0018 - Um produto tem família, tipo e sabor
--
-- Até aqui um produto era um nome plano: "Picolé tradicional de morango" era uma
-- string, e o sistema não sabia que ela tinha três partes. Isso custava três
-- coisas ao mesmo tempo: cadastrar sessenta produtos era digitar sessenta nomes
-- inteiros, nenhum relatório podia somar por sabor ou por linha, e a tela de
-- produção não tinha o que perguntar antes do tacho - por isso ela pedia tacho
-- primeiro, que é a conta do meio e não a coisa que a pessoa acabou de fazer.
--
-- Três níveis cobrem os dois casos que a fábrica tem hoje, e é o mesmo desenho
-- nos dois:
--
--   Picolé          -> Tradicional / Skimó / Top     -> Morango / Chocolate
--   Pote de sorvete -> 240 ml / 500 ml / 1 litro     -> Morango / Chocolate
--
-- O tamanho do pote é o tipo dele. Não é coincidência: o segundo nível é o que
-- divide a linha antes do sabor, e para o pote isso é o volume. Inventar um
-- quarto nível "tamanho" que só o pote usa deixaria o picolé com uma coluna
-- sempre vazia e a tela com uma pergunta que não se aplica.
--
-- Os três níveis são OPCIONAIS, e isso é a fundação do "depende vira dado": uma
-- fábrica que faz um doce só não deve ser obrigada a inventar uma linha e um
-- tipo para cadastrá-lo. Quem tem um nível só preenche um nível só.
--
-- O sabor é da empresa, não do tipo. Morango é o mesmo morango no picolé e no
-- pote; amarrá-lo ao tipo faria o dono cadastrar "morango" uma vez por tipo, e
-- na primeira mudança de nome ele teria seis morangos diferentes no relatório.
-- -----------------------------------------------------------------------------

create table product_lines (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  sort       integer not null default 0,
  active     boolean not null default true,
  -- Alvo das chaves compostas: o tipo e o produto só apontam para uma linha da
  -- própria empresa. Sem isto a chave só diz que a linha existe, não que ela é
  -- desta fábrica - e o dono que administra duas fábricas lê as duas.
  unique (id, company_id)
);

-- Caixa e espaço não são identidade. "Morango", "morango" e "Morango " são a
-- mesma coisa para quem digita, e a unique de texto cru deixaria as três
-- entrarem - que é exatamente o "seis morangos no relatório" que este desenho
-- existe para impedir.
create unique index product_lines_name_idx
  on product_lines (company_id, lower(btrim(name)));

create table product_types (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  line_id    uuid not null references product_lines(id) on delete cascade,
  name       text not null,
  sort       integer not null default 0,
  active     boolean not null default true,
  -- Alvo da chave composta lá embaixo: é o que faz o banco recusar um produto
  -- cuja linha não é a linha do tipo dele. Sem isto a checagem viveria na tela,
  -- e a tela é decoração - o dado errado entraria por qualquer outro caminho.
  unique (id, line_id),
  constraint product_type_line_same_company
    foreign key (line_id, company_id) references product_lines (id, company_id)
    on delete cascade
);

create unique index product_types_name_idx
  on product_types (company_id, line_id, lower(btrim(name)));

create table flavors (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  sort       integer not null default 0,
  active     boolean not null default true,
  unique (id, company_id)
);

create unique index flavors_name_idx
  on flavors (company_id, lower(btrim(name)));

alter table products
  add column line_id   uuid,
  add column type_id   uuid,
  add column flavor_id uuid;

alter table products
  add constraint product_line_same_company
    foreign key (line_id, company_id) references product_lines (id, company_id)
    on delete restrict,
  add constraint product_flavor_same_company
    foreign key (flavor_id, company_id) references flavors (id, company_id)
    on delete restrict;

-- Tipo sem linha não existe, e tipo de outra linha muito menos: "Picolé 500 ml"
-- é um erro de cadastro que o banco tem que recusar, não a tela.
--
-- `match full` e não o padrão, e a diferença é o desenho inteiro: MATCH SIMPLE
-- desliga a checagem quando QUALQUER coluna do par é nula, e nulo é o estado
-- normal aqui - os três níveis são opcionais. Com o padrão, um produto com
-- linha nula aceitaria qualquer type_id, inclusive um que não existe em lugar
-- nenhum. `match full` exige que o par esteja inteiro ou inteiramente nulo, que
-- é exatamente a regra: ou você não classificou, ou classificou os dois.
alter table products
  add constraint product_type_belongs_to_its_line
    foreign key (type_id, line_id) references product_types (id, line_id)
    match full
    on delete restrict;

-- E o mesmo produto não se cadastra duas vezes.
--
-- `nulls not distinct` é o que faz isto valer para a fábrica de um doce só: no
-- padrão do Postgres dois nulos não colidem, então (nulo, nulo, nulo) entraria
-- infinitas vezes - justamente a fábrica que não preencheu nível nenhum ficaria
-- sem a proteção. Aqui nulo é um valor como outro qualquer.
create unique index products_grid_idx
  on products (company_id, line_id, type_id, flavor_id)
  nulls not distinct
  where active;

create index product_lines_company_idx on product_lines (company_id) where active;
create index product_types_line_idx    on product_types (company_id, line_id) where active;
create index flavors_company_idx       on flavors (company_id) where active;
create index products_flavor_idx       on products (company_id, flavor_id) where active;

alter table product_lines enable row level security;
alter table product_types enable row level security;
alter table flavors       enable row level security;

-- Ler é de quem está na empresa; mexer é de quem administra. Mesma divisão dos
-- produtos, porque isto é cadastro de produto: o operador precisa enxergar a
-- grade para escolher o que produziu, e não precisa poder criar sabor nenhum.
create policy product_lines_read on product_lines for select using (company_id in (select private.current_companies()));
create policy product_types_read on product_types for select using (company_id in (select private.current_companies()));
create policy flavors_read       on flavors       for select using (company_id in (select private.current_companies()));

create policy product_lines_manage on product_lines for all using (private.has_capability(company_id, 'manage_company')) with check (private.has_capability(company_id, 'manage_company'));
create policy product_types_manage on product_types for all using (private.has_capability(company_id, 'manage_company')) with check (private.has_capability(company_id, 'manage_company'));
create policy flavors_manage       on flavors       for all using (private.has_capability(company_id, 'manage_company')) with check (private.has_capability(company_id, 'manage_company'));
```

### `0019_an_order_is_demand.sql`

```sql
-- -----------------------------------------------------------------------------
-- 0019 - Um pedido é demanda, e demanda não é livro-razão
--
-- O dono pediu um cartão na capa com "pedidos novos dos consumidores", e a
-- primeira decisão de desenho é a que não aparece na tela: pedido NÃO é
-- movimento.
--
-- A tentação existe e é forte, porque `movements` já tem item, quantidade,
-- lugar e data - caberia. Mas o saldo é a soma dos movimentos, e um pedido não
-- move nada: as caixas continuam na câmara fria, e alguém que confere a
-- prateleira encontra tudo o que o sistema diz que tem. Gravar demanda como
-- movimento faria o saldo mentir no dia em que o cliente ligou.
--
-- E há a segunda razão, que é a fundação: o livro-razão é append-only. Um
-- pedido MUDA - o cliente corrige a quantidade, adia a data, cancela. Corrigir
-- isso por estorno seria escrever no livro que trezentos picolés saíram e
-- voltaram, quando nenhum saiu do freezer. Estorno é para o que aconteceu.
--
-- Então: tabela própria, com `status` que se atualiza como qualquer cadastro. O
-- livro-razão só entra quando a carga sai de verdade - e isso já é a
-- transferência, que existe desde a 0001.
--
-- APROVAÇÃO É CONFIGURAÇÃO DA EMPRESA, NÃO ESCOLHA NOSSA. Uma fábrica quer que
-- todo pedido passe pelo dono; outra tem três clientes e a burocracia só atrasa
-- a entrega. Os dois caminhos existem, e quem escolhe é a empresa em
-- `orders_need_approval`. O padrão é sem aprovação, porque a fábrica de seis
-- pessoas é o caso que este produto tem na mão.
--
-- O que decide o estado inicial é o GATILHO, não a tela: um cliente que manda
-- o pedido pelo próprio aparelho não pode escolher nascer aprovado.
-- -----------------------------------------------------------------------------

-- Alvo das chaves compostas abaixo: o pedido só aponta para um lugar da própria
-- empresa, e a linha só aponta para um item dela. Sem isto a chave diz que o
-- lugar existe, não que ele é desta fábrica - e quem administra duas lê as duas.
alter table locations add constraint locations_id_company_key unique (id, company_id);
alter table items     add constraint items_id_company_key     unique (id, company_id);

alter table companies
  add column orders_need_approval boolean not null default false;

comment on column companies.orders_need_approval is
  'Se todo pedido nasce pendente à espera de quem tem approve_order. Desligado '
  'por padrão: a fábrica pequena entrega antes de a aprovação chegar.';

create table orders (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  -- Para quem: loja própria, cliente, distribuidor - tudo é `locations`, que é
  -- onde este sistema já guarda "lugar que recebe caixa".
  place_id      uuid not null,
  -- 'pending' só existe quando a empresa liga a aprovação. Depois dele o pedido
  -- é 'open' até virar 'delivered' ou 'cancelled'.
  status        text not null default 'open',
  -- O dia em que o cliente quer receber. A data da DECISÃO é outra e é mais
  -- cedo - quem precisa na sexta produz na quinta - e essa conta é da tela,
  -- porque ela depende do que a fábrica leva para produzir.
  requested_for date,
  note          text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  -- Qual CONTA escreveu, imposto pelo servidor como em `movements`. Quem estava
  -- com o aparelho é outra pergunta e mora no livro-razão, não aqui: um pedido
  -- é do cliente, não de quem digitou.
  recorded_by   uuid not null references auth.users(id),
  constraint orders_status_known
    check (status in ('pending', 'open', 'delivered', 'cancelled')),
  constraint order_place_same_company
    foreign key (place_id, company_id) references locations (id, company_id)
    on delete restrict,
  unique (id, company_id)
);

create table order_lines (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id   uuid not null,
  item_id    uuid not null,
  -- Na unidade base do item, como todo o resto do sistema. Zero não é pedido, e
  -- negativo é devolução - que tem caminho próprio e não é este.
  base_units integer not null check (base_units > 0),
  constraint order_line_belongs_to_its_order
    foreign key (order_id, company_id) references orders (id, company_id)
    on delete cascade,
  constraint order_line_item_same_company
    foreign key (item_id, company_id) references items (id, company_id)
    on delete restrict,
  -- O mesmo item duas vezes no mesmo pedido é erro de digitação, não pedido
  -- duplo: quem quer mais soma na linha que já existe.
  unique (order_id, item_id)
);

create index orders_open_idx on orders (company_id, requested_for)
  where status in ('pending', 'open');
create index order_lines_order_idx on order_lines (order_id);
create index order_lines_item_idx  on order_lines (company_id, item_id);

-- O estado inicial é do BANCO, não da tela.
--
-- Uma empresa que exige aprovação e um cliente que manda o pedido pelo próprio
-- aparelho é exatamente o caso em que a regra não pode morar no aplicativo: o
-- payload vem de fora, e "status" é um campo como outro qualquer no JSON.
create or replace function private.order_starts_where_the_company_says()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'cancelled' then
    select case when c.orders_need_approval then 'pending' else 'open' end
      into new.status
      from companies c
     where c.id = new.company_id;
  end if;
  return new;
end;
$$;

create trigger orders_start_where_the_company_says
  before insert on orders
  for each row execute function private.order_starts_where_the_company_says();

-- E sair do pendente é de quem tem a permissão de aprovar - de mais ninguém.
--
-- A política de UPDATE deixa passar quem despacha, porque marcar entregue é
-- trabalho de quem carrega o caminhão. Sem este gatilho, essa mesma pessoa
-- tiraria um pedido do pendente sem nunca ter tido `approve_order`, e a
-- aprovação que a empresa ligou seria decoração.
create or replace function private.only_approval_leaves_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' and new.status <> 'cancelled' then
    if not private.has_capability(new.company_id, 'approve_order') then
      raise exception
        'Este pedido espera aprovação, e aprovar não faz parte do seu acesso.';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_leave_pending_only_by_approval
  before update on orders
  for each row execute function private.only_approval_leaves_pending();

alter table orders      enable row level security;
alter table order_lines enable row level security;

-- Ler é de quem está na empresa: o operador precisa enxergar o que foi pedido
-- para saber o que produzir, e isso não tem preço nem custo dentro.
create policy orders_read on orders for select
  using (company_id in (select private.current_companies()));
create policy order_lines_read on order_lines for select
  using (company_id in (select private.current_companies()));

-- Registrar pedido é `place_order`, que é a capacidade que existia desde a
-- fundação esperando exatamente por esta tabela.
create policy orders_place on orders for insert
  with check (
    private.has_capability(company_id, 'place_order')
    and recorded_by = auth.uid()
  );
create policy order_lines_place on order_lines for insert
  with check (private.has_capability(company_id, 'place_order'));

-- Mexer no que já foi pedido: quem aprova, quem despacha ou quem administra. O
-- gatilho acima é o que separa aprovar de entregar dentro dessa porta.
create policy orders_decide on orders for update
  using (
    private.has_capability(company_id, 'approve_order')
    or private.has_capability(company_id, 'dispatch')
    or private.has_capability(company_id, 'manage_company')
  )
  with check (
    private.has_capability(company_id, 'approve_order')
    or private.has_capability(company_id, 'dispatch')
    or private.has_capability(company_id, 'manage_company')
  );

create policy order_lines_correct on order_lines for all
  using (private.has_capability(company_id, 'place_order'))
  with check (private.has_capability(company_id, 'place_order'));
```

### `0020_a_lot_and_the_day_it_dies.sql`

```sql
-- A validade mora no produto, e o lote é quem a carrega.
--
-- `lots` existe desde a primeira migração, com `code`, `produced_on`,
-- `expires_on` e um índice dedicado em `movements (company_id, lot_id)`. Nunca
-- teve um escritor: é a mesma peça pronta e sem chamador que o
-- `assistant_phrase` era, e a Fase 2 vem justamente buscá-la.
--
-- O que faltava para a produção conseguir preencher `expires_on` sozinha era o
-- prazo — e ele é do PRODUTO, não da corrida. Quem está de luva no tacho não
-- sabe de cabeça que o picolé dura seis meses e o pote três; o cadastro sabe,
-- respondeu uma vez, e a partir daí toda corrida nasce com a data pronta.
-- Perguntar a validade a cada tacho é pedir o que o sistema já pode deduzir.
--
-- Nulo é resposta válida e significa "não vence": sorvete a granel para uso
-- interno, embalagem, insumo de prateleira. O lote continua existindo e
-- continua rastreando — o que ele não carrega é uma data inventada, que seria
-- pior que nenhuma nos dois sentidos (descartar mercadoria boa, vender
-- mercadoria vencida).

alter table products
  add column shelf_life_days integer
  check (shelf_life_days is null or shelf_life_days > 0);

comment on column products.shelf_life_days is
  'Quantos dias o produto dura depois de feito. Nulo: não vence.';

-- E o lote precisa poder ser REENVIADO, não só enviado.
--
-- `lots_write` existe desde a primeira migração e cobre `insert`. A fila do
-- aparelho sobe com `on conflict (id) do update`, porque reenviar não é caso
-- raro: é o caso normal de um celular que perdeu sinal no meio do envio, ou que
-- foi fechado antes de terminar. Sem política de update, a segunda tentativa é
-- recusada e a fila trava atrás dela.
--
-- É exatamente o defeito que a migração 0015 consertou para `purchases` e
-- `purchase_lines` — e ele estava aqui esperando desde o dia em que a tabela
-- foi criada, porque nada escrevia lote até agora. Peça sem escritor não é peça
-- pronta: é peça não exercitada.

create policy lots_resend on lots
  for update using (private.has_capability(company_id, 'record_production'))
  with check (private.has_capability(company_id, 'record_production'));
```

### `0021_what_was_agreed_with_the_store.sql`

```sql
-- A ficha de acordo da loja.
--
-- Uma fábrica combina "terça e sexta" com uma loja e "sábado" com outra, e até
-- aqui essa tabela morava na cabeça de alguém. Enquanto ela mora lá, o pedido
-- nasce com a data errada e a carga sai no dia em que a loja está fechada.
--
-- Os dias são um bitmask com o bit 0 no domingo, a mesma numeração de
-- `Date.getDay()` no aparelho (`src/domain/agreement.ts`). Um inteiro atravessa
-- a fila do aparelho sem conversão nenhuma, e é isso que garante que os dois
-- lados leiam o mesmo acordo — uma lista de texto tem duas gramáticas
-- possíveis e a divergência aparece só no dia da entrega.
--
-- Zero é "não combinamos dia", que NÃO é "nenhum dia": a loja sem acordo recebe
-- quando dá, e nenhuma tela deve inventar um dia para ela.
alter table locations add column contact_phone text;
alter table locations add column delivery_days smallint not null default 0;
alter table locations add column agreement_note text;

-- Um acordo impossível é erro de digitação, não combinação exótica: sete bits
-- é a semana inteira, e o banco recusa em vez de guardar um dia que não existe.
alter table locations add constraint locations_delivery_days_is_a_week
  check (delivery_days between 0 and 127);
```

### `0022_the_stick_leaves_the_storeroom.sql`

```sql
-- O palito sai do estoque.
--
-- Até aqui a embalagem era um valor DIGITADO no produto
-- (`products.unit_packaging_cents`), enquanto palito e saquinho são itens
-- comprados por nota. O custo congelado saía certo — a correção está em
-- `docs/insights.md` —, mas nenhum movimento tirava palito do almoxarifado: o
-- saldo dele só subia, que é exatamente o cheiro que o CLAUDE.md manda procurar.
-- A cura ficou escrita naquele registro, e é esta.
--
-- A quantidade é POR UNIDADE PRODUZIDA, e é isso que a separa de uma linha de
-- receita. Receita se espalha pelo que o tacho rendeu: meio tacho consome
-- metade do açúcar. Palito não se espalha — uma unidade leva um palito tenha a
-- corrida rendido 400 ou 500.
--
-- Lista em `jsonb` na própria linha do produto, pelo mesmo motivo que
-- `items.packaging` já é: curta, reescrita inteira, sem histórico próprio. O
-- histórico é o consumo que cada corrida gravou com a taxa congelada, e esse
-- está em `movements`, que ninguém reescreve.
--
-- `unit_packaging_cents` continua e não vira duplicidade: passa a ser o que NÃO
-- está listado aqui. Quem não quer contar palito digita o valor; quem quer,
-- lista os itens. Os dois caminhos existem, como manda o projeto.
alter table products add column packaging_items jsonb not null default '[]'::jsonb;

-- Um objeto onde deveria haver lista atravessa o `jsonb` sem reclamar e só
-- aparece na hora de somar o consumo. Mesma razão do `structure()` no
-- aparelho: a falha que ainda parece sucesso é a que merece uma restrição.
alter table products add constraint products_packaging_items_is_a_list
  check (jsonb_typeof(packaging_items) = 'array');
```

### `0023_the_ruler_that_turns_a_balance_into_a_judgement.sql`

```sql
-- O nível cheio de um item.
--
-- O dono desenhou as faixas de volume em porcentagem — vermelho até 25, amarelo
-- até 40, verde no meio, azul acima de 80, e zerado à parte — e porcentagem é
-- sempre de alguma coisa. Sem uma referência cadastrada, "20%" é um número que
-- ninguém pode conferir, e pintar a linha de vermelho por conta própria seria
-- exatamente o alerta inventado que ensina a ignorar alerta.
--
-- Nulo é o caso normal: o item não entra na leitura por faixa e nenhuma tela
-- pinta cor nele. É a mesma forma da validade em `products.shelf_life_days` —
-- campo opcional cujo vazio significa "não me pergunte isso".
--
-- Em unidade-base como todo o resto do estoque, então a porcentagem se calcula
-- sem conversão no caminho: um saco de 50 kg de açúcar é 50000 g.
alter table items add column full_level numeric(14,4)
  check (full_level is null or full_level > 0);
```

### `0024_a_reading_is_a_fact_like_any_other.sql`

```sql
-- A leitura de uma grandeza num lugar.
--
-- O dono pediu alarme de temperatura da câmara fria, disse que vai arrumar um
-- ESP32 para vendermos o módulo, lembrou que muita fábrica tem mais de uma
-- câmara, e depois somou umidade, pressão e ruído. As quatro coisas juntas
-- desenham esta tabela — e o desenho existe para que nenhuma delas peça migração
-- depois:
--
--  * `kind` e `unit` são TEXTO ABERTO. Grandeza nova e protocolo novo entram como
--    dado. Fechar num enum seria transformar "quero medir umidade também" numa
--    migração, e o custo apareceria justamente quando ele estivesse com o
--    hardware na mão.
--  * `source` também é texto: `typed`, `ble`, `wifi`, `zigbee`, `lora`. O que
--    importa para a integridade não é o rádio, é o lugar e quem gravou.
--  * `device_id` é NULO quando alguém digitou na conferência. Leitura digitada é
--    fato tanto quanto leitura de sensor, e é o único caminho que funciona hoje:
--    a fábrica passa a ter histórico antes de existir módulo, em vez de esperar
--    seis meses e começar do zero.
--  * Mais de uma câmara já estava resolvido: cada câmara é um `location`, e N
--    sensores são N `devices` apontando para lugares diferentes.
--
-- `recorded_by` é obrigatório e incedível, como em `movements`: leitura sem autor
-- é leitura que ninguém pode contestar, e o livro-razão deste app não tem linha
-- assim.
create table readings (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete restrict,
  -- O aparelho que mediu. Nulo é a leitura digitada por uma pessoa.
  device_id   uuid references devices(id) on delete set null,

  kind        text not null,
  value       numeric(14,4) not null,
  unit        text not null,

  -- Quando a medição aconteceu no mundo, não quando chegou ao servidor: um
  -- sensor sem sinal guarda a leitura e envia depois, e a hora que interessa é a
  -- da câmara.
  taken_at    timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  source      text not null default 'typed',

  -- Uma grandeza sem unidade é um número solto: 4 é geladeira boa em Celsius e
  -- freezer quebrado em Fahrenheit.
  constraint reading_has_a_unit check (length(trim(unit)) > 0),
  constraint reading_has_a_kind check (length(trim(kind)) > 0)
);

create index readings_where_idx on readings (company_id, location_id, kind, taken_at desc);

-- A faixa aceitável de cada grandeza, no próprio lugar.
--
-- Mora na linha do lugar pelo mesmo motivo que a lista de embalagem mora na do
-- produto: é curta, é reescrita inteira e não tem histórico próprio. O histórico
-- é a série de leituras, que ninguém reescreve.
alter table locations add column sensor_ranges jsonb not null default '{}'::jsonb;

alter table locations add constraint locations_sensor_ranges_is_an_object
  check (jsonb_typeof(sensor_ranges) = 'object');

alter table readings enable row level security;

-- Ler leitura é de quem lê o lugar: a temperatura da câmara não é dinheiro, e
-- quem está no chão de fábrica precisa dela mais que o escritório.
create policy readings_read on readings for select
  using (company_id in (select private.current_companies()));

-- Escrever é de quem registra estoque — a mesma capacidade da contagem, porque é
-- o mesmo gesto: alguém foi até a câmara e anotou o que viu.
create policy readings_write on readings for insert
  with check (
    private.has_capability(company_id, 'adjust_stock')
    and recorded_by = auth.uid()
  );
```

### `0025_what_the_kettle_makes_is_worth_something.sql`

```sql
-- O produto fabricado não tinha custo, dos dois lados, e o dinheiro sumia.
--
-- `apply_purchase_to_cost` (0009) é o único autor de `item_costs` neste
-- servidor, e ele dispara em `purchase_lines`. Picolé nunca é comprado — ele
-- sai do tacho —, então nunca teve linha em `item_costs`, então valia zero.
--
-- O efeito somado é pior que um número feio numa tela. O consumo tira o insumo
-- do saldo com o valor dele junto, e a produção põe o produto de volta valendo
-- nada: **o dinheiro evapora do balanço a cada corrida**. Na `stock_balances`
-- de uma loja com 1.466 picolés, "vale R$ 0,00".
--
-- O aparelho passou a ser autor da média do produto na mesma rodada, e este é
-- o espelho: a mesma média móvel, sobre a mesma pergunta, para os dois lados
-- concluírem o mesmo número. `item_costs` continua fora da fila de sincronia —
-- valor derivado tem um autor por lado, e mandar o número pronto foi o que já
-- pôs servidor e aparelho discordando uma vez (0.5605 contra 0.5310).
--
-- A fonte aqui é `movements.unit_cost_rate`: a taxa que a corrida congelou,
-- com a embalagem por unidade já dentro. Não se recalcula a receita no
-- servidor — recalcular é convidar os dois lados a divergirem por
-- arredondamento, e a taxa congelada é o fato que o razão guarda.
--
-- Como em 0009, o "antes" exclui a própria linha por id: a ordem em que a fila
-- chega não muda o resultado, e um reenvio não dobra a média.

create or replace function apply_production_to_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  held_units bigint;
  held_rate  numeric(18,8);
  new_rate   numeric(18,8);
begin
  -- Só a perna que CRIA produto. O consumo é negativo e não move a média do
  -- insumo, que é o que o aparelho já dizia em comentário desde o começo.
  if new.kind <> 'production'
     or new.quantity_base_units <= 0
     or new.unit_cost_rate is null then
    return new;
  end if;

  select coalesce(sum(quantity_base_units), 0)
    into held_units
    from movements
   where company_id = new.company_id
     and item_id = new.item_id
     and id <> new.id;

  select average_rate
    into held_rate
    from item_costs
   where company_id = new.company_id and item_id = new.item_id;

  if held_rate is null then
    held_rate := 0;
  end if;

  held_units := greatest(held_units, 0);
  new_rate := ((held_rate * held_units) + (new.unit_cost_rate * new.quantity_base_units))
              / (held_units + new.quantity_base_units);

  insert into item_costs (company_id, item_id, average_rate, last_rate, updated_at)
  values (new.company_id, new.item_id, new_rate, new.unit_cost_rate, now())
  on conflict (company_id, item_id) do update
    set average_rate = excluded.average_rate,
        last_rate = excluded.last_rate,
        updated_at = now();

  -- A história do custo do produto, sem nota: `purchase_line_id` é nulo porque
  -- não houve compra. A coluna sempre aceitou nulo, e é por isso que este
  -- passo não precisa mexer na tabela.
  insert into item_cost_history (company_id, item_id, purchase_line_id, previous_rate, new_rate)
  values (new.company_id, new.item_id, null, nullif(held_rate, 0), new_rate);

  return new;
end;
$$;

drop trigger if exists production_updates_cost on movements;
create trigger production_updates_cost
  after insert on movements
  for each row
  execute function apply_production_to_cost();
```

### `0026_which_sheet_made_this_one.sql`

```sql
-- O lote passa a dizer QUAL FICHA rodou.
--
-- A auditoria da Fase 1 marcou isto como o único item ausente, e ele voltou pela
-- metade: `production_runs.recipe_version_id` recebia o id da RECEITA na coluna
-- da VERSÃO, e a linha da corrida é apagada ao fechar ou cancelar. Nada durável,
-- dos dois lados, dizia de que ficha aquele picolé saiu.
--
-- O custo disso aparece no dia em que alguém corrige a fórmula: sem o carimbo,
-- custo histórico e recall passam a apontar para a receita de HOJE, e uma
-- correção feita em março reescreve o que janeiro custou. O livro-razão é
-- imutável exatamente para isso não acontecer — a taxa congelada continuava
-- certa, mas a pergunta "de que ficha veio?" não tinha resposta em lugar nenhum.
--
-- A marca fica no LOTE, e não na corrida, porque o lote é o que sobrevive: ele
-- não é apagado, é o que a etiqueta nomeia, e é por ele que um recall começa.
--
-- Anulável de propósito. Lote de importação não tem ficha, e lote gravado antes
-- desta migração também não — pôr `not null` aqui obrigaria a inventar uma ficha
-- para linhas que não têm, que é o oposto do que esta coluna existe para fazer.
-- A chave estrangeira, essa é de verdade: um lote que aponta para uma versão que
-- não existe é pior que um lote calado.
--
-- A ordem da fila do aparelho já resolve a dependência sem ninguém ordenar nada:
-- a versão da receita é gravada quando a ficha é salva, muito antes da corrida
-- que a usa, e a fila sobe da escrita mais velha para a mais nova.

alter table lots add column recipe_version_id uuid references recipe_versions(id);

create index lots_recipe_version_idx on lots (company_id, recipe_version_id)
  where recipe_version_id is not null;
```

### `0027_a_resend_is_not_a_decision.sql`

```sql
-- O pedido precisa poder ser REENVIADO, e reenviar não é decidir.
--
-- Terceira aparição da mesma família, e a primeira com cara nova. A 0015
-- consertou `purchases` e `purchase_lines`, a 0020 consertou `lots`, e as duas
-- vezes o defeito era o mesmo: a tabela tinha política de insert e NENHUMA de
-- update, e a fila do aparelho sobe com `on conflict (id) do update`. Reenviar
-- não é caso raro — é o caso normal de um celular que perdeu sinal no meio do
-- envio, ou que foi fechado antes de terminar.
--
-- Aqui não é ausência de política de update: é política de update com a
-- capacidade ERRADA. `orders_place` deixa entrar quem tem `place_order`, e
-- `orders_decide` só deixa mexer quem tem `approve_order`, `dispatch` ou
-- `manage_company`. Três dos sete papéis do produto — `storeManager`,
-- `customer` e `salesperson` — têm o primeiro e nenhum dos três.
--
-- O que isso faz na fábrica: a gerente da loja anota o pedido sem sinal. A
-- primeira subida entra. A segunda é recusada, e o `src/sync/engine.ts` para a
-- fila no primeiro buraco de propósito — então produção, contagem e leitura de
-- câmara gravadas DEPOIS daquele pedido ficam presas atrás dele para sempre,
-- sem nada na tela dizendo o quê.
--
-- A frase que ficou escrita no `docs/insights.md` depois da 0015 é a que não
-- cobriu este caso: *"todas as outras tabelas que ela escreve têm um
-- `_manage FOR ALL`, que cobre update"*. `orders` tem política de update, e é
-- por isso que a busca por "tabela sem update" não a encontrou. A tabela filha
-- acertou na mesma migração — `order_lines_correct` é `for all` com
-- `place_order`.
--
-- POR QUE A BARRA NÃO PEGOU. A conta que sobe a fila na checagem 6 do
-- `db:verify` recebe `enum_range(null::capability)` — todas as capacidades. E a
-- checagem 8, que é a do pedido, dá à "Vendedora" `place_order` MAIS `dispatch`,
-- e é o `dispatch` que faz o update passar. Nenhuma conta com `place_order`
-- sozinho jamais rodou a segunda passagem. A checagem 9 desta entrega é
-- exatamente isso: a fila subida duas vezes pela capacidade MÍNIMA de cada
-- papel que escreve.

-- 1. O autor pode reenviar o próprio pedido.
--
-- `recorded_by = auth.uid()` nos dois lados espelha o que `orders_place` já
-- exige: só a conta que escreveu alcança a linha, e ela não pode passá-la para
-- outra pessoa no meio do reenvio.
create policy orders_resend on orders
  for update using (
    private.has_capability(company_id, 'place_order')
    and recorded_by = auth.uid()
  )
  with check (
    private.has_capability(company_id, 'place_order')
    and recorded_by = auth.uid()
  );

-- 2. E o reenvio não decide nada.
--
-- Uma política de RLS não consegue dizer "contanto que não mude": a expressão
-- não enxerga o antes e o depois ao mesmo tempo. Quem sabe as duas coisas é o
-- gatilho — e é assim que esta migração já resolve a mesma pergunta no insert:
-- `order_starts_where_the_company_says` SOBRESCREVE o status que veio do
-- aparelho, com a razão escrita ali ("o payload vem de fora, e status é um campo
-- como outro qualquer no JSON"). No update vale o mesmo, pelo mesmo motivo.
--
-- Devolver em vez de recusar, e isto é escolha: recusar deixaria a fila travada
-- outra vez, que é o defeito que esta migração existe para matar. O aparelho de
-- quem não decide não tem tela para decidir — ele não está tentando aprovar,
-- está reenviando o que já mandou.
create or replace function private.a_resend_decides_nothing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    private.has_capability(new.company_id, 'approve_order')
    or private.has_capability(new.company_id, 'dispatch')
    or private.has_capability(new.company_id, 'manage_company')
  ) then
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;
  return new;
end;
$$;

-- O NOME DESTE GATILHO É LOAD-BEARING, e mudá-lo quebra a regra em silêncio.
--
-- O Postgres roda os gatilhos `before` da mesma tabela em ordem ALFABÉTICA de
-- nome. Este precisa vir antes de `orders_leave_pending_only_by_approval`:
-- se aquele rodar primeiro, ele vê um status novo diferente do velho, levanta
-- exceção, e a fila trava — que é exatamente o que se está consertando.
-- `orders_decision_fields_stay_put` < `orders_leave_pending_only_by_approval`
-- porque 'd' vem antes de 'l'. Renomear qualquer um dos dois sem conferir isto
-- devolve o defeito sem nenhum teste ficar vermelho por outro motivo.
create trigger orders_decision_fields_stay_put
  before update on orders
  for each row execute function private.a_resend_decides_nothing();
```

### `0028_the_index_under_what_was_reversed.sql`

```sql
-- O índice que faltava embaixo de "o que foi estornado não aconteceu".
--
-- A cláusula `NAO_ESTORNADO` do aplicativo é uma subconsulta correlacionada:
-- para CADA linha candidata ela pergunta se existe um movimento que a estorna.
-- Sem índice em `reverses_movement_id`, essa pergunta é uma varredura completa
-- de `movements`, e ela roda uma vez por linha. Oito consultas usam a cláusula,
-- e a capa dispara cinco delas de uma vez.
--
-- Medido contra um SQLite de 60 mil movimentos — cinco meses de uma fábrica de
-- seis lojas —, janela de sete dias, 2.779 linhas candidatas: 9.906 ms com a
-- cláusula e sem índice, 3 ms sem a cláusula, 4 ms com a cláusula e o índice.
-- O aparelho é mais lento que a máquina onde isso foi medido, então esses
-- números são o piso.
--
-- Aqui no servidor a mesma coisa vale, e por um motivo a mais: a vista
-- `movements_visible` — que é por onde o dado sai — carrega a coluna, e o dia
-- em que um relatório do lado de cá filtrar por estorno ele encontra o mesmo
-- abismo com um Postgres muito maior embaixo.
--
-- PARCIAL de propósito: só as linhas de estorno entram. Estorno é raro por
-- natureza — uma corrida corrigida por semana numa fábrica — então o índice
-- ocupa praticamente nada e continua ocupando pouco daqui a dois anos.
--
-- E `concurrently` NÃO é usado aqui de propósito: a migração roda em transação
-- pelo `supabase db push`, e `create index concurrently` é recusado dentro de
-- uma. Numa tabela de estornos — que hoje tem zero linhas em qualquer empresa —
-- o bloqueio é instantâneo.

create index if not exists movements_reversal_idx
  on movements (reverses_movement_id, company_id)
  where reverses_movement_id is not null;
```

### `0029_a_movement_cannot_point_at_another_company.sql`

```sql
-- O livro-razão aceitava item e local de OUTRA empresa.
--
-- A política de escrita pergunta se a pessoa pode gravar NAQUELA empresa —
-- `has_capability(company_id, 'record_production')` — e ninguém perguntava se o
-- item é DAQUELA empresa. As chaves estrangeiras de `movements` eram simples:
-- `item_id references items(id)`, `location_id references locations(id)`.
--
-- Um operador cuja única associação é a empresa A conseguia inserir no razão de
-- A um movimento apontando para o item e o almoxarifado da empresa B. A linha
-- entra, o saldo de A passa a falar de um item que não é de A, e o livro-razão é
-- append-only: a linha não sai nunca mais.
--
-- E não é preciso adivinhar id nenhum. `ensureLocation` cria o lugar padrão com
-- `id = company_id`, então o id do almoxarifado de B **é** o id de B — e o id de
-- uma empresa é legível para quem esteve nela.
--
-- O padrão certo já existia nesta base, na mesma família de tabelas: a 0019 pôs
-- `unique (id, company_id)` em `items` e `locations` exatamente para o pedido
-- poder dizer `foreign key (place_id, company_id) references locations (id,
-- company_id)`. A tabela mais importante do sistema era a que não usava.
--
-- `lots` fica de fora desta migração de propósito: ele não tem `unique (id,
-- company_id)`, então a chave composta pediria um índice novo. O risco lá é
-- menor — o lote não entra em nenhuma soma de saldo, ele é identidade — e
-- misturar as duas coisas numa migração faria a parte cara atrasar a barata.
-- Fica escrito aqui para não ser redescoberto: `movements.lot_id` ainda é chave
-- simples.

alter table movements
  add constraint movement_item_same_company
  foreign key (item_id, company_id) references items (id, company_id)
  on delete restrict;

alter table movements
  add constraint movement_location_same_company
  foreign key (location_id, company_id) references locations (id, company_id)
  on delete restrict;

-- A contraparte é anulável — nem todo movimento tem outro lado —, e a chave
-- composta respeita isso: em Postgres, uma chave estrangeira multicoluna com
-- qualquer coluna nula não é verificada (MATCH SIMPLE, que é o padrão). O que
-- ela impede é o caso que importa: contraparte preenchida apontando para fora.
alter table movements
  add constraint movement_counterpart_same_company
  foreign key (counterpart_location_id, company_id) references locations (id, company_id)
  on delete restrict;
```

### `0030_the_default_room_is_bookkeeping_not_a_privilege.sql`

```sql
-- Quarta aparição da fila travada, e a forma é nova outra vez.
--
-- `ensureLocation` cria o lugar padrão da empresa no PRIMEIRO movimento de
-- qualquer aparelho — com `id = company_id`, nome vazio, `kind = 'store_room'` —
-- e o enfileira, porque ele tem que chegar ao servidor antes do movimento que se
-- apoia nele. A política que recebe essa linha é `locations_manage`, que exige
-- `manage_company`.
--
-- Só o dono tem `manage_company`. Os outros seis papéis do produto não — e o
-- `operator` é o do celular emprestado, que é decisão escrita: *"aparelho
-- emprestado entra como produção e nada mais"*. A operadora da câmara fria faz a
-- primeira produção do dia sem sinal, o aparelho grava tudo e enfileira o lugar,
-- e quando acha rede o Postgres recusa a linha. O engine para no primeiro
-- buraco de propósito, e a partir dali nada mais sobe daquele aparelho.
--
-- É a mesma família da 0015 (purchases), da 0020 (lots) e da 0027 (orders), com
-- a quarta cara: não é ausência de política nem capacidade errada no update —
-- é a linha de ESCRITURAÇÃO DO PRÓPRIO SISTEMA exigindo a capacidade de
-- administrar a empresa.
--
-- O conserto é estreito de propósito e NÃO é permissão nova. `id = company_id`
-- não é um lugar que alguém escolheu: é o único id que a empresa pode ter, e
-- `ensureLocation` é a única coisa que o escreve. Cadastrar um lugar de verdade
-- — com nome, câmara fria, loja — continua sendo de quem administra, pela
-- `locations_manage` que fica exatamente como está.
--
-- Insert e update, e não `for all`: a fila sobe com `on conflict do update`,
-- então o reenvio precisa do update — mas apagar lugar continua sendo de quem
-- administra.

create policy locations_default_room on locations
  for insert
  with check (
    id = company_id
    and (
      private.has_capability(company_id, 'record_production')
      or private.has_capability(company_id, 'adjust_stock')
      or private.has_capability(company_id, 'record_loss')
      or private.has_capability(company_id, 'dispatch')
      or private.has_capability(company_id, 'check_receipt')
    )
  );

create policy locations_default_room_resend on locations
  for update
  using (
    id = company_id
    and (
      private.has_capability(company_id, 'record_production')
      or private.has_capability(company_id, 'adjust_stock')
      or private.has_capability(company_id, 'record_loss')
      or private.has_capability(company_id, 'dispatch')
      or private.has_capability(company_id, 'check_receipt')
    )
  )
  with check (
    id = company_id
    and (
      private.has_capability(company_id, 'record_production')
      or private.has_capability(company_id, 'adjust_stock')
      or private.has_capability(company_id, 'record_loss')
      or private.has_capability(company_id, 'dispatch')
      or private.has_capability(company_id, 'check_receipt')
    )
  );
```

### `0031_a_reading_can_be_sent_twice.sql`

```sql
-- A leitura da câmara precisa poder ser REENVIADA, e reenviar não é anotar de novo.
--
-- QUINTA aparição da mesma família, e a primeira encontrada procurando a família
-- em vez de esbarrando nela. A 0015 consertou `purchases` e `purchase_lines`, a
-- 0020 consertou `lots`, a 0027 consertou `orders` (política de update com a
-- capacidade errada), a 0030 consertou o lugar padrão — e `readings` nasceu na
-- 0024 com `readings_read` e `readings_write` e mais nada. Nenhuma política de
-- update.
--
-- A fila do aparelho sobe com `on conflict (id) do update`, sempre: é o que faz o
-- reenvio ser inofensivo, e reenviar é o caso NORMAL de um celular que perdeu
-- sinal no meio do envio. Sem política de update, o Postgres recusa a linha
-- inteira — mesmo idêntica — e o `src/sync/engine.ts` para a fila no primeiro
-- buraco de propósito. Tudo o que a fábrica gravar depois daquela leitura fica
-- preso atrás dela, sem nada na tela dizendo o quê.
--
-- E o gesto é justamente o de quem está com o aparelho na mão dentro da câmara,
-- a -18 °C, onde o sinal não chega: a leitura é a escrita com MAIOR chance de
-- subir duas vezes em todo o aplicativo.
--
-- POR QUE A BARRA NÃO PEGOU. A checagem 9 do `db:verify` — a que sobe a fila duas
-- vezes pela capacidade mínima de cada papel — replica um `orders`, e só. Nenhuma
-- leitura jamais foi reenviada contra o servidor de verdade. A checagem 12 desta
-- entrega é exatamente isso, e ela reprova sem esta política.

-- O autor reenvia a própria leitura, e não pode passá-la para outra pessoa.
--
-- `adjust_stock` é a mesma capacidade do insert (`readings_write`), pelo mesmo
-- motivo escrito ali: é o mesmo gesto de quem foi até a câmara e anotou o que
-- viu. E `recorded_by = auth.uid()` nos dois lados espelha o insert — a
-- assinatura é incedível, como em `movements`.
create policy readings_resend on readings
  for update using (
    private.has_capability(company_id, 'adjust_stock')
    and recorded_by = auth.uid()
  )
  with check (
    private.has_capability(company_id, 'adjust_stock')
    and recorded_by = auth.uid()
  );

-- E o reenvio não reescreve o passado.
--
-- Uma política de RLS não consegue dizer "contanto que não mude": a expressão não
-- enxerga o antes e o depois ao mesmo tempo. Quem sabe as duas coisas é o
-- gatilho, e é a mesma forma que a 0027 usou para `orders`.
--
-- O que fica congelado é O QUE FOI VISTO, inteiro: a grandeza, o valor, a
-- unidade, o instante, o lugar, o aparelho e a origem. Reenviar é dizer de novo a mesma coisa; qualquer diferença ali é outra
-- leitura, e outra leitura é outra linha — o livro de leituras é append-only pela
-- mesma razão que o de movimentos.
create or replace function private.a_resend_reads_nothing_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.kind        := old.kind;
  new.value       := old.value;
  new.unit        := old.unit;
  new.taken_at    := old.taken_at;
  new.location_id := old.location_id;
  new.device_id   := old.device_id;
  new.source      := old.source;
  new.recorded_by := old.recorded_by;
  return new;
end;
$$;

create trigger a_reading_resent_stays_the_same
  before update on readings
  for each row execute function private.a_resend_reads_nothing_new();
```

### `0032_who_ordered_it_never_changes.sql`

```sql
-- Quem anotou o pedido nunca muda, nem para quem aprova.
--
-- A assinatura deste sistema é incedível por decisão de fundação — `recorded_by` é
-- estampado pelo servidor a partir da sessão, e o `src/sync/serialize.ts` nem manda
-- o campo que o aparelho tem. `orders_place` exige `recorded_by = auth.uid()` desde
-- a 0019, e a 0027 exigiu nos dois lados do reenvio.
--
-- `orders_decide` não exigia. A porta de quem aprova, despacha ou administra só
-- pergunta pela capacidade — então o mesmo `update` que aprova um pedido podia
-- trocar QUEM o anotou. A gerente da loja sai do registro e outra pessoa entra no
-- lugar dela, com o pedido inteiro parecendo dela desde sempre.
--
-- Numa fábrica de seis pessoas isso não é invasão de fora: é reescrever o passado
-- de dentro, no único campo que o livro de pedidos tem para dizer quem pediu o quê.
-- E é exatamente o que o relatório de conferência precisa não poder fazer — a
-- decisão do dono sobre nomear quem registrou (`names_who_recorded`) só é honesta se
-- o nome guardado for o de quem estava lá.
--
-- `movements` não tem este buraco porque não tem política de update nenhuma: a
-- imutabilidade dele é gatilho, e é a mesma ferramenta usada aqui. Política de RLS
-- não consegue dizer "contanto que não mude" — a expressão não vê o antes e o
-- depois ao mesmo tempo.
--
-- A checagem 13 do `db:verify` reprova sem isto, com a mensagem que nomeia o autor
-- trocado. Ela foi escrita antes desta migração e viu o campo virar outro id.
create or replace function private.a_resend_decides_nothing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Quem anotou é fato do passado, e não é decisão de ninguém: congela para
  -- TODOS, antes de qualquer pergunta sobre capacidade. Quem aprova decide o
  -- estado do pedido, não a autoria dele.
  new.recorded_by := old.recorded_by;

  if not (
    private.has_capability(new.company_id, 'approve_order')
    or private.has_capability(new.company_id, 'dispatch')
    or private.has_capability(new.company_id, 'manage_company')
  ) then
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;
  return new;
end;
$$;
```


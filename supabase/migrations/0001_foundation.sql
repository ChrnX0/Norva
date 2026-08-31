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

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

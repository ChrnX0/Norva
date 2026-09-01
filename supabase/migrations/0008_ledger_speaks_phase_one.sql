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

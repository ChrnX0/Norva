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

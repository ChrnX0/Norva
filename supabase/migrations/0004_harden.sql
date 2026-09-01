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

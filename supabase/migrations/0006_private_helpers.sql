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

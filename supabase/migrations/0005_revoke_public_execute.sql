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

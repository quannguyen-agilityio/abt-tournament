-- The service role (server actions, pnpm import:2026) writes tables whose security invoker triggers
-- call private helpers, e.g. season_player_sync_captains: without usage on the schema those writes
-- fail with "permission denied for schema private".

grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;
alter default privileges in schema private grant execute on functions to service_role;

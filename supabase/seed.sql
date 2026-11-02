-- Local accounts only (plan §7): `pnpm db:reset` loads this after the migrations. No season data: the
-- real ABT 2026 season comes from `pnpm import:2026` (README "Seed data"), the fake E2E demo seasons
-- from supabase/seeds/e2e-demo.sql.
--
-- Accounts (password in README "Seed accounts"), for local use only:
-- - btc@example.com (BTC) and referee@example.com (the E2E referee).
-- - nha@, nhat@ and ha@example.com: the ABT 2026 referees. Their display names are the referee labels
--   of the workbook, so `pnpm import:2026` assigns them to their matches.

-- Accounts --------------------------------------------------------------------------------------------

create temporary table seed_account (id uuid primary key, email text, display_name text, role public.user_role);

insert into seed_account
values
  ('10000000-0000-0000-0000-000000000001', 'btc@example.com', 'BTC Demo', 'btc'),
  ('10000000-0000-0000-0000-000000000002', 'referee@example.com', 'Trọng tài Demo', 'referee'),
  ('10000000-0000-0000-0000-000000000003', 'nha@example.com', 'Nhã', 'referee'),
  ('10000000-0000-0000-0000-000000000004', 'nhat@example.com', 'Nhật', 'referee'),
  ('10000000-0000-0000-0000-000000000005', 'ha@example.com', 'Hạ', 'referee');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', a.id, 'authenticated', 'authenticated', a.email,
  extensions.crypt('abt-demo', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), '', '', '', ''
from seed_account a;

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), a.id, a.id::text, 'email',
  jsonb_build_object('sub', a.id::text, 'email', a.email, 'email_verified', true),
  now(), now(), now()
from seed_account a;

insert into public.profile (user_id, display_name, role, must_change_password)
select a.id, a.display_name, a.role, false
from seed_account a;

drop table seed_account;

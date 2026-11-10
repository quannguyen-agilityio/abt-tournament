-- live_claim and the scorer lock guard (spec-phase-2 §5, L5). Run with `pnpm db:test` against the
-- local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'btc.claim@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'referee1.claim@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'referee2.claim@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'inactive.claim@example.com');

insert into public.profile (user_id, display_name, role, is_active)
values
  ('00000000-0000-0000-0000-0000000000b1', 'BTC Claim', 'btc', true),
  ('00000000-0000-0000-0000-0000000000a1', 'Referee One', 'referee', true),
  ('00000000-0000-0000-0000-0000000000a2', 'Referee Two', 'referee', true),
  ('00000000-0000-0000-0000-0000000000a3', 'Referee Inactive', 'referee', false);

insert into public.season (id, year, name, status)
values
  ('00000000-0000-0000-0000-000000000001', 2095, 'ABT 2095', 'group'),
  ('00000000-0000-0000-0000-000000000002', 2096, 'ABT 2096', 'draft');

insert into public.team (id, season_id, name, color)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội Một', '#112233'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội Hai', '#445566'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', 'Đội Ba', '#778899'),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000002', 'Đội Bốn', '#aabbcc');

-- V01: locked, nobody scoring. V02: scheduled. V03: completed. V04: locked, in a draft season.
insert into public.match (id, season_id, code, stage, round, home_team_id, away_team_id, status, winner_team_id)
values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'lineup_locked', null),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', 'V02', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'scheduled', null),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000001', 'V03', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'completed',
   '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000002', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000014', 'lineup_locked', null);

insert into public.match_slot (id, match_id, slot_no, slot_type, handicap_home, handicap_away)
values ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000031', 1, 'open', 0, 0);

-- anon and inactive users ----------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok(
  $$ select public.live_claim('00000000-0000-0000-0000-000000000031') $$,
  '42501',
  null,
  'anon cannot claim the lock'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';

select throws_ok(
  $$ select public.live_claim('00000000-0000-0000-0000-000000000031') $$,
  '42501',
  'staff only',
  'an inactive referee cannot claim the lock'
);

-- Matches that are not open for live scoring -----------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.live_claim('00000000-0000-0000-0000-000000000032') $$,
  'P0001',
  'scores closed',
  'a match whose lineups are not locked cannot be claimed'
);
select throws_ok(
  $$ select public.live_claim('00000000-0000-0000-0000-000000000033') $$,
  'P0001',
  'scores closed',
  'a completed match cannot be claimed'
);
select throws_ok(
  $$ select public.live_claim('00000000-0000-0000-0000-000000000034') $$,
  'P0002',
  'match not found',
  'a referee cannot claim a match in a draft season'
);
select throws_ok(
  $$ select public.live_claim('00000000-0000-0000-0000-000000000039') $$,
  'P0002',
  'match not found',
  'a match that does not exist cannot be claimed'
);

-- No direct writes to the lock -------------------------------------------------------------------------

select throws_ok(
  $$ update public.match set scorer_id = auth.uid(), scorer_since = now()
     where id = '00000000-0000-0000-0000-000000000031' $$,
  '42501',
  'the scorer lock moves only through live_claim',
  'a referee cannot write the lock directly'
);
select lives_ok(
  $$ update public.match set scheduled_at = '2095-01-10T01:00:00Z' where id = '00000000-0000-0000-0000-000000000031' $$,
  'a referee still updates the other columns of an open match'
);

-- Start live scoring (nobody holds the lock) -------------------------------------------------------------

select isnt(
  public.live_claim('00000000-0000-0000-0000-000000000031'),
  null,
  'a referee claims the lock of a locked match nobody is scoring'
);

reset role;
select results_eq(
  $$ select scorer_id, scorer_since is not null from public.match where id = '00000000-0000-0000-0000-000000000031' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, true) $$,
  'the lock holds the referee and since when'
);
select results_eq(
  $$ select actor_id, before ->> 'scorer_id', after ->> 'scorer_id' from public.audit_log
     where entity = 'match' and entity_id = '00000000-0000-0000-0000-000000000031'
       and before ->> 'scorer_id' is distinct from after ->> 'scorer_id' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, null::text, '00000000-0000-0000-0000-0000000000a1') $$,
  'the claim is audited'
);
set local role authenticated;

select is(
  public.live_claim('00000000-0000-0000-0000-000000000031'),
  (select scorer_since from public.match where id = '00000000-0000-0000-0000-000000000031'),
  'claiming a lock the caller already holds changes nothing'
);
select is(
  public.live_apply('00000000-0000-0000-0000-000000000041', 1, 'setup', '{}'),
  1,
  'the scorer adds an event'
);

-- A second claim loses ----------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';

select throws_ok(
  $$ select public.live_claim('00000000-0000-0000-0000-000000000031') $$,
  '40001',
  'scorer changed',
  'starting live scoring fails once someone holds the lock'
);
select throws_ok(
  $$ select public.live_claim('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-0000000000b1') $$,
  '40001',
  'scorer changed',
  'a takeover of someone who is not the scorer fails'
);

-- Takeover ----------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ update public.match set scorer_id = null, scorer_since = null
     where id = '00000000-0000-0000-0000-000000000031' $$,
  '42501',
  'the scorer lock moves only through live_claim',
  'the BTC cannot write the lock directly'
);
select isnt(
  public.live_claim('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-0000000000a1'),
  null,
  'a BTC member takes over from the scorer'
);

reset role;
select is(
  (select scorer_id from public.match where id = '00000000-0000-0000-0000-000000000031'),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'the lock moved to the BTC member'
);
select results_eq(
  $$ select actor_id, before ->> 'scorer_id', after ->> 'scorer_id' from public.audit_log
     where entity = 'match' and entity_id = '00000000-0000-0000-0000-000000000031'
       and before ->> 'scorer_id' = '00000000-0000-0000-0000-0000000000a1'
       and after ->> 'scorer_id' is distinct from before ->> 'scorer_id' $$,
  $$ values ('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000a1',
             '00000000-0000-0000-0000-0000000000b1') $$,
  'the takeover is audited with both users'
);
set local role authenticated;

-- The previous scorer is rejected; the new one carries on -----------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 2, 'point', '{"side": "home"}') $$,
  '42501',
  'not the scorer',
  'an event from the previous scorer is rejected'
);
select throws_ok(
  $$ select public.live_claim('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-0000000000a1') $$,
  '40001',
  'scorer changed',
  'the previous scorer cannot take the lock back with a stale confirmation'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select is(
  public.live_apply('00000000-0000-0000-0000-000000000041', 2, 'point', '{"side": "home"}'),
  2,
  'the new scorer carries on the same log'
);

-- A deactivated scorer can be taken over -------------------------------------------------------------------

reset role;
update public.profile set is_active = false where user_id = '00000000-0000-0000-0000-0000000000b1';
set local role authenticated;

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 3, 'point', '{"side": "home"}') $$,
  '42501',
  'staff only',
  'a deactivated scorer is rejected'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';

select isnt(
  public.live_claim('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-0000000000b1'),
  null,
  'a referee takes over from a deactivated scorer'
);

-- The service role is trusted ----------------------------------------------------------------------------

reset role;
set local role service_role;

select lives_ok(
  $$ update public.match set scorer_id = null, scorer_since = null
     where id = '00000000-0000-0000-0000-000000000031' $$,
  'the service role may clear the lock'
);

select * from finish();
rollback;

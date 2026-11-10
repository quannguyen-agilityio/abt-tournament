-- Entry into live scoring on A5 (spec-phase-2 §8.0, §8.1 L-A, L6): the BTC switch to final-score
-- entry, the L6 substitution guard and scorer_name. Run with `pnpm db:test` against the local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'btc.entry@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'referee.entry@example.com');

insert into public.profile (user_id, display_name, role, is_active)
values
  ('00000000-0000-0000-0000-0000000000b1', 'BTC Entry', 'btc', true),
  ('00000000-0000-0000-0000-0000000000a1', 'Referee Entry', 'referee', true);

-- 2095 keeps the default settings (live scoring on); 2097 turns live scoring off.
insert into public.season (id, year, name, status, settings)
values
  ('00000000-0000-0000-0000-000000000001', 2095, 'ABT 2095', 'group', '{}'),
  ('00000000-0000-0000-0000-000000000002', 2097, 'ABT 2097', 'group', '{"live_scoring": false}');

insert into public.team (id, season_id, name, color)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội Một', '#112233'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội Hai', '#445566'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', 'Đội Ba', '#778899'),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000002', 'Đội Bốn', '#aabbcc');

insert into public.person (id, full_name, slug, gender)
values
  ('00000000-0000-0000-0000-000000000051', 'Người Một', 'nguoi-mot-entry', 'male'),
  ('00000000-0000-0000-0000-000000000052', 'Người Hai', 'nguoi-hai-entry', 'male'),
  ('00000000-0000-0000-0000-000000000053', 'Người Ba', 'nguoi-ba-entry', 'male'),
  ('00000000-0000-0000-0000-000000000054', 'Người Bốn', 'nguoi-bon-entry', 'male');

insert into public.season_player (id, season_id, person_id, team_id, rank, skill_points)
values
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000011', 1, 10),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000011', 1, 10),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000013', 1, 10),
  ('00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000013', 1, 10);

-- V01, V02: locked, live-scored season. V03: scheduled. V04: locked, live scoring off.
insert into public.match (id, season_id, code, stage, round, home_team_id, away_team_id, status)
values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'lineup_locked'),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', 'V02', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'lineup_locked'),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000001', 'V03', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'scheduled'),
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000002', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000014', 'lineup_locked');

insert into public.match_slot (id, match_id, slot_no, slot_type, handicap_home, handicap_away)
values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000031', 1, 'open', 0, 0),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000032', 1, 'open', 0, 0),
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000034', 1, 'open', 0, 0);

set local role authenticated;

-- Who can switch ---------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.live_set_final_entry('00000000-0000-0000-0000-000000000031', true) $$,
  '42501',
  'btc only',
  'a referee cannot switch a match to final-score entry'
);
select isnt(
  public.live_claim('00000000-0000-0000-0000-000000000031'),
  null,
  'the referee claims the lock of V01'
);

-- L6: no substitution in a live-scored match -----------------------------------------------------------

select throws_ok(
  $$ insert into public.slot_substitution (match_slot_id, side, replaced_id, substitute_id)
     values ('00000000-0000-0000-0000-000000000041', 'home',
             '00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000062') $$,
  'P0001',
  'no substitution in a live-scored match',
  'a live-scored match refuses a substitution after the lock'
);

-- scorer_name -------------------------------------------------------------------------------------------

select results_eq(
  $$ select display_name from public.scorer_name where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('Referee Entry'::text) $$,
  'a referee reads the name of the scorer'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ update public.match set final_entry = true where id = '00000000-0000-0000-0000-000000000031' $$,
  '42501',
  'final_entry changes only through live_set_final_entry',
  'the BTC cannot write final_entry directly'
);
select throws_ok(
  $$ select public.live_set_final_entry('00000000-0000-0000-0000-000000000033', true) $$,
  'P0001',
  'scores closed',
  'a match whose lineups are not locked cannot be switched'
);
select throws_ok(
  $$ select public.live_set_final_entry('00000000-0000-0000-0000-000000000039', true) $$,
  'P0002',
  'match not found',
  'a match that does not exist cannot be switched'
);

-- Switch to final-score entry before any rally -------------------------------------------------------------

select lives_ok(
  $$ select public.live_set_final_entry('00000000-0000-0000-0000-000000000031', true) $$,
  'the BTC switches V01 to final-score entry before any rally'
);

reset role;
select results_eq(
  $$ select final_entry, scorer_id, scorer_since from public.match where id = '00000000-0000-0000-0000-000000000031' $$,
  $$ values (true, null::uuid, null::timestamptz) $$,
  'the switch releases the scorer lock'
);
select results_eq(
  $$ select actor_id, after ->> 'final_entry' from public.audit_log
     where entity = 'match' and entity_id = '00000000-0000-0000-0000-000000000031'
       and before ->> 'final_entry' = 'false' and after ->> 'final_entry' = 'true' $$,
  $$ values ('00000000-0000-0000-0000-0000000000b1'::uuid, 'true') $$,
  'the switch is audited'
);
select is(private.match_is_live_scored('00000000-0000-0000-0000-000000000031'), false, 'V01 is no longer live-scored');
set local role authenticated;

select lives_ok(
  $$ select public.live_set_final_entry('00000000-0000-0000-0000-000000000031', true) $$,
  'switching again changes nothing'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.live_claim('00000000-0000-0000-0000-000000000031') $$,
  'P0001',
  'scores closed',
  'a match switched to final-score entry cannot be claimed'
);
select lives_ok(
  $$ insert into public.slot_substitution (match_slot_id, side, replaced_id, substitute_id)
     values ('00000000-0000-0000-0000-000000000041', 'home',
             '00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000062') $$,
  'substitutions are allowed again in final-score entry'
);

-- Live scoring off for the season --------------------------------------------------------------------------

select is(private.match_is_live_scored('00000000-0000-0000-0000-000000000034'), false, 'live scoring off: not live-scored');
select lives_ok(
  $$ insert into public.slot_substitution (match_slot_id, side, replaced_id, substitute_id)
     values ('00000000-0000-0000-0000-000000000044', 'home',
             '00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000064') $$,
  'a season with live scoring off keeps the Phase 1 substitution rule'
);

-- Back to live scoring -----------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select lives_ok(
  $$ select public.live_set_final_entry('00000000-0000-0000-0000-000000000031', false) $$,
  'the BTC switches V01 back to live scoring'
);
select isnt(
  public.live_claim('00000000-0000-0000-0000-000000000031'),
  null,
  'V01 can be claimed again'
);

-- After a rally, the switch is closed ----------------------------------------------------------------------

select isnt(public.live_claim('00000000-0000-0000-0000-000000000032'), null, 'the BTC claims V02');
select is(
  public.live_apply('00000000-0000-0000-0000-000000000042', 1, 'setup', '{}'),
  1,
  'V02 gets its first live event'
);
select throws_ok(
  $$ select public.live_set_final_entry('00000000-0000-0000-0000-000000000032', true) $$,
  'P0001',
  'live scoring started',
  'a match with a live event cannot be switched to final-score entry'
);

-- anon --------------------------------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok(
  $$ select * from public.scorer_name $$,
  '42501',
  null,
  'anon cannot read scorer_name'
);

select * from finish();
rollback;

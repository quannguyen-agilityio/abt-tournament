-- Retirement in live scoring (spec-phase-2 §6, L8, L9): live_apply writes the retired slot, the
-- forfeits it causes and the match result. Run with `pnpm db:test` against the local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000a1', 'scorer.retire@example.com');

insert into public.profile (user_id, display_name, role, is_active)
values ('00000000-0000-0000-0000-0000000000a1', 'Scorer Retire', 'referee', true);

-- Set target 21 and relay milestones up to 100, so the test shows the settings are read.
insert into public.season (id, year, name, status, settings)
values ('00000000-0000-0000-0000-000000000001', 2092, 'ABT 2092', 'knockout',
  '{"set_target": 21, "relay_milestones": [20, 40, 60, 80, 100]}');

insert into public.team (id, season_id, name, color)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội Một', '#112233'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội Hai', '#445566');

insert into public.person (id, full_name, slug, gender)
values
  ('00000000-0000-0000-0000-000000000051', 'Người Một', 'nguoi-mot-retire', 'male'),
  ('00000000-0000-0000-0000-000000000052', 'Người Hai', 'nguoi-hai-retire', 'male'),
  ('00000000-0000-0000-0000-000000000053', 'Người Ba', 'nguoi-ba-retire', 'male'),
  ('00000000-0000-0000-0000-000000000054', 'Người Bốn', 'nguoi-bon-retire', 'male'),
  ('00000000-0000-0000-0000-000000000055', 'Người Năm', 'nguoi-nam-retire', 'male');

-- Home: h1 (…61, gets injured), h2 (…62), h3 (…63). Away: a1 (…64), a2 (…65).
insert into public.season_player (id, season_id, person_id, team_id, rank, skill_points)
values
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000011', 1, 10),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000011', 2, 10),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000011', 3, 10),
  ('00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000012', 1, 10),
  ('00000000-0000-0000-0000-000000000065', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000012', 2, 10);

-- V01: group, in progress, scored by a1. SF1: relay, in progress, scored by a1.
insert into public.match (
  id, season_id, code, stage, round, home_team_id, away_team_id, status, scorer_id, scorer_since,
  relay_handicap_home, relay_handicap_away
)
values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'in_progress',
   '00000000-0000-0000-0000-0000000000a1', now(), null, null),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', 'SF1', 'semi_final', null,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'in_progress',
   '00000000-0000-0000-0000-0000000000a1', now(), 0, 0);

-- V01 home lineups: set 1 h1+h2 (the injury), set 2 h1+h3, set 3 h2+h3, set 4 h3+h1, set 5 h2+h3.
-- Away is a1+a2 in every set. SF1: h1+h2 v a1+a2 in leg 1.
insert into public.match_slot (
  id, match_id, slot_no, slot_type, handicap_home, handicap_away, home_p1, home_p2, away_p1, away_p2
)
values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000031', 1, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000062',
   '00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000065'),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000031', 2, 'open', 3, 0,
   '00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000063',
   '00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000065'),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000031', 3, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000063',
   '00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000065'),
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000031', 4, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000061',
   '00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000065'),
  ('00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000031', 5, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000063',
   '00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000065'),
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000032', 1, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000062',
   '00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000065'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000032', 2, 'open', 0, 0, null, null, null, null),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000032', 3, 'open', 0, 0, null, null, null, null),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000032', 4, 'open', 0, 0, null, null, null, null),
  ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000032', 5, 'open', 0, 0, null, null, null, null);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

-- Group (L8) -----------------------------------------------------------------------------------------

-- Set 1: setup (1), home 3 points (2–4), away 5 points (5–9): 3–5.
select public.live_apply('00000000-0000-0000-0000-000000000041', 1, 'setup',
  '{"server": "00000000-0000-0000-0000-000000000061", "receiver": "00000000-0000-0000-0000-000000000064", "ends": {"left": "home"}}');
select public.live_apply('00000000-0000-0000-0000-000000000041', s, 'point', '{"side": "home"}') from generate_series(2, 4) s;
select public.live_apply('00000000-0000-0000-0000-000000000041', s, 'point', '{"side": "away"}') from generate_series(5, 9) s;

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 10, 'retire', '{"player": "00000000-0000-0000-0000-000000000061"}') $$,
  '22023',
  'retire needs an open timeout of that player',
  'a retirement needs a medical timeout'
);

select public.live_apply('00000000-0000-0000-0000-000000000041', 10, 'timeout_start', '{"player": "00000000-0000-0000-0000-000000000061"}');

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 11, 'retire', '{"player": "00000000-0000-0000-0000-000000000062"}') $$,
  '22023',
  'retire needs an open timeout of that player',
  'only the player in the timeout can retire'
);

select is(
  public.live_apply('00000000-0000-0000-0000-000000000041', 11, 'retire', '{"player": "00000000-0000-0000-0000-000000000061"}'),
  11,
  'the retirement is written'
);

select results_eq(
  $$ select score_home, score_away, live_status::text, retired_side::text, retired_player_id, forfeit_side::text, ended_at is not null
     from public.match_slot where id = '00000000-0000-0000-0000-000000000041' $$,
  $$ values (3::smallint, 21::smallint, 'finished', 'home', '00000000-0000-0000-0000-000000000061'::uuid, null::text, true) $$,
  'the current set: the opponent is credited set_target, the retiring side keeps its points'
);
select results_eq(
  $$ select slot_no, score_home, score_away, forfeit_side::text, live_status::text
     from public.match_slot where match_id = '00000000-0000-0000-0000-000000000031' and slot_no > 1 order by slot_no $$,
  $$ values
       (2::smallint, 0::smallint, 21::smallint, 'home', 'pending'),
       (3::smallint, null::smallint, null::smallint, null::text, 'pending'),
       (4::smallint, 0::smallint, 21::smallint, 'home', 'pending'),
       (5::smallint, null::smallint, null::smallint, null::text, 'pending') $$,
  'later sets with the injured player are forfeited target–0 (start points ignored); the others stay open'
);
select results_eq(
  $$ select status::text, winner_team_id, retired_team_id from public.match where id = '00000000-0000-0000-0000-000000000031' $$,
  $$ values ('in_progress', null::uuid, null::uuid) $$,
  'the group match goes on with the sets still to play'
);

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 12, 'point', '{"side": "away"}') $$,
  'P0001',
  'slot confirmed',
  'the retired set takes no more events'
);
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000042', 1, 'setup', '{}') $$,
  'P0001',
  'slot scored as a final score',
  'a forfeited set cannot be scored live'
);

-- The Phase 1 grid cannot overwrite a forfeit. match_score_state is private, so the expected state is
-- computed as the owner.
reset role;
create temporary table expected_state on commit drop as
select private.match_score_state('00000000-0000-0000-0000-000000000031') as state;
grant select on expected_state to authenticated;
set local role authenticated;

select throws_ok(
  $$ select public.save_slot_score('00000000-0000-0000-0000-000000000031', 2::smallint, 21::smallint, 0::smallint,
       (select state from expected_state)) $$,
  'P0001',
  'slot forfeited',
  'save_slot_score refuses a forfeited set'
);

-- Set 3 is entered as a final score (home wins); set 5 is scored live (away wins 0–21).
select lives_ok(
  $$ select public.save_slot_score('00000000-0000-0000-0000-000000000031', 3::smallint, 21::smallint, 15::smallint,
       (select state from expected_state)) $$,
  'a later set without the injured player is played as normal'
);
select public.live_apply('00000000-0000-0000-0000-000000000045', 1, 'setup',
  '{"server": "00000000-0000-0000-0000-000000000062", "receiver": "00000000-0000-0000-0000-000000000064", "ends": {"left": "home"}}');
select public.live_apply('00000000-0000-0000-0000-000000000045', s, 'point', '{"side": "away"}') from generate_series(2, 22) s;
select public.live_apply('00000000-0000-0000-0000-000000000045', 23, 'end_confirmed', '{}');

select results_eq(
  $$ select status::text, winner_team_id from public.match where id = '00000000-0000-0000-0000-000000000031' $$,
  $$ values ('completed', '00000000-0000-0000-0000-000000000012'::uuid) $$,
  'the match completes once every set has a score, the forfeits counting as sets won'
);

-- Relay (L9) -----------------------------------------------------------------------------------------

-- Leg 1: setup (1), home 2 points (2–3), away 1 point (4): 2–1. a1 is injured and retires.
select public.live_apply('00000000-0000-0000-0000-000000000051', 1, 'setup',
  '{"serving_side": "home", "server": "00000000-0000-0000-0000-000000000061", "receiver": "00000000-0000-0000-0000-000000000064", "ends": {"left": "home"}}');
select public.live_apply('00000000-0000-0000-0000-000000000051', s, 'point', '{"side": "home"}') from generate_series(2, 3) s;
select public.live_apply('00000000-0000-0000-0000-000000000051', 4, 'point', '{"side": "away"}');
select public.live_apply('00000000-0000-0000-0000-000000000051', 5, 'timeout_start', '{"player": "00000000-0000-0000-0000-000000000064"}');
select public.live_apply('00000000-0000-0000-0000-000000000051', 6, 'timeout_end', '{}');

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000051', 7, 'retire', '{"player": "00000000-0000-0000-0000-000000000064"}') $$,
  '22023',
  'retire needs an open timeout of that player',
  'a retirement after the timeout ended is refused'
);

select public.live_apply('00000000-0000-0000-0000-000000000051', 7, 'timeout_start', '{"player": "00000000-0000-0000-0000-000000000064"}');
select is(
  public.live_apply('00000000-0000-0000-0000-000000000051', 8, 'retire', '{"player": "00000000-0000-0000-0000-000000000064"}'),
  8,
  'the relay retirement is written'
);

select results_eq(
  $$ select score_home, score_away, live_status::text, retired_side::text, retired_player_id
     from public.match_slot where id = '00000000-0000-0000-0000-000000000051' $$,
  $$ values (100::smallint, 1::smallint, 'finished', 'away', '00000000-0000-0000-0000-000000000064'::uuid) $$,
  'the current leg: the opponent is credited the final milestone, the retiring team keeps its score'
);
select is(
  (select count(*)::integer from public.match_slot
   where match_id = '00000000-0000-0000-0000-000000000032' and slot_no > 1 and score_home is null and forfeit_side is null),
  4,
  'later legs stay empty'
);
select results_eq(
  $$ select status::text, winner_team_id, retired_team_id from public.match where id = '00000000-0000-0000-0000-000000000032' $$,
  $$ values ('completed', '00000000-0000-0000-0000-000000000011'::uuid, '00000000-0000-0000-0000-000000000012'::uuid) $$,
  'the retiring team loses the relay match'
);
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000052', 1, 'setup', '{}') $$,
  'P0001',
  'scores closed',
  'the next leg cannot start after a relay retirement'
);

-- The audit trail: the retire event is in the log, with its player.
select results_eq(
  $$ select kind::text, payload ->> 'player' from public.live_event
     where match_slot_id = '00000000-0000-0000-0000-000000000051' and seq = 8 $$,
  $$ values ('retire', '00000000-0000-0000-0000-000000000064') $$,
  'the retire event is stored with the player'
);

-- Retirement from a slot that is not live yet, or by the wrong player, never writes anything.
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000043', 1, 'retire', '{"player": "00000000-0000-0000-0000-000000000062"}') $$,
  'P0001',
  'scores closed',
  'a completed match takes no retirement'
);
select is(
  (select count(*)::integer from public.match_slot where retired_side is not null
   and match_id in ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032')),
  2,
  'exactly the two retired slots are marked'
);
select is(
  (select count(*)::integer from public.match_slot where forfeit_side is not null
   and match_id in ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032')),
  2,
  'exactly the two forfeited sets are marked'
);

select * from finish();
rollback;

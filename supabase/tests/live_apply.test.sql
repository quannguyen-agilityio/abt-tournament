-- live_apply and the live_event policies (spec-phase-2 §7, §9). Run with `pnpm db:test` against the
-- local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'btc.live@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'scorer.live@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'referee.live@example.com');

insert into public.profile (user_id, display_name, role, is_active)
values
  ('00000000-0000-0000-0000-0000000000b1', 'BTC Live', 'btc', true),
  ('00000000-0000-0000-0000-0000000000a1', 'Scorer Live', 'referee', true),
  ('00000000-0000-0000-0000-0000000000a2', 'Referee Live', 'referee', true);

insert into public.season (id, year, name, status)
values ('00000000-0000-0000-0000-000000000001', 2094, 'ABT 2094', 'knockout');

insert into public.team (id, season_id, name, color)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội Một', '#112233'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội Hai', '#445566');

-- V01: group, locked, scored by a1. SF1 and SF2: relay, in progress, scored by a1. SF1 starts 0–5.
insert into public.match (
  id, season_id, code, stage, round, home_team_id, away_team_id, status, scorer_id, scorer_since,
  relay_handicap_home, relay_handicap_away
)
values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'lineup_locked',
   '00000000-0000-0000-0000-0000000000a1', now(), null, null),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', 'SF1', 'semi_final', null,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'in_progress',
   '00000000-0000-0000-0000-0000000000a1', now(), 0, 5),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000001', 'SF2', 'semi_final', null,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'in_progress',
   '00000000-0000-0000-0000-0000000000a1', now(), 0, 0);

-- V01: set 1 starts 0–4; sets 2–4 entered as Phase 1 final scores (home wins 2, away 2); set 5 open.
-- SF2: legs 1–4 entered as final scores, leg 4 at 100–90.
insert into public.match_slot (id, match_id, slot_no, slot_type, handicap_home, handicap_away, score_home, score_away)
values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000031', 1, 'open', 0, 4, null, null),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000031', 2, 'open', 0, 0, 31, 20),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000031', 3, 'open', 0, 0, 20, 31),
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000031', 4, 'open', 0, 0, 31, 25),
  ('00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000031', 5, 'open', 0, 0, null, null),
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000032', 1, 'open', 0, 0, null, null),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000032', 2, 'open', 0, 0, null, null),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000032', 3, 'open', 0, 0, null, null),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000033', 1, 'open', 0, 0, 25, 20),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000033', 2, 'open', 0, 0, 50, 45),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000033', 3, 'open', 0, 0, 75, 70),
  ('00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000033', 4, 'open', 0, 0, 100, 90),
  ('00000000-0000-0000-0000-000000000065', '00000000-0000-0000-0000-000000000033', 5, 'open', 0, 0, null, null);

-- anon ---------------------------------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 1, 'point', '{"side": "home"}') $$,
  '42501',
  null,
  'anon cannot call live_apply'
);

-- A referee who is not the scorer ------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 1, 'setup', '{}') $$,
  '42501',
  'not the scorer',
  'an event from a referee who is not the scorer is rejected'
);

-- The scorer: group set 1 --------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.live_event (match_slot_id, seq, kind) values ('00000000-0000-0000-0000-000000000041', 1, 'setup') $$,
  '42501',
  null,
  'the scorer cannot insert into live_event directly'
);

select is(
  public.live_apply('00000000-0000-0000-0000-000000000041', 1, 'setup',
    '{"server": "h1", "receiver": "a1", "ends": {"left": "home"}}', '2094-01-10T01:00:00Z'),
  1,
  'the first event is seq 1'
);
select is(
  (select status::text from public.match where id = '00000000-0000-0000-0000-000000000031'),
  'in_progress',
  'the first event starts the match'
);
select results_eq(
  $$ select live_status::text, started_at is not null from public.match_slot where id = '00000000-0000-0000-0000-000000000041' $$,
  $$ values ('live', true) $$,
  'the first event puts the slot live'
);
select is(
  (select client_at from public.live_event where match_slot_id = '00000000-0000-0000-0000-000000000041' and seq = 1),
  '2094-01-10T01:00:00Z'::timestamptz,
  'client_at keeps the device time'
);

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 1, 'point', '{"side": "home"}') $$,
  '40001',
  'events changed',
  'a stale seq is rejected'
);
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 3, 'point', '{"side": "home"}') $$,
  '40001',
  'events changed',
  'a seq ahead of the log is rejected'
);
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 2, 'point', '{"side": "left"}') $$,
  '22023',
  'point needs a side',
  'a point without a valid side is rejected'
);
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 2, 'point', '[]') $$,
  '22023',
  'payload must be an object',
  'a payload that is not an object is rejected'
);
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 2, 'undo', '{"seq": 1}') $$,
  '22023',
  'undo must cancel the last point',
  'an undo with no point to cancel is rejected'
);

-- Points 2, 3, 4 (home, home, away), undo of 4, point 6 (home): 3–4 from the 0–4 start.
select public.live_apply('00000000-0000-0000-0000-000000000041', 2, 'point', '{"side": "home"}');
select public.live_apply('00000000-0000-0000-0000-000000000041', 3, 'point', '{"side": "home"}');
select public.live_apply('00000000-0000-0000-0000-000000000041', 4, 'point', '{"side": "away"}');

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 5, 'undo', '{"seq": 3}') $$,
  '22023',
  'undo must cancel the last point',
  'an undo of a point that is not the last is rejected'
);
select is(
  public.live_apply('00000000-0000-0000-0000-000000000041', 5, 'undo', '{"seq": 4}'),
  5,
  'the last point can be undone'
);
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 6, 'undo', '{"seq": 4}') $$,
  '22023',
  'undo must cancel the last point',
  'a cancelled point cannot be undone twice'
);
select public.live_apply('00000000-0000-0000-0000-000000000041', 6, 'point', '{"side": "home"}');

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 7, 'retire', '{"player": "h1"}') $$,
  '0A000',
  null,
  'a retirement is refused until the retirement flow lands'
);

select public.live_apply('00000000-0000-0000-0000-000000000041', 7, 'end_confirmed', '{}');
select results_eq(
  $$
    select score_home::integer, score_away::integer, live_status::text, ended_at is not null
    from public.match_slot where id = '00000000-0000-0000-0000-000000000041'
  $$,
  $$ values (3, 4, 'finished', true) $$,
  'end_confirmed writes the start points plus the uncancelled points'
);
select is(
  (select status::text from public.match where id = '00000000-0000-0000-0000-000000000031'),
  'in_progress',
  'the match stays in progress while a set has no score'
);

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 8, 'point', '{"side": "home"}') $$,
  'P0001',
  'slot confirmed',
  'a point after the end is confirmed is rejected'
);
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 8, 'undo', '{"seq": 6}') $$,
  'P0001',
  'slot confirmed',
  'an undo past end_confirmed is rejected'
);
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000041', 8, 'reopened', '{"reason": "sai điểm"}') $$,
  '42501',
  'only the btc can reopen',
  'reopened from a referee is rejected'
);

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000042', 1, 'setup', '{}') $$,
  'P0001',
  'slot scored as a final score',
  'a set entered as a final score cannot be scored live'
);
select throws_ok(
  $$
    select public.save_slot_score('00000000-0000-0000-0000-000000000031', 1::smallint, 31::smallint,
      20::smallint, private.match_score_state('00000000-0000-0000-0000-000000000031'))
  $$,
  'P0001',
  'slot scored live',
  'a set scored live cannot be overwritten by a Phase 1 final score'
);

-- Set 5 completes the match: home wins sets 2, 4 and 5.
select public.live_apply('00000000-0000-0000-0000-000000000045', 1, 'setup', '{}');
select public.live_apply('00000000-0000-0000-0000-000000000045', 2, 'point', '{"side": "home"}');
select public.live_apply('00000000-0000-0000-0000-000000000045', 3, 'end_confirmed', '{}');
select results_eq(
  $$ select status::text, winner_team_id from public.match where id = '00000000-0000-0000-0000-000000000031' $$,
  $$ values ('completed', '00000000-0000-0000-0000-000000000011'::uuid) $$,
  'the last end_confirmed completes the match with the winner on sets'
);
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000045', 4, 'point', '{"side": "home"}') $$,
  'P0001',
  'scores closed',
  'the scorer cannot add an event to a completed match'
);

-- anon reads the log of a completed match and cannot write it ----------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is(
  (select count(*)::integer from public.live_event where match_slot_id = '00000000-0000-0000-0000-000000000041'),
  7,
  'anon reads the log of a completed match'
);
select throws_ok(
  $$ insert into public.live_event (match_slot_id, seq, kind) values ('00000000-0000-0000-0000-000000000041', 8, 'point') $$,
  '42501',
  null,
  'anon cannot insert into live_event'
);

-- The BTC reopens set 5 ------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000045', 4, 'reopened', '{"reason": "  "}') $$,
  '22023',
  'a reason is required',
  'reopened needs a reason'
);
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000045', 4, 'point', '{"side": "home"}') $$,
  '42501',
  'not the scorer',
  'the BTC adds points only when holding the lock'
);
select is(
  public.live_apply('00000000-0000-0000-0000-000000000045', 4, 'reopened', '{"reason": "nhập nhầm"}'),
  4,
  'the BTC reopens a confirmed set'
);
select results_eq(
  $$
    select m.status::text, m.winner_team_id, s.score_home, s.live_status::text, s.ended_at, m.scorer_id
    from public.match m join public.match_slot s on s.match_id = m.id
    where s.id = '00000000-0000-0000-0000-000000000045'
  $$,
  $$ values ('in_progress', null::uuid, null::smallint, 'live', null::timestamptz, '00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'reopened clears the set score and moves the match back to in progress, keeping the lock'
);
select is(
  (
    select count(*)::integer from public.audit_log
    where entity = 'live_event' and after ->> 'kind' = 'reopened' and actor_id = '00000000-0000-0000-0000-0000000000b1'
  ),
  1,
  'the reopen is in the audit log'
);
select is(
  (select count(*)::integer from public.audit_log where entity = 'live_event' and after ->> 'kind' <> 'reopened'),
  0,
  'other events are not audited'
);

-- Relay SF1: leg 1 from 0–5 --------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000052', 1, 'setup', '{}') $$,
  'P0001',
  'previous leg not confirmed',
  'a relay leg opens once the previous leg is confirmed'
);
select public.live_apply('00000000-0000-0000-0000-000000000051', 1, 'setup', '{}');
select public.live_apply('00000000-0000-0000-0000-000000000051', 2, 'point', '{"side": "home"}');
select public.live_apply('00000000-0000-0000-0000-000000000051', 3, 'end_confirmed', '{}');
select results_eq(
  $$ select score_home::integer, score_away::integer from public.match_slot where id = '00000000-0000-0000-0000-000000000051' $$,
  $$ values (1, 5) $$,
  'leg 1 builds on the relay start'
);
select public.live_apply('00000000-0000-0000-0000-000000000052', 1, 'setup', '{}');
select public.live_apply('00000000-0000-0000-0000-000000000052', 2, 'point', '{"side": "away"}');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000051', 4, 'reopened', '{"reason": "sai"}') $$,
  'P0001',
  'the next leg has started',
  'reopening a relay leg is rejected once the next leg has a point'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select public.live_apply('00000000-0000-0000-0000-000000000052', 3, 'undo', '{"seq": 2}');
select public.live_apply('00000000-0000-0000-0000-000000000052', 4, 'point', '{"side": "home"}');
select public.live_apply('00000000-0000-0000-0000-000000000052', 5, 'end_confirmed', '{}');
select results_eq(
  $$ select score_home::integer, score_away::integer from public.match_slot where id = '00000000-0000-0000-0000-000000000052' $$,
  $$ values (2, 5) $$,
  'leg 2 builds on the cumulative score of leg 1'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000051', 4, 'reopened', '{"reason": "sai"}') $$,
  'P0001',
  'a later leg is confirmed',
  'only the last confirmed relay leg can be reopened'
);
select is(
  public.live_apply('00000000-0000-0000-0000-000000000052', 6, 'reopened', '{"reason": "sai"}'),
  6,
  'the last confirmed relay leg can be reopened while the next leg has no point'
);

-- Relay SF2: leg 5 completes the match from the leg-4 score ------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select public.live_apply('00000000-0000-0000-0000-000000000065', 1, 'setup', '{}');
select public.live_apply('00000000-0000-0000-0000-000000000065', 2, 'point', '{"side": "away"}');
select public.live_apply('00000000-0000-0000-0000-000000000065', 3, 'end_confirmed', '{}');
select results_eq(
  $$
    select s.score_home::integer, s.score_away::integer, m.status::text, m.winner_team_id
    from public.match m join public.match_slot s on s.match_id = m.id
    where s.id = '00000000-0000-0000-0000-000000000065'
  $$,
  $$ values (100, 91, 'completed', '00000000-0000-0000-0000-000000000011'::uuid) $$,
  'the last relay leg completes the match for the side ahead'
);

-- anon reads the log of an in-progress match, but not of a locked match ----------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is(
  (select count(*)::integer from public.live_event where match_slot_id = '00000000-0000-0000-0000-000000000052'),
  6,
  'anon reads the log of an in-progress match'
);

reset role;
update public.match set status = 'lineup_locked' where id = '00000000-0000-0000-0000-000000000032';
set local role anon;

select is(
  (select count(*)::integer from public.live_event where match_slot_id = '00000000-0000-0000-0000-000000000052'),
  0,
  'anon does not read the log of a match that is not in progress or completed'
);

-- A deactivated scorer -------------------------------------------------------------------------------------

reset role;
update public.match set status = 'in_progress' where id = '00000000-0000-0000-0000-000000000032';
update public.profile set is_active = false where user_id = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.live_apply('00000000-0000-0000-0000-000000000052', 7, 'point', '{"side": "home"}') $$,
  '42501',
  'staff only',
  'a deactivated scorer is rejected'
);

select * from finish();
rollback;

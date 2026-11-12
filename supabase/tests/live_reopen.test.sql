-- BTC reopen of a slot that ended by retirement (spec-phase-2 §4.5, §6): the retirement and the
-- forfeits it caused are cleared. Run with `pnpm db:test` against the local stack.
--
-- The retirements below are written directly, as live_apply leaves them after a `retire` (see
-- live_retire.test.sql).
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'btc.reopen@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'scorer.reopen@example.com');

insert into public.profile (user_id, display_name, role, is_active)
values
  ('00000000-0000-0000-0000-0000000000b1', 'BTC Reopen', 'btc', true),
  ('00000000-0000-0000-0000-0000000000a1', 'Scorer Reopen', 'referee', true);

insert into public.season (id, year, name, status)
values ('00000000-0000-0000-0000-000000000001', 2093, 'ABT 2093', 'knockout');

insert into public.team (id, season_id, name, color)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội Một', '#112233'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội Hai', '#445566');

insert into public.person (id, full_name, slug, gender)
values
  ('00000000-0000-0000-0000-000000000051', 'Người Một', 'nguoi-mot-reopen', 'male'),
  ('00000000-0000-0000-0000-000000000052', 'Người Hai', 'nguoi-hai-reopen', 'male');

-- p1 is injured; p2 is a team-mate who is not.
insert into public.season_player (id, season_id, person_id, team_id, rank, skill_points)
values
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000011', 1, 10),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000011', 1, 10);

-- V01: group, completed after p1 retired in set 1. SF1: relay, completed after the home team
-- retired in leg 2. V02: group, completed with no retirement.
insert into public.match (
  id, season_id, code, stage, round, home_team_id, away_team_id, status, winner_team_id, scorer_id,
  scorer_since, relay_handicap_home, relay_handicap_away, retired_team_id
)
values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'completed',
   '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000a1', now(), null, null, null),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', 'SF1', 'semi_final', null,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'completed',
   '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000a1', now(), 0, 0,
   '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000001', 'V02', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'completed',
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', now(), null, null, null);

-- V01 set 1: p1 retired at 18–22, stored 18–31. Set 2: forfeited 0–31 (p1 lined up). Set 3: played
-- (no p1). Set 4: forfeited, but without p1, so not caused by this retirement.
-- SF1 leg 1: 25–20. Leg 2: home retired, stored 40–125. Legs 3–5 empty.
-- V02 set 1: confirmed live at 31–20, no retirement.
insert into public.match_slot (
  id, match_id, slot_no, slot_type, handicap_home, handicap_away, home_p1, home_p2, score_home,
  score_away, live_status, retired_side, retired_player_id, forfeit_side
)
values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000031', 1, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000062', 18, 31, 'finished',
   'home', '00000000-0000-0000-0000-000000000061', null),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000031', 2, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000061', 0, 31, 'pending',
   null, null, 'home'),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000031', 3, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000062', null, 31, 25, 'pending', null, null, null),
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000031', 4, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000062', null, 0, 31, 'pending', null, null, 'home'),
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000032', 1, 'open', 0, 0,
   null, null, 25, 20, 'pending', null, null, null),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000032', 2, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000062', 40, 125, 'finished',
   'home', '00000000-0000-0000-0000-000000000061', null),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000032', 3, 'open', 0, 0,
   null, null, null, null, 'pending', null, null, null),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000033', 1, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000061', null, 31, 20, 'finished', null, null, null),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000033', 2, 'open', 0, 0,
   '00000000-0000-0000-0000-000000000061', null, 0, 31, 'pending', null, null, 'home');

insert into public.live_event (match_slot_id, seq, kind, payload, created_by)
values
  ('00000000-0000-0000-0000-000000000041', 1, 'setup', '{}', null),
  ('00000000-0000-0000-0000-000000000041', 2, 'timeout_start', '{"player": "00000000-0000-0000-0000-000000000061"}', null),
  ('00000000-0000-0000-0000-000000000041', 3, 'retire', '{"player": "00000000-0000-0000-0000-000000000061"}', null),
  ('00000000-0000-0000-0000-000000000052', 1, 'setup', '{}', null),
  ('00000000-0000-0000-0000-000000000052', 2, 'timeout_start', '{"player": "00000000-0000-0000-0000-000000000061"}', null),
  ('00000000-0000-0000-0000-000000000052', 3, 'retire', '{"player": "00000000-0000-0000-0000-000000000061"}', null),
  ('00000000-0000-0000-0000-000000000061', 1, 'setup', '{}', null),
  ('00000000-0000-0000-0000-000000000061', 2, 'end_confirmed', '{}', null);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

-- Group: reopening the retired set clears the retirement and its forfeits ---------------------------------

select is(
  public.live_apply('00000000-0000-0000-0000-000000000041', 4, 'reopened', '{"reason": "bỏ cuộc nhầm"}'),
  4,
  'the BTC reopens a set that ended by retirement'
);
select results_eq(
  $$
    select score_home, retired_side::text, retired_player_id, live_status::text
    from public.match_slot where id = '00000000-0000-0000-0000-000000000041'
  $$,
  $$ values (null::smallint, null::text, null::uuid, 'live') $$,
  'the retired set is live again, with no score and no retirement'
);
select results_eq(
  $$
    select score_home, score_away, forfeit_side::text, live_status::text
    from public.match_slot where id = '00000000-0000-0000-0000-000000000042'
  $$,
  $$ values (null::smallint, null::smallint, null::text, 'pending') $$,
  'a later set forfeited with the injured player in it is cleared, so it can be played'
);
select results_eq(
  $$ select score_home::integer, score_away::integer from public.match_slot where id = '00000000-0000-0000-0000-000000000043' $$,
  $$ values (31, 25) $$,
  'a later set played without the injured player is unchanged'
);
select results_eq(
  $$ select forfeit_side::text, score_away::integer from public.match_slot where id = '00000000-0000-0000-0000-000000000044' $$,
  $$ values ('home', 31) $$,
  'a forfeit that the retirement did not cause is unchanged'
);
select results_eq(
  $$ select status::text, winner_team_id from public.match where id = '00000000-0000-0000-0000-000000000031' $$,
  $$ values ('in_progress', null::uuid) $$,
  'the match is back in progress'
);

-- Relay: reopening the retired leg clears the team retirement --------------------------------------------

select public.live_apply('00000000-0000-0000-0000-000000000052', 4, 'reopened', '{"reason": "bỏ cuộc nhầm"}');
select results_eq(
  $$
    select m.status::text, m.retired_team_id, s.retired_side::text, s.score_home
    from public.match m join public.match_slot s on s.match_id = m.id
    where s.id = '00000000-0000-0000-0000-000000000052'
  $$,
  $$ values ('in_progress', null::uuid, null::text, null::smallint) $$,
  'reopening the retired relay leg clears the team retirement'
);

-- No retirement: only the reopened slot changes ------------------------------------------------------------

select public.live_apply('00000000-0000-0000-0000-000000000061', 3, 'reopened', '{"reason": "sai điểm"}');
select results_eq(
  $$ select forfeit_side::text, score_away::integer from public.match_slot where id = '00000000-0000-0000-0000-000000000062' $$,
  $$ values ('home', 31) $$,
  'reopening a set that did not end by retirement leaves the other sets as they are'
);
select is(
  (
    select count(*)::integer from public.audit_log
    where entity = 'live_event' and after ->> 'kind' = 'reopened' and actor_id = '00000000-0000-0000-0000-0000000000b1'
  ),
  3,
  'every reopen is in the audit log'
);

select * from finish();
rollback;

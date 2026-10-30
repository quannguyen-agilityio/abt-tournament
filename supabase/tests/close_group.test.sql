-- Close and reopen the group, seed the bracket and fill 3RD and F (spec §4.6, §4.8, §6 A6). Run with
-- `pnpm db:test` against the local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

-- Fixtures: fake names only. Teams A, B, C, D finish in that order; E is disqualified. SF1 is scheduled
-- ahead with a court time, SF2, 3RD and F do not exist yet.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'btc.test@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'referee.test@example.com');
insert into public.profile (user_id, display_name, role, must_change_password)
values
  ('00000000-0000-0000-0000-0000000000b1', 'BTC Test', 'btc', false),
  ('00000000-0000-0000-0000-0000000000a1', 'Referee Test', 'referee', false);

insert into public.season (id, year, name, status, settings)
values (
  '00000000-0000-0000-0000-000000000001', 2099, 'ABT 2099', 'group',
  '{"knockout_teams": 4, "slot_types": ["open", "low", "open", "high", "open"]}'
);

insert into public.team (id, season_id, name, color, disqualified_at)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội A', '#112233', null),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội B', '#445566', null),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Đội C', '#778899', null),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'Đội D', '#aabbcc', null),
  ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001', 'Đội E', '#ddeeff', now());

insert into public.match (id, season_id, code, stage, round, home_team_id, away_team_id, status, winner_team_id,
  status_before_annul, scheduled_at)
values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'completed',
   '00000000-0000-0000-0000-000000000011', null, null),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'V02', 'group', 1,
   '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000014', 'scheduled', null, null, null),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', 'V03', 'group', 2,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000015', 'annulled', null,
   'scheduled', null),
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'SF1', 'semi_final', null,
   null, null, 'scheduled', null, null, '2099-12-01 08:00+07');

-- The bracket seedBracket returns for the order A, B, C, D.
create temporary table bracket on commit drop as
select
  jsonb_build_array(
    jsonb_build_object('code', 'SF1', 'home_team_id', '00000000-0000-0000-0000-000000000011',
      'away_team_id', '00000000-0000-0000-0000-000000000014'),
    jsonb_build_object('code', 'SF2', 'home_team_id', '00000000-0000-0000-0000-000000000012',
      'away_team_id', '00000000-0000-0000-0000-000000000013'),
    jsonb_build_object('code', '3RD', 'home_team_id', null, 'away_team_id', null),
    jsonb_build_object('code', 'F', 'home_team_id', null, 'away_team_id', null)
  ) as value,
  array[
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000014'
  ]::uuid[] as final_order;
grant select on bracket to authenticated;

set local role authenticated;

-- Close ----------------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.close_group('00000000-0000-0000-0000-000000000001', '{}', '{"groups": []}', '[]', '{}') $$,
  '42501', null, 'a referee cannot close the group'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.close_group('00000000-0000-0000-0000-000000000001', b.final_order, '{"groups": []}', b.value,
       private.group_result_state('00000000-0000-0000-0000-000000000001')) from bracket b $$,
  '55000', 'group not finished', 'the group cannot close while a group match is open'
);

reset role;
update public.match set status = 'completed', winner_team_id = '00000000-0000-0000-0000-000000000013'
where id = '00000000-0000-0000-0000-000000000022';
set local role authenticated;

select throws_ok(
  $$ select public.close_group('00000000-0000-0000-0000-000000000001', b.final_order, '{"groups": []}', b.value,
       '{"matches": [], "disqualified": []}') from bracket b $$,
  '40001', null, 'out-of-date results are refused'
);
select throws_ok(
  $$ select public.close_group('00000000-0000-0000-0000-000000000001', b.final_order[1:3], '{"groups": []}',
       b.value, private.group_result_state('00000000-0000-0000-0000-000000000001')) from bracket b $$,
  '22023', null, 'the order must list every team that is not disqualified'
);
select throws_ok(
  $$ select public.close_group('00000000-0000-0000-0000-000000000001',
       array[b.final_order[4], b.final_order[2], b.final_order[3], b.final_order[1]], '{"groups": []}', b.value,
       private.group_result_state('00000000-0000-0000-0000-000000000001')) from bracket b $$,
  '22023', null, 'the order and the bracket must agree'
);
select throws_ok(
  $$ select public.close_group('00000000-0000-0000-0000-000000000001', b.final_order, '{"groups": []}',
       b.value - 3, private.group_result_state('00000000-0000-0000-0000-000000000001')) from bracket b $$,
  '22023', null, 'the bracket must list all four matches'
);

select lives_ok(
  $$ select public.close_group('00000000-0000-0000-0000-000000000001', b.final_order,
       '{"groups": [], "note": "Không có bốc thăm"}', b.value,
       private.group_result_state('00000000-0000-0000-0000-000000000001')) from bracket b $$,
  'the BTC closes the group'
);
select results_eq(
  $$ select final_order, manual_draws ->> 'note', closed_by from public.group_closure
     where season_id = '00000000-0000-0000-0000-000000000001' $$,
  $$ select b.final_order, 'Không có bốc thăm', '00000000-0000-0000-0000-0000000000b1'::uuid from bracket b $$,
  'the closure stores the order, the note and who closed it'
);
select is(
  (select status::text from public.season where id = '00000000-0000-0000-0000-000000000001'),
  'knockout', 'the season moves to the knock-out'
);
select results_eq(
  $$ select code, stage::text, home_team_id, away_team_id, scheduled_at is not null from public.match
     where season_id = '00000000-0000-0000-0000-000000000001' and stage <> 'group' order by code $$,
  $$ values
       ('3RD', 'third_place', null::uuid, null::uuid, false),
       ('F', 'final', null, null, false),
       ('SF1', 'semi_final', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000014', true),
       ('SF2', 'semi_final', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013', false) $$,
  'SF1 keeps its time and gets #1 v #4; SF2, 3RD and F are created'
);
select is(
  (select count(*)::int from public.match_slot s join public.match m on m.id = s.match_id
   where m.season_id = '00000000-0000-0000-0000-000000000001' and m.code = 'SF2'),
  5, 'a created bracket match gets the season slot types'
);
select throws_ok(
  $$ select public.close_group('00000000-0000-0000-0000-000000000001', b.final_order, '{"groups": []}', b.value,
       private.group_result_state('00000000-0000-0000-0000-000000000001')) from bracket b $$,
  'P0001', null, 'a closed group cannot close again'
);
select ok(
  (select count(*) > 0 from public.audit_log where entity = 'group_closure' and action = 'insert'),
  'the closure is audited'
);

-- Reopen before the bracket starts ----------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.reopen_group('00000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'a referee cannot reopen the group'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$ select public.reopen_group('00000000-0000-0000-0000-000000000001') $$,
  'the BTC reopens the group while no bracket match has started'
);
select results_eq(
  $$ select s.status::text, (select count(*)::int from public.group_closure g where g.season_id = s.id),
       (select count(*)::int from public.match m
        where m.season_id = s.id and m.stage <> 'group' and m.home_team_id is not null)
     from public.season s where s.id = '00000000-0000-0000-0000-000000000001' $$,
  $$ values ('group', 0, 0) $$,
  'reopening removes the closure, returns to the group stage and clears the bracket teams'
);

select lives_ok(
  $$ select public.close_group('00000000-0000-0000-0000-000000000001', b.final_order, '{"groups": []}', b.value,
       private.group_result_state('00000000-0000-0000-0000-000000000001')) from bracket b $$,
  'the group closes again'
);

-- 3RD and F -----------------------------------------------------------------------------------------------

reset role;
-- SF1: #4 D beats #1 A. SF2 is still to play.
update public.match set status = 'completed', winner_team_id = '00000000-0000-0000-0000-000000000014'
where season_id = '00000000-0000-0000-0000-000000000001' and code = 'SF1';
select is(
  (select count(*)::int from public.match
   where season_id = '00000000-0000-0000-0000-000000000001' and code in ('3RD', 'F') and home_team_id is not null),
  0, '3RD and F wait for both semi-finals'
);

-- SF2: #3 C beats #2 B, as a forfeit.
update public.match set status = 'forfeit', forfeit_team_id = '00000000-0000-0000-0000-000000000012',
  winner_team_id = '00000000-0000-0000-0000-000000000013'
where season_id = '00000000-0000-0000-0000-000000000001' and code = 'SF2';
select results_eq(
  $$ select code, home_team_id, away_team_id from public.match
     where season_id = '00000000-0000-0000-0000-000000000001' and code in ('3RD', 'F') order by code $$,
  $$ values
       ('3RD', '00000000-0000-0000-0000-000000000011'::uuid, '00000000-0000-0000-0000-000000000012'::uuid),
       ('F', '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000014') $$,
  'both semi-finals done: 3RD gets the losers, F the winners, the higher seed at home'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.reopen_group('00000000-0000-0000-0000-000000000001') $$,
  '55000', 'bracket started', 'the group cannot reopen once a bracket match has started'
);

select lives_ok(
  $$ select public.reopen_match(id) from public.match
     where season_id = '00000000-0000-0000-0000-000000000001' and code = 'SF1' $$,
  'the BTC reopens SF1'
);
select is(
  (select count(*)::int from public.match
   where season_id = '00000000-0000-0000-0000-000000000001' and code in ('3RD', 'F') and home_team_id is not null),
  0, 'a semi-final without a winner clears 3RD and F'
);

reset role;
update public.match set status = 'completed', winner_team_id = '00000000-0000-0000-0000-000000000011'
where season_id = '00000000-0000-0000-0000-000000000001' and code = 'SF1';
update public.match set status = 'lineup_locked'
where season_id = '00000000-0000-0000-0000-000000000001' and code = '3RD';
update public.match set status = 'in_progress', winner_team_id = null
where season_id = '00000000-0000-0000-0000-000000000001' and code = 'SF1';
select is(
  (select home_team_id from public.match where season_id = '00000000-0000-0000-0000-000000000001' and code = '3RD'),
  '00000000-0000-0000-0000-000000000012'::uuid,
  'a 3RD match that has started is not changed'
);

select * from finish();
rollback;

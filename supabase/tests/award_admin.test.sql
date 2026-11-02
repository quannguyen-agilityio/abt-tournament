-- Side awards admin (spec §6 A7): winners, deleting and reordering awards. Run with `pnpm db:test`
-- against the local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- Fixtures: fake names only. Team A has players 1 and 2, team B has player 3, player 4 has no team.
-- Season 2098 has player 5. A plays B in V01.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'btc.test@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'referee.test@example.com');
insert into public.profile (user_id, display_name, role, must_change_password)
values
  ('00000000-0000-0000-0000-0000000000b1', 'BTC Test', 'btc', false),
  ('00000000-0000-0000-0000-0000000000a1', 'Referee Test', 'referee', false);

insert into public.season (id, year, name, status)
values
  ('00000000-0000-0000-0000-000000000001', 2099, 'ABT 2099', 'group'),
  ('00000000-0000-0000-0000-000000000002', 2098, 'ABT 2098', 'finished');

insert into public.team (id, season_id, name, color)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội A', '#112233'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội B', '#445566'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Đội C', '#778899');

insert into public.person (id, full_name, slug, gender)
values
  ('00000000-0000-0000-0000-000000000041', 'Người Thử Một', 'nguoi-thu-mot', 'male'),
  ('00000000-0000-0000-0000-000000000042', 'Người Thử Hai', 'nguoi-thu-hai', 'female'),
  ('00000000-0000-0000-0000-000000000043', 'Người Thử Ba', 'nguoi-thu-ba', 'male'),
  ('00000000-0000-0000-0000-000000000044', 'Người Thử Bốn', 'nguoi-thu-bon', 'female'),
  ('00000000-0000-0000-0000-000000000045', 'Người Thử Năm', 'nguoi-thu-nam', 'male');

insert into public.season_player (id, season_id, person_id, team_id, rank, skill_points)
values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000011', 1, 10),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000011', 2, 8),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000012', 1, 10),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000044', null, 3, 5),
  ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000045', null, 3, 5);

insert into public.match (id, season_id, code, stage, round, home_team_id, away_team_id)
values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012');

insert into public.award (id, season_id, sort_order, name_vi)
values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 1, 'Giải Một'),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', 2, 'Giải Hai'),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000001', 3, 'Giải Ba');

delete from public.audit_log;

set local role authenticated;

-- add_award_winner ---------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.add_award_winner('00000000-0000-0000-0000-000000000031', 'team', '{}',
       p_team_id => '00000000-0000-0000-0000-000000000011') $$,
  '42501', null, 'a referee cannot add a winner'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.add_award_winner('00000000-0000-0000-0000-000000000039', 'team', '{}',
       p_team_id => '00000000-0000-0000-0000-000000000011') $$,
  'P0002', null, 'the award must exist'
);
select throws_ok(
  $$ select public.add_award_winner('00000000-0000-0000-0000-000000000031', 'pair',
       array['00000000-0000-0000-0000-000000000051']::uuid[]) $$,
  '22023', null, 'a pair needs two members'
);
select throws_ok(
  $$ select public.add_award_winner('00000000-0000-0000-0000-000000000031', 'pair',
       array['00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000051']::uuid[]) $$,
  '22023', null, 'a pair needs two different members'
);
select throws_ok(
  $$ select public.add_award_winner('00000000-0000-0000-0000-000000000031', 'pair',
       array['00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000053']::uuid[]) $$,
  '22023', null, 'a pair plays for one team'
);
select throws_ok(
  $$ select public.add_award_winner('00000000-0000-0000-0000-000000000031', 'player',
       array['00000000-0000-0000-0000-000000000055']::uuid[]) $$,
  '22023', null, 'a player of another season is refused'
);
select throws_ok(
  $$ select public.add_award_winner('00000000-0000-0000-0000-000000000031', 'team',
       array['00000000-0000-0000-0000-000000000051']::uuid[],
       p_team_id => '00000000-0000-0000-0000-000000000011') $$,
  '22023', null, 'a team winner has no members'
);
select throws_ok(
  $$ select public.add_award_winner('00000000-0000-0000-0000-000000000031', 'team', '{}',
       p_team_id => '00000000-0000-0000-0000-000000000013',
       p_match_id => '00000000-0000-0000-0000-000000000021') $$,
  '22023', null, 'the related match must be one the team played'
);

select lives_ok(
  $$ select public.add_award_winner('00000000-0000-0000-0000-000000000031', 'pair',
       array['00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000052']::uuid[],
       p_team_id => '00000000-0000-0000-0000-000000000013',
       p_match_id => '00000000-0000-0000-0000-000000000021',
       p_note => '  Ăn ý  ') $$,
  'the BTC adds a pair with a related match'
);
select results_eq(
  $$ select kind::text, team_id, match_id, note,
       (select count(*)::integer from public.award_winner_member m where m.award_winner_id = w.id)
     from public.award_winner w where award_id = '00000000-0000-0000-0000-000000000031' $$,
  $$ values ('pair', '00000000-0000-0000-0000-000000000011'::uuid,
       '00000000-0000-0000-0000-000000000021'::uuid, 'Ăn ý', 2) $$,
  'the pair takes its members'' team, not the one passed, and the note is trimmed'
);
select lives_ok(
  $$ select public.add_award_winner('00000000-0000-0000-0000-000000000032', 'player',
       array['00000000-0000-0000-0000-000000000054']::uuid[],
       p_match_id => '00000000-0000-0000-0000-000000000021', p_note => ' ') $$,
  'a player without a team can win, with any match of the season'
);
select lives_ok(
  $$ select public.add_award_winner('00000000-0000-0000-0000-000000000033', 'team', '{}',
       p_team_id => '00000000-0000-0000-0000-000000000012') $$,
  'the BTC adds a team winner'
);

reset role;
select is(
  (select count(*)::integer from public.audit_log where entity = 'award_winner' and action = 'insert'),
  3, 'each winner is audited'
);
set local role authenticated;

-- delete_award_winner and delete_award ---------------------------------------------------------------------

select lives_ok(
  $$ select public.delete_award_winner(
       (select id from public.award_winner where award_id = '00000000-0000-0000-0000-000000000032')) $$,
  'the BTC removes a winner'
);
select throws_ok(
  $$ select public.delete_award_winner('00000000-0000-0000-0000-000000000099') $$,
  'P0002', null, 'removing a missing winner is refused'
);
select lives_ok(
  $$ select public.delete_award('00000000-0000-0000-0000-000000000031') $$,
  'the BTC deletes an award with its winners'
);
select is(
  (select count(*)::integer from public.award_winner_member m
    join public.season_player sp on sp.id = m.season_player_id
    where sp.season_id = '00000000-0000-0000-0000-000000000001'),
  0, 'no members are left behind'
);

-- reorder_awards -------------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.reorder_awards('00000000-0000-0000-0000-000000000001',
       array['00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000031']::uuid[]) $$,
  '40001', null, 'an out-of-date list is refused'
);
select lives_ok(
  $$ select public.reorder_awards('00000000-0000-0000-0000-000000000001',
       array['00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000032']::uuid[]) $$,
  'the BTC reorders the awards'
);
select results_eq(
  $$ select id, sort_order::integer from public.award
     where season_id = '00000000-0000-0000-0000-000000000001' order by sort_order $$,
  $$ values ('00000000-0000-0000-0000-000000000033'::uuid, 1), ('00000000-0000-0000-0000-000000000032'::uuid, 2) $$,
  'the awards take the new order'
);

select * from finish();
rollback;

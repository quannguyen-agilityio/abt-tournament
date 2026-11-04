-- save_team_board (spec §6, A3). Run with `pnpm db:test` against the local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'btc.board@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'referee.board@example.com');

insert into public.profile (user_id, display_name, role)
values
  ('00000000-0000-0000-0000-0000000000b1', 'BTC Board', 'btc'),
  ('00000000-0000-0000-0000-0000000000a1', 'Referee Board', 'referee');

insert into public.season (id, year, name, status)
values
  ('00000000-0000-0000-0000-000000000001', 2096, 'ABT 2096', 'group'),
  ('00000000-0000-0000-0000-000000000002', 2095, 'ABT 2095', 'group');

insert into public.team (id, season_id, name, color)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội Một', '#112233'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội Hai', '#445566'),
  ('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000002', 'Đội Khác', '#778899');

insert into public.person (id, full_name, slug, gender)
values
  ('00000000-0000-0000-0000-000000000041', 'Board Tester A', 'board-tester-a', 'male'),
  ('00000000-0000-0000-0000-000000000042', 'Board Tester B', 'board-tester-b', 'female'),
  ('00000000-0000-0000-0000-000000000043', 'Board Tester C', 'board-tester-c', 'male'),
  ('00000000-0000-0000-0000-000000000044', 'Board Tester D', 'board-tester-d', 'female');

-- A (R1) and B (R2) in Đội Một, C (R1) in Đội Hai, D (R3) without a team, E in another season.
insert into public.season_player (id, season_id, person_id, rank, skill_points, team_id)
values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000041', 1, 50, '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000042', 2, 40, '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000043', 1, 45, '00000000-0000-0000-0000-000000000012'),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000044', 3, 20, null),
  ('00000000-0000-0000-0000-000000000059', '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000041', 1, 50, null);

select is(
  (select captain_id from public.team where id = '00000000-0000-0000-0000-000000000011'),
  '00000000-0000-0000-0000-000000000051'::uuid,
  'the default captain of Đội Một is its R1 player'
);

-- anon ---------------------------------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok(
  $$ select public.save_team_board('00000000-0000-0000-0000-000000000001', '[]', '[]') $$,
  '42501',
  null,
  'anon cannot call save_team_board'
);

-- referee ------------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$
    select public.save_team_board('00000000-0000-0000-0000-000000000001',
      '[{"season_player_id": "00000000-0000-0000-0000-000000000054",
         "team_id": "00000000-0000-0000-0000-000000000012"}]', '[]')
  $$,
  '42501',
  null,
  'a referee cannot edit the team board'
);

-- btc: rejected drafts change nothing --------------------------------------------------------------------

set local request.jwt.claims =
  '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.save_team_board('00000000-0000-0000-0000-0000000000ff', '[]', '[]') $$,
  'P0002',
  'season not found',
  'an unknown season is rejected'
);

select throws_ok(
  $$
    select public.save_team_board('00000000-0000-0000-0000-000000000001',
      '[{"season_player_id": "00000000-0000-0000-0000-000000000054",
         "team_id": "00000000-0000-0000-0000-000000000012"},
        {"season_player_id": "00000000-0000-0000-0000-000000000059",
         "team_id": "00000000-0000-0000-0000-000000000012"}]', '[]')
  $$,
  'P0002',
  'season player not in season',
  'a player of another season is rejected'
);

select throws_ok(
  $$
    select public.save_team_board('00000000-0000-0000-0000-000000000001',
      '[{"season_player_id": "00000000-0000-0000-0000-000000000054",
         "team_id": "00000000-0000-0000-0000-000000000019"}]', '[]')
  $$,
  'P0002',
  'team not in season',
  'a team of another season is rejected'
);

select throws_ok(
  $$
    select public.save_team_board('00000000-0000-0000-0000-000000000001',
      '[{"season_player_id": "00000000-0000-0000-0000-000000000054",
         "team_id": "00000000-0000-0000-0000-000000000012"},
        {"season_player_id": "00000000-0000-0000-0000-000000000054", "team_id": null}]', '[]')
  $$,
  '22023',
  'listed twice',
  'a player listed twice is rejected'
);

-- D moves into Đội Hai, but the chosen captain B is moved out of Đội Một in the same draft.
select throws_ok(
  $$
    select public.save_team_board('00000000-0000-0000-0000-000000000001',
      '[{"season_player_id": "00000000-0000-0000-0000-000000000054",
         "team_id": "00000000-0000-0000-0000-000000000012"},
        {"season_player_id": "00000000-0000-0000-0000-000000000052", "team_id": null}]',
      '[{"team_id": "00000000-0000-0000-0000-000000000011",
         "season_player_id": "00000000-0000-0000-0000-000000000052"}]')
  $$,
  '22023',
  'captain not on team',
  'a captain who is not on the team after the moves is rejected'
);

select is(
  (select array_agg(team_id order by id) from public.season_player
   where season_id = '00000000-0000-0000-0000-000000000001'),
  array[
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000012', null
  ]::uuid[],
  'a rejected draft leaves every player where they were'
);

-- btc: a valid draft -------------------------------------------------------------------------------------

-- Move A to Đội Hai, D to Đội Một, and choose D as Đội Một's captain: 2 moves + 1 captain.
select is(
  public.save_team_board('00000000-0000-0000-0000-000000000001',
    '[{"season_player_id": "00000000-0000-0000-0000-000000000051",
       "team_id": "00000000-0000-0000-0000-000000000012"},
      {"season_player_id": "00000000-0000-0000-0000-000000000054",
       "team_id": "00000000-0000-0000-0000-000000000011"},
      {"season_player_id": "00000000-0000-0000-0000-000000000053",
       "team_id": "00000000-0000-0000-0000-000000000012"}]',
    '[{"team_id": "00000000-0000-0000-0000-000000000011",
       "season_player_id": "00000000-0000-0000-0000-000000000054"}]'),
  3,
  'returns the number of changes, not counting a move to the same team'
);

select is(
  (select array_agg(team_id order by id) from public.season_player
   where season_id = '00000000-0000-0000-0000-000000000001'),
  array[
    '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000011'
  ]::uuid[],
  'the moves are applied'
);

select results_eq(
  $$ select captain_id, captain_chosen from public.team where id = '00000000-0000-0000-0000-000000000011' $$,
  $$ values ('00000000-0000-0000-0000-000000000054'::uuid, true) $$,
  'the chosen captain is kept, not the default one'
);

select results_eq(
  $$ select captain_id, captain_chosen from public.team where id = '00000000-0000-0000-0000-000000000012' $$,
  $$ values ('00000000-0000-0000-0000-000000000051'::uuid, false) $$,
  'a team without a chosen captain gets the default from its new roster'
);

-- Moving the chosen captain out hands Đội Một back to the default captain.
select is(
  public.save_team_board('00000000-0000-0000-0000-000000000001',
    '[{"season_player_id": "00000000-0000-0000-0000-000000000054", "team_id": null}]', '[]'),
  1,
  'a draft with only a move saves'
);

select results_eq(
  $$ select captain_id, captain_chosen from public.team where id = '00000000-0000-0000-0000-000000000011' $$,
  $$ values ('00000000-0000-0000-0000-000000000052'::uuid, false) $$,
  'a chosen captain moved off the team is replaced by the default one'
);

select is(
  (select count(*)::int from public.audit_log
   where entity = 'season_player' and action = 'update'
     and entity_id in (
       '00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000053',
       '00000000-0000-0000-0000-000000000054'
     )),
  3,
  'every move is in the audit log, unchanged players are not'
);

select * from finish();
rollback;

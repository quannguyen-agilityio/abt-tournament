-- Row Level Security (spec §3.2). Run with `pnpm db:test` against the local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- Every table has RLS and at least one policy ------------------------------------------------------------

select is_empty(
  $$
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  $$,
  'every table in public has RLS enabled'
);

select is_empty(
  $$
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  $$,
  'every table in public has at least one policy'
);

-- Fixtures: fake names only. Seasons and matches use ids that the seed does not use. ---------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'btc.test@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'referee.test@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'unassigned.test@example.com');

insert into public.profile (user_id, display_name, role)
values
  ('00000000-0000-0000-0000-0000000000b1', 'BTC Test', 'btc'),
  ('00000000-0000-0000-0000-0000000000a1', 'Trọng tài Test', 'referee'),
  ('00000000-0000-0000-0000-0000000000a2', 'Trọng tài Rảnh', 'referee');

insert into public.season (id, year, name, status)
values
  ('00000000-0000-0000-0000-000000000001', 2098, 'ABT 2098', 'group'),
  ('00000000-0000-0000-0000-000000000002', 2099, 'ABT 2099', 'draft');

insert into public.team (id, season_id, name, color)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội Một', '#112233'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội Hai', '#445566'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', 'Đội Nháp', '#778899');

insert into public.person (id, full_name, slug, gender)
values ('00000000-0000-0000-0000-000000000041', 'Người Thử', 'nguoi-thu-rls', 'male');

insert into public.season_player (id, season_id, person_id, team_id, rank, skill_points)
values (
  '00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000011', 3, 30
);

insert into public.season_player_private (season_player_id, member_type, fee_amount)
values ('00000000-0000-0000-0000-000000000051', 'employee', 300000);

-- One match per status that matters.
insert into public.match (
  id, season_id, code, stage, round, home_team_id, away_team_id, referee_id, status,
  forfeit_team_id
)
values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-0000000000a1', 'scheduled', null),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'V02', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012',
   null, 'lineup_locked', null),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', 'V03', 'group', 2,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012',
   null, 'completed', null),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000001', 'V04', 'group', 2,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012',
   null, 'forfeit', '00000000-0000-0000-0000-000000000012');

insert into public.match_slot (id, match_id, slot_no, slot_type, home_p1)
values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021', 1, 'open',
   '00000000-0000-0000-0000-000000000051'),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000022', 1, 'open',
   '00000000-0000-0000-0000-000000000051'),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000023', 1, 'open',
   '00000000-0000-0000-0000-000000000051');

-- anon ---------------------------------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is_empty(
  'select 1 from public.season_player_private',
  'anon cannot read season_player_private'
);
select is_empty('select 1 from public.audit_log', 'anon cannot read audit_log');
select is_empty('select 1 from public.profile', 'anon cannot read profile');
select is_empty('select 1 from public.lineup_override', 'anon cannot read lineup_override');
select is_empty(
  $$ select 1 from public.season where id = '00000000-0000-0000-0000-000000000002' $$,
  'anon cannot read a draft season'
);
select is_empty(
  $$ select 1 from public.team where id = '00000000-0000-0000-0000-000000000013' $$,
  'anon cannot read a team of a draft season'
);
select isnt_empty(
  $$ select 1 from public.season where id = '00000000-0000-0000-0000-000000000001' $$,
  'anon can read a published season'
);
select is(
  (select count(*)::int from public.match where season_id = '00000000-0000-0000-0000-000000000001'),
  4,
  'anon can read every match of a published season, including upcoming ones'
);
select is_empty(
  $$ select 1 from public.match_slot where id = '00000000-0000-0000-0000-000000000031' $$,
  'anon cannot read the lineup of a match that is not lineup_locked (A6)'
);
select isnt_empty(
  $$ select 1 from public.match_slot where id = '00000000-0000-0000-0000-000000000032' $$,
  'anon can read the lineup of a lineup_locked match'
);
select results_eq(
  $$ select display_name from public.referee_name $$,
  $$ values ('Trọng tài Test') $$,
  'anon sees the names of assigned referees only'
);
select throws_ok(
  $$
    insert into public.team (season_id, name, color)
    values ('00000000-0000-0000-0000-000000000001', 'Đội Lạ', '#000000')
  $$,
  '42501',
  null,
  'anon cannot write'
);

reset role;

-- referee ------------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is_empty(
  'select 1 from public.season_player_private',
  'referee cannot read season_player_private'
);
select is_empty('select 1 from public.audit_log', 'referee cannot read audit_log');
select results_eq(
  'select user_id from public.profile',
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'referee reads only their own profile'
);
select isnt_empty(
  $$ select 1 from public.match_slot where id = '00000000-0000-0000-0000-000000000031' $$,
  'referee can read a lineup that is not locked yet'
);
select results_eq(
  $$
    with u as (
      update public.match_slot set score_home = 31, score_away = 20
      where id = '00000000-0000-0000-0000-000000000032' returning 1
    )
    select count(*)::int from u
  $$,
  $$ values (1) $$,
  'referee can write a slot of an open match'
);
select results_eq(
  $$
    with u as (
      update public.match_slot set score_home = 0
      where id = '00000000-0000-0000-0000-000000000033' returning 1
    )
    select count(*)::int from u
  $$,
  $$ values (0) $$,
  'referee cannot write a slot of a completed match'
);
select results_eq(
  $$
    with u as (
      update public.match set forfeit_reason = 'x'
      where id in ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000024')
      returning 1
    )
    select count(*)::int from u
  $$,
  $$ values (0) $$,
  'referee cannot write a completed or forfeit match'
);
select throws_ok(
  $$
    insert into public.match_slot (match_id, slot_no, slot_type)
    values ('00000000-0000-0000-0000-000000000023', 2, 'low')
  $$,
  '42501',
  null,
  'referee cannot add a slot to a completed match'
);
select throws_ok(
  $$
    insert into public.match_attendance (match_id, team_id, season_player_id)
    values (
      '00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000051'
    )
  $$,
  '42501',
  null,
  'referee cannot add attendance to a forfeit match'
);
select throws_ok(
  $$
    update public.match
    set status = 'forfeit', forfeit_team_id = '00000000-0000-0000-0000-000000000012'
    where id = '00000000-0000-0000-0000-000000000022'
  $$,
  '42501',
  null,
  'referee cannot declare a forfeit'
);
select results_eq(
  $$
    with u as (
      update public.match set status = 'in_progress'
      where id = '00000000-0000-0000-0000-000000000022' returning 1
    )
    select count(*)::int from u
  $$,
  $$ values (1) $$,
  'referee can move an open match forward'
);
select throws_ok(
  $$
    insert into public.match (season_id, code, stage)
    values ('00000000-0000-0000-0000-000000000001', 'V05', 'group')
  $$,
  '42501',
  null,
  'referee cannot create a match'
);

reset role;

-- btc ----------------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select isnt_empty('select 1 from public.season_player_private', 'btc can read season_player_private');
select isnt_empty('select 1 from public.audit_log', 'btc can read audit_log');
select isnt_empty(
  $$ select 1 from public.season where id = '00000000-0000-0000-0000-000000000002' $$,
  'btc can read a draft season'
);
select results_eq(
  $$
    with u as (
      update public.match_slot set score_home = 31
      where id = '00000000-0000-0000-0000-000000000033' returning 1
    )
    select count(*)::int from u
  $$,
  $$ values (1) $$,
  'btc can write a completed match'
);

select * from finish();
rollback;

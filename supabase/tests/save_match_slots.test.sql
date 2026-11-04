-- save_match_slots (spec §6, A4). Run with `pnpm db:test` against the local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'btc.slots@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'referee.slots@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'retired.slots@example.com');

insert into public.profile (user_id, display_name, role, is_active)
values
  ('00000000-0000-0000-0000-0000000000b1', 'BTC Slots', 'btc', true),
  ('00000000-0000-0000-0000-0000000000a1', 'Referee Slots', 'referee', true),
  ('00000000-0000-0000-0000-0000000000a2', 'Retired Slots', 'referee', false);

insert into public.season (id, year, name, status)
values
  ('00000000-0000-0000-0000-000000000001', 2096, 'ABT 2096', 'group'),
  ('00000000-0000-0000-0000-000000000002', 2095, 'ABT 2095', 'knockout');

insert into public.court (id, season_id, name)
values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'Sân 1'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'Sân 2'),
  ('00000000-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000000002', 'Sân Khác');

insert into public.team (id, season_id, name, color)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội Một', '#112233'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội Hai', '#445566'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Đội Ba', '#778899'),
  ('00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000002', 'Đội Bốn', '#aabbcc'),
  ('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000002', 'Đội Năm', '#ddeeff');

-- V01 and V02 open, V03 completed (2096); V01 of 2095 a group match of a knockout season. V02 keeps
-- the retired referee.
insert into public.match (id, season_id, code, stage, round, home_team_id, away_team_id, status, referee_id)
values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'scheduled', null),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', 'V02', 'group', 1,
   '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013', 'scheduled',
   '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000001', 'V03', 'group', 2,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000013', 'completed', null),
  ('00000000-0000-0000-0000-000000000039', '00000000-0000-0000-0000-000000000002', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000019', 'scheduled', null);

-- anon ---------------------------------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok(
  $$ select public.save_match_slots('00000000-0000-0000-0000-000000000001', '[]') $$,
  '42501',
  null,
  'anon cannot call save_match_slots'
);

-- referee ------------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$
    select public.save_match_slots('00000000-0000-0000-0000-000000000001',
      '[{"match_id": "00000000-0000-0000-0000-000000000031", "scheduled_at": "2096-01-10T01:00:00Z",
         "court_id": null, "referee_id": null}]')
  $$,
  '42501',
  null,
  'a referee cannot edit the schedule'
);

-- BTC ----------------------------------------------------------------------------------------------------

set local request.jwt.claims =
  '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.save_match_slots('00000000-0000-0000-0000-0000000000ff', '[]') $$,
  'P0002',
  'season not found',
  'an unknown season is refused'
);

select throws_ok(
  $$
    select public.save_match_slots('00000000-0000-0000-0000-000000000001',
      '[{"match_id": "00000000-0000-0000-0000-000000000039", "scheduled_at": null,
         "court_id": null, "referee_id": null}]')
  $$,
  'P0002',
  'match not in season',
  'a match of another season is refused'
);

select throws_ok(
  $$
    select public.save_match_slots('00000000-0000-0000-0000-000000000001',
      '[{"match_id": "00000000-0000-0000-0000-000000000031", "scheduled_at": null},
        {"match_id": "00000000-0000-0000-0000-000000000031", "scheduled_at": null}]')
  $$,
  '22023',
  'listed twice',
  'a match listed twice is refused'
);

select throws_ok(
  $$
    select public.save_match_slots('00000000-0000-0000-0000-000000000001',
      '[{"match_id": "00000000-0000-0000-0000-000000000031", "scheduled_at": "2096-01-10T01:00:00Z",
         "court_id": "00000000-0000-0000-0000-000000000029", "referee_id": null}]')
  $$,
  '22023',
  'court not in season',
  'a court of another season is refused'
);

select throws_ok(
  $$
    select public.save_match_slots('00000000-0000-0000-0000-000000000001',
      '[{"match_id": "00000000-0000-0000-0000-000000000031", "scheduled_at": "2096-01-10T01:00:00Z",
         "court_id": null, "referee_id": "00000000-0000-0000-0000-0000000000a2"}]')
  $$,
  '22023',
  'referee not active',
  'an inactive referee cannot be newly assigned'
);

select throws_ok(
  $$
    select public.save_match_slots('00000000-0000-0000-0000-000000000001',
      '[{"match_id": "00000000-0000-0000-0000-000000000033", "scheduled_at": "2096-01-10T01:00:00Z",
         "court_id": null, "referee_id": null}]')
  $$,
  'P0001',
  'schedule locked',
  'a completed match cannot be moved'
);

select throws_ok(
  $$
    select public.save_match_slots('00000000-0000-0000-0000-000000000002',
      '[{"match_id": "00000000-0000-0000-0000-000000000039", "scheduled_at": "2095-01-10T01:00:00Z",
         "court_id": null, "referee_id": null}]')
  $$,
  'P0001',
  'schedule locked',
  'a group match of a season past the group stage cannot be moved'
);

-- One bad slot among good ones: nothing is written.
select throws_ok(
  $$
    select public.save_match_slots('00000000-0000-0000-0000-000000000001',
      '[{"match_id": "00000000-0000-0000-0000-000000000031", "scheduled_at": "2096-01-10T01:00:00Z",
         "court_id": "00000000-0000-0000-0000-000000000021", "referee_id": null},
        {"match_id": "00000000-0000-0000-0000-000000000033", "scheduled_at": "2096-01-10T01:00:00Z",
         "court_id": null, "referee_id": null}]')
  $$,
  'P0001',
  'schedule locked',
  'a draft with a locked match is refused as a whole'
);

select is(
  (select scheduled_at from public.match where id = '00000000-0000-0000-0000-000000000031'),
  null,
  'a refused draft leaves every match unchanged'
);

-- V02 keeps its retired referee: unchanged, so it is allowed.
select is(
  public.save_match_slots('00000000-0000-0000-0000-000000000001',
    '[{"match_id": "00000000-0000-0000-0000-000000000031", "scheduled_at": "2096-01-10T01:00:00Z",
       "court_id": "00000000-0000-0000-0000-000000000021", "referee_id": "00000000-0000-0000-0000-0000000000a1"},
      {"match_id": "00000000-0000-0000-0000-000000000032", "scheduled_at": "2096-01-10T01:00:00Z",
       "court_id": "00000000-0000-0000-0000-000000000022", "referee_id": "00000000-0000-0000-0000-0000000000a2"}]'),
  2,
  'a valid draft saves every slot'
);

select results_eq(
  $$
    select code, scheduled_at, court_id, referee_id from public.match
    where season_id = '00000000-0000-0000-0000-000000000001' and code in ('V01', 'V02') order by code
  $$,
  $$
    values
      ('V01', '2096-01-10T01:00:00Z'::timestamptz, '00000000-0000-0000-0000-000000000021'::uuid,
       '00000000-0000-0000-0000-0000000000a1'::uuid),
      ('V02', '2096-01-10T01:00:00Z'::timestamptz, '00000000-0000-0000-0000-000000000022'::uuid,
       '00000000-0000-0000-0000-0000000000a2'::uuid)
  $$,
  'the slots are applied'
);

select is(
  public.save_match_slots('00000000-0000-0000-0000-000000000001',
    '[{"match_id": "00000000-0000-0000-0000-000000000031", "scheduled_at": "2096-01-10T01:00:00Z",
       "court_id": "00000000-0000-0000-0000-000000000021", "referee_id": "00000000-0000-0000-0000-0000000000a1"},
      {"match_id": "00000000-0000-0000-0000-000000000032", "scheduled_at": null,
       "court_id": null, "referee_id": null}]'),
  1,
  'returns the number of matches changed, not counting an unchanged slot'
);

select results_eq(
  $$
    select scheduled_at, court_id, referee_id from public.match
    where id = '00000000-0000-0000-0000-000000000032'
  $$,
  $$ values (null::timestamptz, null::uuid, null::uuid) $$,
  'nulls clear the slot'
);

select is(
  (select count(*)::int from public.audit_log
   where entity = 'match' and action = 'update'
     and entity_id in ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032')),
  3,
  'every changed match is in the audit log, unchanged ones are not'
);

select * from finish();
rollback;

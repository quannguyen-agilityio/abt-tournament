-- Audit log triggers (spec §3.1). Run with `pnpm db:test` against the local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

-- Start from an empty log so the seed's own audit rows do not count (rolled back at the end).
delete from public.audit_log;

-- Fixtures: fake names only.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000a1', 'referee.test@example.com');

insert into public.season (id, year, name)
values ('00000000-0000-0000-0000-000000000001', 2099, 'ABT 2099');

insert into public.team (id, season_id, name, color)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội Một', '#112233'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội Hai', '#445566');

insert into public.match (id, season_id, code, stage, round, home_team_id, away_team_id)
values (
  '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'V01', 'group', 1,
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012'
);

insert into public.match_slot (id, match_id, slot_no, slot_type)
values ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021', 1, 'open');

select is(
  (select count(*)::int from public.audit_log where entity = 'match_slot' and action = 'insert'),
  1,
  'inserting a match_slot writes one audit row'
);

-- Write as a signed-in user.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

update public.match_slot
set score_home = 31, score_away = 20
where id = '00000000-0000-0000-0000-000000000031';

select is(
  (select count(*)::int from public.audit_log where entity = 'match_slot' and action = 'update'),
  1,
  'an update to match_slot writes one audit row'
);

select is(
  (select actor_id from public.audit_log where entity = 'match_slot' and action = 'update'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'actor_id is auth.uid()'
);

select is(
  (select entity_id from public.audit_log where entity = 'match_slot' and action = 'update'),
  '00000000-0000-0000-0000-000000000031'::uuid,
  'entity_id is the row id'
);

select ok(
  (
    select before ->> 'score_home' is null and after ->> 'score_home' = '31'
    from public.audit_log
    where entity = 'match_slot' and action = 'update'
  ),
  'before and after hold the old and new row'
);

-- An update that changes nothing (only updated_at moves) is not logged.
update public.match_slot set score_home = 31 where id = '00000000-0000-0000-0000-000000000031';

select is(
  (select count(*)::int from public.audit_log where entity = 'match_slot' and action = 'update'),
  1,
  'a no-op update writes no audit row'
);

delete from public.match_slot where id = '00000000-0000-0000-0000-000000000031';

select ok(
  (
    select actor_id = '00000000-0000-0000-0000-0000000000a1'::uuid and after is null
      and before ->> 'score_away' = '20'
    from public.audit_log
    where entity = 'match_slot' and action = 'delete'
  ),
  'a delete writes the old row'
);

-- Every table spec §3.1 lists is audited.
select bag_eq(
  $$
    select c.relname::text
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where t.tgfoid = 'public.audit_row_change()'::regprocedure
  $$,
  array[
    'match', 'match_slot', 'match_attendance', 'slot_substitution', 'lineup_override',
    'group_closure', 'award_winner', 'season_player', 'season_player_private'
  ],
  'the audit trigger is on every table in spec §3.1'
);

-- API users cannot write to the log directly.
set local role authenticated;

select throws_ok(
  $$
    insert into public.audit_log (entity, entity_id, action)
    values ('match', gen_random_uuid(), 'insert')
  $$,
  '42501',
  null,
  'authenticated cannot insert into audit_log'
);

select * from finish();
rollback;

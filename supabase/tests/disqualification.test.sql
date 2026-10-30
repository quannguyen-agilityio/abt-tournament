-- Disqualify and reinstate a team (spec §4.5, A4). Run with `pnpm db:test` against the local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- Fixtures: fake names only. Team A plays B (completed) and C (scheduled); B played C. D joins the
-- knock-out later.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'btc.test@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'referee.test@example.com');
insert into public.profile (user_id, display_name, role, must_change_password)
values
  ('00000000-0000-0000-0000-0000000000b1', 'BTC Test', 'btc', false),
  ('00000000-0000-0000-0000-0000000000a1', 'Referee Test', 'referee', false);

insert into public.season (id, year, name, status)
values ('00000000-0000-0000-0000-000000000001', 2099, 'ABT 2099', 'group');

insert into public.team (id, season_id, name, color)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Đội A', '#112233'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Đội B', '#445566'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Đội C', '#778899'),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'Đội D', '#aabbcc');

insert into public.match (id, season_id, code, stage, round, home_team_id, away_team_id, status, winner_team_id)
values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'V01', 'group', 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'completed',
   '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'V02', 'group', 2,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000013', 'scheduled', null),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', 'V03', 'group', 3,
   '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013', 'completed',
   '00000000-0000-0000-0000-000000000012');

delete from public.audit_log;

set local role authenticated;

-- Disqualify ---------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.disqualify_team('00000000-0000-0000-0000-000000000011', 'Thiếu người',
       array['00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022']::uuid[]) $$,
  '42501', null, 'a referee cannot disqualify a team'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.disqualify_team('00000000-0000-0000-0000-000000000011', '  ',
       array['00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022']::uuid[]) $$,
  '22023', null, 'a reason is required'
);
select throws_ok(
  $$ select public.disqualify_team('00000000-0000-0000-0000-000000000011', 'Thiếu người',
       array['00000000-0000-0000-0000-000000000021']::uuid[]) $$,
  '40001', null, 'an out-of-date match list is refused'
);

select lives_ok(
  $$ select public.disqualify_team('00000000-0000-0000-0000-000000000011', ' Thiếu người ',
       array['00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000021']::uuid[]) $$,
  'the BTC disqualifies a team in the group stage'
);
select results_eq(
  $$ select code, status::text, status_before_annul::text from public.match
     where season_id = '00000000-0000-0000-0000-000000000001' order by code $$,
  $$ values ('V01', 'annulled', 'completed'), ('V02', 'annulled', 'scheduled'), ('V03', 'completed', null) $$,
  'every group match of the team is annulled, played ones included; other matches stay'
);
select is(
  (select winner_team_id from public.match where code = 'V01'
     and season_id = '00000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-000000000011'::uuid,
  'an annulled match keeps its result for a reinstatement'
);
select results_eq(
  $$ select disqualified_at is not null, disqualified_reason from public.team
     where id = '00000000-0000-0000-0000-000000000011' $$,
  $$ values (true, 'Thiếu người') $$,
  'the team is marked disqualified with the trimmed reason'
);
select throws_ok(
  $$ select public.disqualify_team('00000000-0000-0000-0000-000000000011', 'Lần hai', '{}'::uuid[]) $$,
  'P0001', null, 'a disqualified team cannot be disqualified again'
);

-- C's match against A is already annulled, so only V03 is listed.
select lives_ok(
  $$ select public.disqualify_team('00000000-0000-0000-0000-000000000013', 'Bỏ giải',
       array['00000000-0000-0000-0000-000000000023']::uuid[]) $$,
  'a second team is disqualified; matches already annulled are not listed again'
);

-- Reinstate ----------------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.reinstate_team('00000000-0000-0000-0000-000000000011',
       array['00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022']::uuid[]) $$,
  '40001', null, 'a match against another disqualified team is not restored'
);
select lives_ok(
  $$ select public.reinstate_team('00000000-0000-0000-0000-000000000011',
       array['00000000-0000-0000-0000-000000000021']::uuid[]) $$,
  'the BTC reinstates a team while the group is open'
);
select results_eq(
  $$ select code, status::text, status_before_annul::text from public.match
     where season_id = '00000000-0000-0000-0000-000000000001' order by code $$,
  $$ values ('V01', 'completed', null), ('V02', 'annulled', 'scheduled'), ('V03', 'annulled', 'completed') $$,
  'reinstating restores the previous statuses, except against a team still disqualified'
);
select is(
  (select disqualified_at from public.team where id = '00000000-0000-0000-0000-000000000011'),
  null,
  'the reinstated team is no longer disqualified'
);
select throws_ok(
  $$ select public.reinstate_team('00000000-0000-0000-0000-000000000011', '{}'::uuid[]) $$,
  'P0001', null, 'a team that is not disqualified cannot be reinstated'
);

-- Audit --------------------------------------------------------------------------------------------------

reset role;
select is(
  (select count(*)::int from public.audit_log
     where entity = 'team' and entity_id = '00000000-0000-0000-0000-000000000011' and action = 'update'
       and actor_id = '00000000-0000-0000-0000-0000000000b1'),
  2,
  'disqualifying and reinstating the team are audited with the actor'
);
select is(
  (select count(*)::int from public.audit_log where entity = 'match' and action = 'update'),
  4,
  'every annulment and restoration is audited'
);

-- Knock-out ----------------------------------------------------------------------------------------------

insert into public.group_closure (season_id, final_order, closed_by)
values ('00000000-0000-0000-0000-000000000001',
        array['00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000014']::uuid[],
        '00000000-0000-0000-0000-0000000000b1');
insert into public.match (id, season_id, code, stage, home_team_id, away_team_id)
values ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000001', 'SF1', 'semi_final',
        '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000014');
insert into public.match_slot (match_id, slot_no, slot_type)
values ('00000000-0000-0000-0000-000000000024', 1, 'open');

set local role authenticated;

select throws_ok(
  $$ select public.reinstate_team('00000000-0000-0000-0000-000000000013',
       array['00000000-0000-0000-0000-000000000023']::uuid[]) $$,
  '55000', null, 'reinstating is blocked once the group is closed'
);

select lives_ok(
  $$ select public.disqualify_team('00000000-0000-0000-0000-000000000014', 'Không đến',
       array['00000000-0000-0000-0000-000000000024']::uuid[],
       '[{"slot_no": 1, "score_home": 125, "score_away": 0}]'::jsonb) $$,
  'the BTC disqualifies a team in the knock-out'
);
select results_eq(
  $$ select status::text, forfeit_team_id, winner_team_id, forfeit_reason from public.match
     where id = '00000000-0000-0000-0000-000000000024' $$,
  $$ values ('forfeit', '00000000-0000-0000-0000-000000000014'::uuid,
             '00000000-0000-0000-0000-000000000012'::uuid, 'Không đến') $$,
  'the next knock-out match becomes a forfeit and the opponent advances'
);
select throws_ok(
  $$ select public.disqualify_team('00000000-0000-0000-0000-000000000012', 'Không đến', '{}'::uuid[]) $$,
  '55000', null, 'a team with no knock-out match left cannot be disqualified'
);

select * from finish();
rollback;

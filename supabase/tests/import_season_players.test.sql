-- import_season_players (spec §6, A2). Run with `pnpm db:test` against the local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'btc.import@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'referee.import@example.com');

insert into public.profile (user_id, display_name, role)
values
  ('00000000-0000-0000-0000-0000000000b1', 'BTC Import', 'btc'),
  ('00000000-0000-0000-0000-0000000000a1', 'Referee Import', 'referee');

insert into public.season (id, year, name, status)
values ('00000000-0000-0000-0000-000000000001', 2097, 'ABT 2097', 'group');

insert into public.person (id, full_name, slug, gender)
values ('00000000-0000-0000-0000-000000000041', 'Existing Tester', 'existing-tester', 'male');

insert into public.season_player (id, season_id, person_id, rank, skill_points, status)
values (
  '00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000041', 3, 30, 'withdrawn'
);

insert into public.season_player_private (season_player_id, member_type, fee_amount, fee_paid_at)
values ('00000000-0000-0000-0000-000000000051', 'employee', 300000, '2097-01-02 03:04:05+00');

-- anon ---------------------------------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok(
  $$ select public.import_season_players('00000000-0000-0000-0000-000000000001', '[]') $$,
  '42501',
  null,
  'anon cannot call import_season_players'
);

-- referee ------------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$
    select public.import_season_players('00000000-0000-0000-0000-000000000001', '[
      {"person_id": null, "full_name": "Ref Attempt", "slug": "ref-attempt", "gender": "male",
       "rank": 2, "skill_points": 5, "member_type": "guest", "fee_amount": 1}
    ]')
  $$,
  '42501',
  null,
  'a referee cannot import players'
);

-- btc ----------------------------------------------------------------------------------------------------

set local request.jwt.claims =
  '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.import_season_players('00000000-0000-0000-0000-0000000000ff', '[]') $$,
  'P0002',
  'season not found',
  'an unknown season is rejected'
);

select is(
  public.import_season_players('00000000-0000-0000-0000-000000000001', '[
    {"person_id": null, "full_name": "Brand New Tester", "slug": "brand-new-tester", "gender": "female",
     "rank": 2, "skill_points": 40, "member_type": "intern", "fee_amount": 150000},
    {"person_id": "00000000-0000-0000-0000-000000000041", "full_name": "Ignored Name", "slug": null,
     "gender": "female", "rank": 4, "skill_points": 31, "member_type": "guest", "fee_amount": 250000}
  ]'),
  2,
  'btc applies two rows'
);

select results_eq(
  $$
    select p.full_name, p.gender::text, sp.rank::int, sp.skill_points::int, sp.status::text
    from public.season_player sp join public.person p on p.id = sp.person_id
    where sp.season_id = '00000000-0000-0000-0000-000000000001' and p.slug = 'brand-new-tester'
  $$,
  $$ values ('Brand New Tester'::text, 'female'::text, 2, 40, 'active'::text) $$,
  'a new person and season player are created'
);

select results_eq(
  $$
    select m.member_type::text, m.fee_amount
    from public.season_player_private m
    join public.season_player sp on sp.id = m.season_player_id
    join public.person p on p.id = sp.person_id
    where p.slug = 'brand-new-tester'
  $$,
  $$ values ('intern'::text, 150000) $$,
  'the private row is created for a new player'
);

select results_eq(
  $$
    select p.full_name, p.slug, p.gender::text, sp.rank::int, sp.skill_points::int, sp.status::text
    from public.season_player sp join public.person p on p.id = sp.person_id
    where sp.id = '00000000-0000-0000-0000-000000000051'
  $$,
  $$ values ('Existing Tester'::text, 'existing-tester'::text, 'female'::text, 4, 31, 'withdrawn'::text) $$,
  'an existing player is updated; name, slug and status are kept'
);

select results_eq(
  $$
    select member_type::text, fee_amount, fee_paid_at
    from public.season_player_private
    where season_player_id = '00000000-0000-0000-0000-000000000051'
  $$,
  $$ values ('guest'::text, 250000, '2097-01-02 03:04:05+00'::timestamptz) $$,
  'the private row is upserted and the paid date is kept'
);

select is(
  (select count(*)::int from public.season_player where season_id = '00000000-0000-0000-0000-000000000001'),
  2,
  'no duplicate season player is created'
);

-- Applying the same row again is idempotent.
select is(
  public.import_season_players('00000000-0000-0000-0000-000000000001', '[
    {"person_id": "00000000-0000-0000-0000-000000000041", "full_name": "x", "slug": null, "gender": "female",
     "rank": 4, "skill_points": 31, "member_type": "guest", "fee_amount": 250000}
  ]'),
  1,
  'reapplying the same row works and counts it'
);

select is(
  public.import_season_players('00000000-0000-0000-0000-000000000001', '[]'),
  0,
  'an empty import applies nothing'
);

-- A failing row rolls the whole call back.
select throws_ok(
  $$
    select public.import_season_players('00000000-0000-0000-0000-000000000001', '[
      {"person_id": null, "full_name": "Rolled Back", "slug": "rolled-back", "gender": "male",
       "rank": 1, "skill_points": 1, "member_type": "guest", "fee_amount": 1},
      {"person_id": null, "full_name": "Clash", "slug": "existing-tester", "gender": "male",
       "rank": 1, "skill_points": 1, "member_type": "guest", "fee_amount": 1}
    ]')
  $$,
  '23505',
  null,
  'a slug clash fails the import'
);

select is_empty(
  $$ select 1 from public.person where slug = 'rolled-back' $$,
  'the failed import left nothing behind'
);

select * from finish();
rollback;

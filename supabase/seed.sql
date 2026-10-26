-- Fake demo data for local development (plan §7): every name here is made up. `pnpm db:reset`
-- loads it after the migrations.
--
-- - ABT 2025: finished. 7 teams × 8 players, full round robin, group closed, relay knock-out and
--   side awards.
-- - ABT 2027: current, in the group stage. Match days are relative to the reset date: rounds 1-4
--   last week are completed; today round 5 has a completed, an in-progress and a lineup_locked
--   match, V16 has a lineup that is not locked yet (hidden from the public, A6) and the rest of
--   rounds 6-7 is still to play; the knock-out is next week.
-- - Accounts (password in README "Seed accounts"): btc@example.com (BTC) and referee@example.com
--   (referee, assigned to every match on "Sân 1").

-- Accounts --------------------------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('abt-demo', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), '', '', '', ''
from (
  values
    ('10000000-0000-0000-0000-000000000001'::uuid, 'btc@example.com'),
    ('10000000-0000-0000-0000-000000000002'::uuid, 'referee@example.com')
) as u (id, email);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');

insert into public.profile (user_id, display_name, role, must_change_password)
values
  ('10000000-0000-0000-0000-000000000001', 'BTC Demo', 'btc', false),
  ('10000000-0000-0000-0000-000000000002', 'Trọng tài Demo', 'referee', false);

-- Helpers (session-only) -------------------------------------------------------------------------------

-- "Nguyễn Văn An" -> "nguyen-van-an"
create function pg_temp.slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(
      p_text,
      'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ',
      repeat('a', 17) || repeat('e', 11) || repeat('i', 5) || repeat('o', 17) || repeat('u', 11)
        || repeat('y', 5) || 'dD'
    )),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

-- Deterministic "random" number in [0, p_range) so that every reset gives the same demo.
create function pg_temp.pick(p_key text, p_range int)
returns int
language sql
immutable
as $$
  select abs(hashtext(p_key)) % p_range;
$$;

-- Team members, strongest first (k = 1..8 has ranks 1, 2, 3, 4, 5, 6, 7, 7).
create function pg_temp.members(p_team_id uuid)
returns uuid[]
language sql
stable
as $$
  select array_agg(id order by rank, skill_points desc)
  from public.season_player
  where team_id = p_team_id;
$$;

-- Fill the lineup of both teams and their attendance. The template follows spec §4.1 with all 8
-- players present: slot 2 (low) has ranks 4 and 7, slot 4 (high) ranks 1 and 3, members 1 and 7
-- play twice and never in consecutive slots. Group sets get the §4.2 handicap.
create function pg_temp.set_lineup(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_match public.match;
  v_home uuid[];
  v_away uuid[];
  v_pairs int[][] := array[[1, 5], [4, 7], [2, 6], [1, 3], [7, 8]];
  v_skill_home int;
  v_skill_away int;
  v_cap int;
  v_h int;
begin
  select * into v_match from public.match where id = p_match_id;
  v_home := pg_temp.members(v_match.home_team_id);
  v_away := pg_temp.members(v_match.away_team_id);
  select (settings ->> 'group_handicap_cap')::int into v_cap
  from public.season where id = v_match.season_id;

  for n in 1..5 loop
    select sum(skill_points) into v_skill_home
    from public.season_player where id in (v_home[v_pairs[n][1]], v_home[v_pairs[n][2]]);
    select sum(skill_points) into v_skill_away
    from public.season_player where id in (v_away[v_pairs[n][1]], v_away[v_pairs[n][2]]);
    v_h := case when v_match.stage = 'group' then least(abs(v_skill_home - v_skill_away), v_cap)
      else 0 end;

    update public.match_slot
    set
      home_p1 = v_home[v_pairs[n][1]], home_p2 = v_home[v_pairs[n][2]],
      away_p1 = v_away[v_pairs[n][1]], away_p2 = v_away[v_pairs[n][2]],
      handicap_home = case when v_skill_home < v_skill_away then v_h else 0 end,
      handicap_away = case when v_skill_away < v_skill_home then v_h else 0 end
    where match_id = p_match_id and slot_no = n;
  end loop;

  insert into public.match_attendance (match_id, team_id, season_player_id)
  select p_match_id, v_match.home_team_id, unnest(v_home)
  union all
  select p_match_id, v_match.away_team_id, unnest(v_away);
end;
$$;

-- Score the first p_sets sets of a group match (§4.4). The winner wins 3 to 5 sets; a set loser
-- scores between its handicap and 30.
create function pg_temp.play_group(p_match_id uuid, p_home_wins boolean, p_sets int default 5)
returns void
language plpgsql
as $$
declare
  v_match public.match;
  v_key text;
  v_loser_sets int;
  v_home_wins_set boolean;
  v_slot public.match_slot;
begin
  select * into v_match from public.match where id = p_match_id;
  v_key := v_match.season_id || v_match.code;
  v_loser_sets := pg_temp.pick(v_key, 3);

  for v_slot in
    select * from public.match_slot where match_id = p_match_id and slot_no <= p_sets
  loop
    v_home_wins_set := p_home_wins
      = ((v_slot.slot_no + pg_temp.pick(v_key || 'shift', 5)) % 5 >= v_loser_sets);
    update public.match_slot
    set
      score_home = case when v_home_wins_set then 31
        else greatest(v_slot.handicap_home, 12 + pg_temp.pick(v_key || v_slot.slot_no, 19)) end,
      score_away = case when v_home_wins_set
        then greatest(v_slot.handicap_away, 12 + pg_temp.pick(v_key || v_slot.slot_no, 19))
        else 31 end
    where id = v_slot.id;
  end loop;

  if p_sets = 5 then
    update public.match
    set status = 'completed',
      winner_team_id = case when p_home_wins then home_team_id else away_team_id end
    where id = p_match_id;
  end if;
end;
$$;

-- Play a relay match (§4.3, §4.4): snapshot the start handicap, then 5 legs with cumulative scores
-- up to the milestones 25..125. The match winner takes the last leg.
create function pg_temp.play_relay(p_match_id uuid, p_home_wins boolean)
returns void
language plpgsql
as $$
declare
  v_match public.match;
  v_key text;
  v_net int;
  v_cap int;
  v_h int;
  v_home int;
  v_away int;
  v_milestone int;
  v_home_wins_leg boolean;
begin
  select * into v_match from public.match where id = p_match_id;
  v_key := v_match.season_id || v_match.code;
  select (settings ->> 'ko_handicap_cap')::int into v_cap
  from public.season where id = v_match.season_id;

  select sum(hp1.skill_points + hp2.skill_points - ap1.skill_points - ap2.skill_points)
  into v_net
  from public.match_slot s
  join public.season_player hp1 on hp1.id = s.home_p1
  join public.season_player hp2 on hp2.id = s.home_p2
  join public.season_player ap1 on ap1.id = s.away_p1
  join public.season_player ap2 on ap2.id = s.away_p2
  where s.match_id = p_match_id;
  v_h := least(abs(v_net), v_cap);
  v_home := case when v_net < 0 then v_h else 0 end;
  v_away := case when v_net > 0 then v_h else 0 end;

  update public.match
  set relay_handicap_home = v_home, relay_handicap_away = v_away
  where id = p_match_id;

  for n in 1..5 loop
    v_milestone := 25 * n;
    v_home_wins_leg := case when n = 5 then p_home_wins
      else pg_temp.pick(v_key || n, 2) = 0 end;
    if v_home_wins_leg then
      v_home := v_milestone;
      v_away := least(v_milestone - 1, v_away + 14 + pg_temp.pick(v_key || n || 'a', 10));
    else
      v_away := v_milestone;
      v_home := least(v_milestone - 1, v_home + 14 + pg_temp.pick(v_key || n || 'h', 10));
    end if;
    update public.match_slot
    set score_home = v_home, score_away = v_away
    where match_id = p_match_id and slot_no = n;
  end loop;

  update public.match
  set status = 'completed',
    winner_team_id = case when p_home_wins then home_team_id else away_team_id end
  where id = p_match_id;
end;
$$;

-- Insert a match with its 5 empty slots (slot types from the season settings).
create function pg_temp.add_match(
  p_season_id uuid, p_code text, p_stage public.match_stage, p_round int,
  p_home uuid, p_away uuid, p_at timestamptz, p_court int, p_referee uuid
)
returns uuid
language plpgsql
as $$
declare
  v_match_id uuid;
begin
  insert into public.match (
    season_id, code, stage, round, home_team_id, away_team_id, scheduled_at, court_id, referee_id
  )
  values (
    p_season_id, p_code, p_stage, p_round, p_home, p_away, p_at,
    (select id from public.court where season_id = p_season_id and sort_order = p_court),
    case when p_court = 1 then p_referee end
  )
  returning id into v_match_id;

  insert into public.match_slot (match_id, slot_no, slot_type)
  select v_match_id, t.n, t.slot_type::public.slot_type
  from public.season s,
    jsonb_array_elements_text(s.settings -> 'slot_types') with ordinality as t (slot_type, n)
  where s.id = p_season_id;

  return v_match_id;
end;
$$;

-- A season with 3 courts, 7 teams of 8 players (persons p_first.. p_first + 55) and the round-robin
-- schedule of spec §4.7 (circle method, V01..V21): rounds 1-4 on day 1, rounds 5-7 on day 2, one
-- match per court. Returns the season id.
create function pg_temp.add_season(
  p_year int, p_status public.season_status, p_current boolean, p_days date[], p_first int,
  p_team_names text[], p_colors text[]
)
returns uuid
language plpgsql
as $$
declare
  v_season_id uuid;
  v_teams uuid[] := '{}';
  v_team_id uuid;
  v_player_id uuid;
  v_k int;
  v_rank int;
  v_slots int[];
  v_home int;
  v_away int;
  v_code int := 0;
  v_day int;
  v_at timestamptz;
begin
  insert into public.season (year, name, venue, status, is_current, settings, match_days)
  values (
    p_year, 'ABT ' || p_year, 'Nhà thi đấu Demo', p_status, p_current,
    '{
      "set_target": 31,
      "sets_per_match": 5,
      "slot_types": ["open", "low", "open", "high", "open"],
      "low_rank_range": [4, 7],
      "high_rank_range": [1, 3],
      "max_rank": 7,
      "group_handicap_cap": 20,
      "ko_handicap_cap": 15,
      "relay_milestones": [25, 50, 75, 100, 125],
      "min_sets_per_player": 1,
      "max_sets_per_player": 2,
      "min_players_present": 5,
      "knockout_teams": 4,
      "fees": {"employee": 300000, "intern": 150000, "guest": 300000},
      "timezone": "Asia/Ho_Chi_Minh"
    }',
    p_days
  )
  returning id into v_season_id;

  insert into public.court (season_id, name, sort_order)
  select v_season_id, 'Sân ' || n, n from generate_series(1, 3) n;

  for t in 1..7 loop
    insert into public.team (season_id, name, color)
    values (v_season_id, p_team_names[t], p_colors[t])
    returning id into v_team_id;
    v_teams := v_teams || v_team_id;
  end loop;

  -- Person j goes to team (j mod 7) as its k-th member, so each team gets one player of each rank
  -- 1..7 plus a second rank 7. Skill points vary by team so that handicaps are not all 0.
  for j in 0..55 loop
    v_k := j / 7 + 1;
    v_rank := least(v_k, 7);
    insert into public.season_player (season_id, person_id, team_id, rank, skill_points)
    select v_season_id, p.id, v_teams[j % 7 + 1], v_rank, 44 - 4 * v_rank + (j * 3 + v_k) % 7
    from public.person p
    where p.slug = (select slug from pg_temp.seed_person where n = p_first + j)
    returning id into v_player_id;

    insert into public.season_player_private (
      season_player_id, member_type, fee_amount, fee_paid_at
    )
    values (
      v_player_id,
      case when j % 10 < 7 then 'employee' when j % 10 < 9 then 'intern' else 'guest' end::
        public.member_type,
      case when j % 10 between 7 and 8 then 150000 else 300000 end,
      case when p_status = 'finished' or j % 5 <> 0 then p_days[1] - 7 end
    );
  end loop;

  update public.team t
  set captain_id = (pg_temp.members(t.id))[1]
  where t.season_id = v_season_id;

  -- Circle method: position 0 is the bye, positions 1..7 rotate by one each round.
  for r in 0..6 loop
    for i in 1..3 loop
      v_home := (i - 1 + r) % 7 + 1;
      v_away := (7 - i - 1 + r) % 7 + 1;
      if r % 2 = 1 then
        select v_away, v_home into v_home, v_away;
      end if;
      v_code := v_code + 1;
      v_day := case when r < 4 then 1 else 2 end;
      v_at := (p_days[v_day] + time '08:00' + (r % 4) * interval '90 minutes')
        at time zone 'Asia/Ho_Chi_Minh';
      perform pg_temp.add_match(
        v_season_id, 'V' || lpad(v_code::text, 2, '0'), 'group', r + 1,
        v_teams[v_home], v_teams[v_away], v_at, i, '10000000-0000-0000-0000-000000000002'
      );
    end loop;
  end loop;

  return v_season_id;
end;
$$;

-- People ----------------------------------------------------------------------------------------------
-- 70 made-up names; ABT 2025 uses persons 1..56 and ABT 2027 persons 15..70, so 42 play both.

create temporary table seed_person (n int primary key, full_name text, slug text);

insert into pg_temp.seed_person (n, full_name, slug)
select n, name, pg_temp.slugify(name) || case when count(*) over w > 1
  then '-' || row_number() over w else '' end
from (
  select
    n,
    (array['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi',
      'Đỗ', 'Hồ', 'Ngô'])[n % 14 + 1]
    || ' ' ||
    case when n % 3 = 0
      then (array['Thị', 'Ngọc', 'Thu', 'Bảo', 'Kim', 'Thanh'])[n % 6 + 1]
        || ' ' || (array['Anh', 'Châu', 'Diệp', 'Giang', 'Hà', 'Hạnh', 'Hương', 'Lan', 'Linh',
          'Mai', 'My', 'Ngân', 'Nhung', 'Oanh', 'Phương', 'Thảo', 'Trang', 'Uyên', 'Vy',
          'Yến'])[(n * 7) % 20 + 1]
      else (array['Văn', 'Thành', 'Quốc', 'Công', 'Hữu', 'Gia'])[n % 6 + 1]
        || ' ' || (array['An', 'Bảo', 'Cường', 'Dũng', 'Đức', 'Hải', 'Hùng', 'Khoa', 'Long',
          'Minh', 'Nam', 'Phúc', 'Quang', 'Sơn', 'Tâm', 'Thắng', 'Trí', 'Tuấn', 'Việt',
          'Vinh'])[(n * 7) % 20 + 1]
    end as name
  from generate_series(1, 70) n
) names
window w as (partition by pg_temp.slugify(name) order by n);

insert into public.person (full_name, slug, gender)
select full_name, slug, case when n % 3 = 0 then 'female' else 'male' end::public.gender
from pg_temp.seed_person
order by n;

-- ABT 2025: finished ----------------------------------------------------------------------------------

do $$
declare
  v_season_id uuid;
  v_order uuid[];
  v_match public.match;
  v_sf1 uuid;
  v_sf2 uuid;
  v_award_id uuid;
  v_winner_id uuid;
begin
  v_season_id := pg_temp.add_season(
    2025, 'finished', false, array['2025-11-08', '2025-11-15', '2025-11-22']::date[], 1,
    array['Đại Bàng', 'Hải Âu', 'Sơn Ca', 'Chim Ưng', 'Phượng Hoàng', 'Thiên Nga', 'Diều Hâu'],
    array['#d32f2f', '#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#0097a7', '#5d4037']
  );

  -- Strength follows team order (Đại Bàng strongest), so the wins are 6, 5, ..., 0: no ties.
  select array_agg(id order by name_order) into v_order
  from (
    select id, array_position(
      array['Đại Bàng', 'Hải Âu', 'Sơn Ca', 'Chim Ưng', 'Phượng Hoàng', 'Thiên Nga', 'Diều Hâu'],
      name
    ) as name_order
    from public.team where season_id = v_season_id
  ) t;

  for v_match in select * from public.match where season_id = v_season_id order by code loop
    perform pg_temp.set_lineup(v_match.id);
    perform pg_temp.play_group(
      v_match.id,
      array_position(v_order, v_match.home_team_id) < array_position(v_order, v_match.away_team_id)
    );
  end loop;

  insert into public.group_closure (season_id, final_order, closed_by, closed_at)
  values (
    v_season_id, v_order, '10000000-0000-0000-0000-000000000001',
    timestamp '2025-11-15 18:00' at time zone 'Asia/Ho_Chi_Minh'
  );

  -- Knock-out (spec §4.8), higher seed at home: SF1 = 1 v 4, SF2 = 2 v 3 (3 wins), 3RD = 2 v 4,
  -- F = 1 v 3.
  v_sf1 := pg_temp.add_match(
    v_season_id, 'SF1', 'semi_final', null, v_order[1], v_order[4],
    timestamp '2025-11-22 08:00' at time zone 'Asia/Ho_Chi_Minh', 1,
    '10000000-0000-0000-0000-000000000002'
  );
  v_sf2 := pg_temp.add_match(
    v_season_id, 'SF2', 'semi_final', null, v_order[2], v_order[3],
    timestamp '2025-11-22 08:00' at time zone 'Asia/Ho_Chi_Minh', 2,
    '10000000-0000-0000-0000-000000000002'
  );
  perform pg_temp.set_lineup(v_sf1);
  perform pg_temp.play_relay(v_sf1, true);
  perform pg_temp.set_lineup(v_sf2);
  perform pg_temp.play_relay(v_sf2, false);

  v_sf1 := pg_temp.add_match(
    v_season_id, '3RD', 'third_place', null, v_order[2], v_order[4],
    timestamp '2025-11-22 10:00' at time zone 'Asia/Ho_Chi_Minh', 1,
    '10000000-0000-0000-0000-000000000002'
  );
  v_sf2 := pg_temp.add_match(
    v_season_id, 'F', 'final', null, v_order[1], v_order[3],
    timestamp '2025-11-22 10:00' at time zone 'Asia/Ho_Chi_Minh', 2,
    '10000000-0000-0000-0000-000000000002'
  );
  perform pg_temp.set_lineup(v_sf1);
  perform pg_temp.play_relay(v_sf1, true);
  perform pg_temp.set_lineup(v_sf2);
  perform pg_temp.play_relay(v_sf2, true);

  -- Side awards: one per winner kind.
  insert into public.award (
    season_id, sort_order, name_vi, name_en, criteria_vi, criteria_en, sponsor, value_vnd
  )
  values (
    v_season_id, 1, 'Vận động viên xuất sắc', 'Most valuable player',
    'Do BTC bình chọn', 'Chosen by the BTC', 'Công ty Demo', 1000000
  )
  returning id into v_award_id;
  insert into public.award_winner (award_id, kind, team_id)
  values (v_award_id, 'player', v_order[1])
  returning id into v_winner_id;
  insert into public.award_winner_member (award_winner_id, season_player_id)
  values (v_winner_id, (pg_temp.members(v_order[1]))[1]);

  insert into public.award (season_id, sort_order, name_vi, name_en, criteria_vi, criteria_en)
  values (
    v_season_id, 2, 'Cặp đôi ăn ý', 'Best pair',
    'Cặp thắng nhiều set nhất', 'The pair that won the most sets'
  )
  returning id into v_award_id;
  insert into public.award_winner (award_id, kind, team_id)
  values (v_award_id, 'pair', v_order[3])
  returning id into v_winner_id;
  insert into public.award_winner_member (award_winner_id, season_player_id)
  select v_winner_id, unnest((pg_temp.members(v_order[3]))[1:2]);

  insert into public.award (season_id, sort_order, name_vi, name_en, criteria_vi, criteria_en)
  values (
    v_season_id, 3, 'Đội tinh thần thể thao', 'Fair play team',
    'Do các đội bình chọn', 'Voted by the teams'
  )
  returning id into v_award_id;
  insert into public.award_winner (award_id, kind, team_id)
  values (v_award_id, 'team', v_order[6]);
end;
$$;

-- ABT 2027: current, group stage ----------------------------------------------------------------------

do $$
declare
  v_season_id uuid;
  v_strength uuid[];
  v_match public.match;
  v_home_wins boolean;
begin
  v_season_id := pg_temp.add_season(
    2027, 'group', true,
    array[current_date - 7, current_date, current_date + 7], 15,
    array['Sấm Sét', 'Bão Táp', 'Lốc Xoáy', 'Sóng Thần', 'Cầu Vồng', 'Mặt Trời', 'Ánh Trăng'],
    array['#c2185b', '#303f9f', '#00796b', '#afb42b', '#e64a19', '#455a64', '#8e24aa']
  );

  -- Strongest first; a different order from the team list so the standings are not alphabetical.
  select array_agg(id order by (array_position(
    array['Sấm Sét', 'Bão Táp', 'Lốc Xoáy', 'Sóng Thần', 'Cầu Vồng', 'Mặt Trời', 'Ánh Trăng'],
    name
  ) * 3) % 7) into v_strength
  from public.team where season_id = v_season_id;

  for v_match in select * from public.match where season_id = v_season_id order by code loop
    v_home_wins := array_position(v_strength, v_match.home_team_id)
      < array_position(v_strength, v_match.away_team_id);
    if v_match.round <= 4 then
      -- Last week: rounds 1-4 completed.
      perform pg_temp.set_lineup(v_match.id);
      perform pg_temp.play_group(v_match.id, v_home_wins);
    elsif v_match.round = 5 then
      -- Today, round 5: completed on Sân 1, in progress (2 sets) on Sân 2, locked on Sân 3.
      perform pg_temp.set_lineup(v_match.id);
      case v_match.code
        when 'V13' then perform pg_temp.play_group(v_match.id, v_home_wins);
        when 'V14' then
          perform pg_temp.play_group(v_match.id, v_home_wins, 2);
          update public.match set status = 'in_progress' where id = v_match.id;
        else
          update public.match set status = 'lineup_locked' where id = v_match.id;
      end case;
    elsif v_match.code = 'V16' then
      -- Lineup entered but not locked: visible to staff only (A6).
      perform pg_temp.set_lineup(v_match.id);
    end if;
  end loop;

  -- Next week: bracket slots, decided when the group closes.
  perform pg_temp.add_match(
    v_season_id, code, stage, null, null, null,
    (current_date + 7 + starts) at time zone 'Asia/Ho_Chi_Minh', court,
    '10000000-0000-0000-0000-000000000002'
  )
  from (
    values
      ('SF1', 'semi_final'::public.match_stage, time '08:00', 1),
      ('SF2', 'semi_final', time '08:00', 2),
      ('3RD', 'third_place', time '10:00', 1),
      ('F', 'final', time '10:00', 2)
  ) as ko (code, stage, starts, court);

  insert into public.award (season_id, sort_order, name_vi, name_en, criteria_vi, criteria_en)
  values (
    v_season_id, 1, 'Vận động viên xuất sắc', 'Most valuable player',
    'Do BTC bình chọn', 'Chosen by the BTC'
  );
end;
$$;

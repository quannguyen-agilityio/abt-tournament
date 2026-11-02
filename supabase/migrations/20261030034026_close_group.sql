-- Close and reopen the group stage, and fill the bracket (spec §4.6, §4.8, §6 A6). The app computes the
-- standings, the manual draw order and the seeded bracket (src/domain/standings.ts, bracket.ts) on the
-- results it read; close_group checks those results are still current, then writes the closure, the
-- season status and the bracket in one transaction. Every write goes through the audit_log triggers on
-- group_closure and match.

-- private.match_started -----------------------------------------------------------------------------------

-- A match has started once it is past `scheduled`, or has attendance, slot players, slot scores, a
-- lineup override or an award that points at it: the same test generate_group_schedule uses.
create function private.match_started(p_match_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.match m where m.id = p_match_id and m.status <> 'scheduled')
    or exists (select 1 from public.match_attendance a where a.match_id = p_match_id)
    or exists (
      select 1 from public.match_slot s
      where s.match_id = p_match_id
        and num_nonnulls(s.home_p1, s.home_p2, s.away_p1, s.away_p2, s.score_home, s.score_away) > 0
    )
    or exists (select 1 from public.lineup_override o where o.match_id = p_match_id)
    or exists (select 1 from public.award_winner w where w.match_id = p_match_id);
$$;

revoke execute on function private.match_started(uuid) from public, anon;
grant execute on function private.match_started(uuid) to authenticated;

-- private.group_result_state ------------------------------------------------------------------------------

-- What the standings were computed from: every group match with its status, winner and slot scores (in
-- slot order), ordered by id, and the disqualified teams, ordered by id. src/lib/close-group.ts builds
-- the same value from the rows the app read.
create function private.group_result_state(p_season_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'matches', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'status', m.status,
          'winner_team_id', m.winner_team_id,
          'scores', coalesce((
            select jsonb_agg(jsonb_build_array(s.score_home, s.score_away) order by s.slot_no)
            from public.match_slot s
            where s.match_id = m.id
          ), '[]'::jsonb)
        )
        order by m.id
      )
      from public.match m
      where m.season_id = p_season_id and m.stage = 'group'
    ), '[]'::jsonb),
    'disqualified', coalesce((
      select jsonb_agg(t.id order by t.id)
      from public.team t
      where t.season_id = p_season_id and t.disqualified_at is not null
    ), '[]'::jsonb)
  );
$$;

revoke execute on function private.group_result_state(uuid) from public, anon;
grant execute on function private.group_result_state(uuid) to authenticated;

-- close_group ---------------------------------------------------------------------------------------------

-- BTC only. Security invoker: RLS lets the BTC write every table involved.
--
-- p_final_order: every team that is not disqualified, first place first (computeStandings with the
-- manual draw applied).
-- p_manual_draws: { groups: [[team ids in drawn order], ...], note } for the teams still level after
-- step 5 (spec §4.6 step 6); { groups: [] } when there were none.
-- p_bracket: [{ code, home_team_id, away_team_id }] from seedBracket: SF1 and SF2 seeded from the top
-- `knockout_teams` of p_final_order, 3RD and F empty. A bracket match that already exists (scheduled
-- ahead with a date, court and referee) gets its teams; a missing one is created with the season's
-- slot types.
-- p_expected: the private.group_result_state the standings were computed from.
-- Raises 42501 for anyone else, P0002 'season not found', P0001 'not in group stage' unless the season
-- is `group` and not closed yet, 55000 'group not finished' while a group match is neither completed,
-- forfeited nor annulled, 55000 'bracket started' when a bracket match has started, 40001 'results
-- changed' when p_expected is out of date, and 22023 when the order or the bracket does not fit.
create function public.close_group(
  p_season_id uuid,
  p_final_order uuid[],
  p_manual_draws jsonb,
  p_bracket jsonb,
  p_expected jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_season public.season;
  v_knockout integer;
  v_active uuid[];
  v_entry record;
  v_match_id uuid;
begin
  if not private.is_btc() then
    raise exception 'only the BTC can close the group' using errcode = '42501';
  end if;

  select * into v_season from public.season where id = p_season_id for update;
  if not found then
    raise exception 'season not found' using errcode = 'P0002';
  end if;
  if v_season.status <> 'group' or private.group_is_closed(p_season_id) then
    raise exception 'not in group stage' using errcode = 'P0001';
  end if;

  -- Lock the season's matches so that no result lands between the check and the closure.
  perform 1 from public.match where season_id = p_season_id for update;

  if exists (
    select 1 from public.match
    where season_id = p_season_id and stage = 'group' and status not in ('completed', 'forfeit', 'annulled')
  ) then
    raise exception 'group not finished' using errcode = '55000';
  end if;
  if private.group_result_state(p_season_id) <> p_expected then
    raise exception 'results changed' using errcode = '40001';
  end if;

  select coalesce(array_agg(id order by id), '{}') into v_active
  from public.team
  where season_id = p_season_id and disqualified_at is null;
  if coalesce(cardinality(p_final_order), 0) <> cardinality(v_active)
    or array(select unnest(p_final_order) order by 1) <> v_active then
    raise exception 'the order must list every team once' using errcode = '22023';
  end if;
  if jsonb_typeof(p_manual_draws) <> 'object' or jsonb_typeof(p_manual_draws -> 'groups') <> 'array' then
    raise exception 'invalid manual draws' using errcode = '22023';
  end if;

  v_knockout := coalesce((v_season.settings ->> 'knockout_teams')::integer, 4);
  if cardinality(p_final_order) < v_knockout then
    raise exception 'not enough teams for the bracket' using errcode = '22023';
  end if;
  if jsonb_typeof(p_bracket) <> 'array'
    or (select array_agg(x.code order by x.code collate "C") from jsonb_to_recordset(p_bracket) as x (code text))
      is distinct from array['3RD', 'F', 'SF1', 'SF2'] then
    raise exception 'the bracket must list SF1, SF2, 3RD and F' using errcode = '22023';
  end if;
  -- SF1 = #1 v #4, SF2 = #2 v #3, the higher seed at home (settings allow only 4 knock-out teams).
  if exists (
    select 1
    from jsonb_to_recordset(p_bracket) as x (code text, home_team_id uuid, away_team_id uuid)
    where (x.home_team_id, x.away_team_id) is distinct from (
      case x.code when 'SF1' then p_final_order[1] when 'SF2' then p_final_order[2] end,
      case x.code when 'SF1' then p_final_order[4] when 'SF2' then p_final_order[3] end
    )
  ) then
    raise exception 'the bracket does not follow the order' using errcode = '22023';
  end if;

  for v_entry in
    select x.code, x.home_team_id, x.away_team_id
    from jsonb_to_recordset(p_bracket) as x (code text, home_team_id uuid, away_team_id uuid)
  loop
    select id into v_match_id from public.match where season_id = p_season_id and code = v_entry.code;
    if v_match_id is null then
      insert into public.match (season_id, code, stage, home_team_id, away_team_id)
      values (
        p_season_id,
        v_entry.code,
        (case v_entry.code when 'F' then 'final' when '3RD' then 'third_place' else 'semi_final' end)::public.match_stage,
        v_entry.home_team_id,
        v_entry.away_team_id
      )
      returning id into v_match_id;
      insert into public.match_slot (match_id, slot_no, slot_type)
      select v_match_id, t.n, t.slot_type::public.slot_type
      from jsonb_array_elements_text(coalesce(v_season.settings -> 'slot_types', '[]'::jsonb))
        with ordinality as t (slot_type, n);
    elsif private.match_started(v_match_id) then
      raise exception 'bracket started' using errcode = '55000';
    else
      update public.match
      set home_team_id = v_entry.home_team_id, away_team_id = v_entry.away_team_id
      where id = v_match_id;
    end if;
  end loop;

  insert into public.group_closure (season_id, final_order, manual_draws)
  values (p_season_id, p_final_order, p_manual_draws);

  update public.season set status = 'knockout' where id = p_season_id;
end;
$$;

revoke execute on function public.close_group(uuid, uuid[], jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.close_group(uuid, uuid[], jsonb, jsonb, jsonb) to authenticated;

-- reopen_group --------------------------------------------------------------------------------------------

-- BTC only, while no bracket match has started (spec §6 A6). Removes the closure, moves the season back
-- to `group` and clears the bracket teams; the bracket matches stay with their date, court and referee.
-- Raises 42501 for anyone else, P0002 'season not found', P0001 'group not closed' unless the season is
-- `knockout` with a closure, and 55000 'bracket started' once a bracket match has started.
create function public.reopen_group(p_season_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.season_status;
begin
  if not private.is_btc() then
    raise exception 'only the BTC can reopen the group' using errcode = '42501';
  end if;

  select status into v_status from public.season where id = p_season_id for update;
  if not found then
    raise exception 'season not found' using errcode = 'P0002';
  end if;
  if v_status <> 'knockout' or not private.group_is_closed(p_season_id) then
    raise exception 'group not closed' using errcode = 'P0001';
  end if;

  perform 1 from public.match where season_id = p_season_id and stage <> 'group' for update;
  if exists (
    select 1 from public.match
    where season_id = p_season_id and stage <> 'group' and private.match_started(id)
  ) then
    raise exception 'bracket started' using errcode = '55000';
  end if;

  update public.match
  set home_team_id = null, away_team_id = null, winner_team_id = null
  where season_id = p_season_id and stage <> 'group';

  delete from public.group_closure where season_id = p_season_id;

  update public.season set status = 'group' where id = p_season_id;
end;
$$;

revoke execute on function public.reopen_group(uuid) from public, anon;
grant execute on function public.reopen_group(uuid) to authenticated;

-- 3RD and F from the semi-finals --------------------------------------------------------------------------

-- Once both semi-finals have a winner (completed or forfeited), 3RD gets the losers and F the winners,
-- the higher group seed at home (spec §4.8, advanceBracket in src/domain/bracket.ts). When a semi-final
-- loses its winner again (reopened), both are cleared. 3RD and F are only touched while they have not
-- started.
--
-- Security definer: a referee completes a semi-final, and RLS would not let them write the other
-- bracket matches.
create function private.advance_bracket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid[];
  v_sf1 public.match;
  v_sf2 public.match;
  v_w1 uuid;
  v_w2 uuid;
  v_l1 uuid;
  v_l2 uuid;
  v_home uuid;
  v_away uuid;
  v_code text;
begin
  select final_order into v_order from public.group_closure where season_id = new.season_id;
  select * into v_sf1 from public.match where season_id = new.season_id and code = 'SF1';
  select * into v_sf2 from public.match where season_id = new.season_id and code = 'SF2';

  if v_sf1.winner_team_id is not null and v_sf2.winner_team_id is not null then
    v_w1 := v_sf1.winner_team_id;
    v_w2 := v_sf2.winner_team_id;
    v_l1 := case when v_w1 = v_sf1.home_team_id then v_sf1.away_team_id else v_sf1.home_team_id end;
    v_l2 := case when v_w2 = v_sf2.home_team_id then v_sf2.away_team_id else v_sf2.home_team_id end;
  end if;

  foreach v_code in array array['3RD', 'F'] loop
    if v_w1 is null then
      v_home := null;
      v_away := null;
    else
      -- The higher seed (earlier in the final order) is home.
      if array_position(v_order, case v_code when 'F' then v_w2 else v_l2 end)
        < array_position(v_order, case v_code when 'F' then v_w1 else v_l1 end) then
        v_home := case v_code when 'F' then v_w2 else v_l2 end;
        v_away := case v_code when 'F' then v_w1 else v_l1 end;
      else
        v_home := case v_code when 'F' then v_w1 else v_l1 end;
        v_away := case v_code when 'F' then v_w2 else v_l2 end;
      end if;
    end if;

    update public.match m
    set home_team_id = v_home, away_team_id = v_away
    where m.season_id = new.season_id
      and m.code = v_code
      and (m.home_team_id, m.away_team_id) is distinct from (v_home, v_away)
      and not private.match_started(m.id);
  end loop;

  return null;
end;
$$;

revoke execute on function private.advance_bracket() from public, anon, authenticated;

create trigger match_advance_bracket
  after update of status, winner_team_id on public.match
  for each row
  when (new.stage = 'semi_final' and new.winner_team_id is distinct from old.winner_team_id)
  execute function private.advance_bracket();

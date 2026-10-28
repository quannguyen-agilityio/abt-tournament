-- Group schedule (spec §4.7, §6 A4): the round-robin is generated in the app and written here in one
-- transaction. Regenerating replaces every group match, so it is refused once any of them has a
-- lineup or a score.

-- generate_group_schedule ----------------------------------------------------------------------------

-- Security invoker, so RLS still applies and only the BTC can actually write.
--
-- p_matches: [{ code, round, home_team_id, away_team_id }] from generateRoundRobin. Teams must belong
-- to the season.
-- p_slot_types: one slot type per set, copied from the season settings into the new match slots.
-- Returns the number of matches created. Raises P0001 'schedule locked' when a group match has
-- started: it is past `scheduled`, or has attendance, slot players, slot scores, a lineup override or
-- an award that points at it. Date, time, court and referee of the old matches are not kept.
create function public.generate_group_schedule(p_season_id uuid, p_matches jsonb, p_slot_types public.slot_type[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.season where id = p_season_id) then
    raise exception 'season not found' using errcode = 'P0002';
  end if;
  if coalesce(cardinality(p_slot_types), 0) not between 1 and 5 then
    raise exception 'invalid slot types' using errcode = '22023';
  end if;

  -- Lock the group matches so that a lineup saved meanwhile waits for this to finish.
  perform 1 from public.match where season_id = p_season_id and stage = 'group' for update;

  if exists (
    select 1
    from public.match m
    where m.season_id = p_season_id
      and m.stage = 'group'
      and (
        m.status <> 'scheduled'
        or exists (select 1 from public.match_attendance a where a.match_id = m.id)
        or exists (
          select 1 from public.match_slot s
          where s.match_id = m.id
            and num_nonnulls(s.home_p1, s.home_p2, s.away_p1, s.away_p2, s.score_home, s.score_away) > 0
        )
        or exists (select 1 from public.lineup_override o where o.match_id = m.id)
        or exists (select 1 from public.award_winner w where w.match_id = m.id)
      )
  ) then
    raise exception 'schedule locked' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_matches) as x (home_team_id uuid, away_team_id uuid)
    where not exists (select 1 from public.team t where t.id = x.home_team_id and t.season_id = p_season_id)
      or not exists (select 1 from public.team t where t.id = x.away_team_id and t.season_id = p_season_id)
  ) then
    raise exception 'team not in season' using errcode = '22023';
  end if;

  delete from public.match_slot s
  using public.match m
  where s.match_id = m.id and m.season_id = p_season_id and m.stage = 'group';
  delete from public.match where season_id = p_season_id and stage = 'group';

  with inserted as (
    insert into public.match (season_id, code, stage, round, home_team_id, away_team_id)
    select p_season_id, x.code, 'group', x.round, x.home_team_id, x.away_team_id
    from jsonb_to_recordset(p_matches) as x (code text, round smallint, home_team_id uuid, away_team_id uuid)
    returning id
  )
  insert into public.match_slot (match_id, slot_no, slot_type)
  select i.id, t.slot_no, t.slot_type
  from inserted i
  cross join unnest(p_slot_types) with ordinality as t (slot_type, slot_no);

  select count(*) into v_count from public.match where season_id = p_season_id and stage = 'group';
  return v_count;
end;
$$;

revoke execute on function public.generate_group_schedule(uuid, jsonb, public.slot_type[]) from public, anon;
grant execute on function public.generate_group_schedule(uuid, jsonb, public.slot_type[]) to authenticated;

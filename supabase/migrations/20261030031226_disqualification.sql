-- Disqualify and reinstate a team (spec §4.5, A4, §6 A5 side actions). The app works out which matches
-- change (src/domain/forfeit.ts: disqualifyTeam, reinstateTeam) and lists them in the confirmation
-- dialog; these functions check that list is still current, then write it in one transaction. Every
-- write goes through the audit_log triggers on match, match_slot and, from here on, team.

-- team audit ------------------------------------------------------------------------------------------

-- Disqualifying and reinstating set and clear team.disqualified_at, so team joins the audited tables.
create trigger team_audit after insert or update or delete on public.team
  for each row execute function public.audit_row_change();

-- private.group_is_closed -----------------------------------------------------------------------------

-- The group stage of a season is closed once its group_closure row exists (spec §6 A6).
create function private.group_is_closed(p_season_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.group_closure where season_id = p_season_id);
$$;

revoke execute on function private.group_is_closed(uuid) from public, anon;
grant execute on function private.group_is_closed(uuid) to authenticated;

-- disqualify_team -------------------------------------------------------------------------------------

-- BTC only. Security invoker: RLS lets the BTC write every table involved.
--
-- p_reason: required, shown on the public match pages of the annulled matches.
-- p_match_ids: the matches the confirmation dialog listed.
--   Group stage (group not closed): every group match of the team that is not annulled yet. Each is set
--   to `annulled`, played ones included (A4), and keeps its status in status_before_annul. Results,
--   lineups and the winner stay stored, so Reinstate restores the match as it was.
--   Knock-out (group closed): the team's next unfinished knock-out match, which becomes a forfeit
--   through forfeit_match with p_forfeit_slots ([{ slot_no, score_home, score_away }], 125–0 to the
--   opponent). Group results stay as they are.
-- Raises 42501 for anyone else, P0002 'team not found', P0001 'team already disqualified', 22023 when
-- the reason is empty, 55000 when the group is closed and the team has no knock-out match left, and
-- 40001 when p_match_ids is not the list above (the page is out of date).
create function public.disqualify_team(
  p_team_id uuid,
  p_reason text,
  p_match_ids uuid[],
  p_forfeit_slots jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_team public.team;
  v_expected uuid[];
begin
  if not private.is_btc() then
    raise exception 'only the BTC can disqualify a team' using errcode = '42501';
  end if;

  select * into v_team from public.team where id = p_team_id for update;
  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;
  if v_team.disqualified_at is not null then
    raise exception 'team already disqualified' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  if not private.group_is_closed(v_team.season_id) then
    -- Lock the team's matches so the list cannot change before the update.
    select coalesce(array_agg(id order by id), '{}') into v_expected
    from (
      select id
      from public.match
      where season_id = v_team.season_id
        and stage = 'group'
        and status <> 'annulled'
        and p_team_id in (home_team_id, away_team_id)
      for update
    ) m;
    if v_expected <> coalesce(array(select unnest(p_match_ids) order by 1), '{}') then
      raise exception 'the matches changed' using errcode = '40001';
    end if;

    update public.match
    set status_before_annul = status,
        status = 'annulled'
    where id = any (v_expected);
  else
    select coalesce(array_agg(id), '{}') into v_expected
    from (
      select id
      from public.match
      where season_id = v_team.season_id
        and stage <> 'group'
        and status in ('scheduled', 'lineup_locked', 'in_progress')
        and p_team_id in (home_team_id, away_team_id)
      order by case stage when 'semi_final' then 1 else 2 end
      limit 1
      for update
    ) m;
    if cardinality(v_expected) = 0 then
      raise exception 'no knock-out match left' using errcode = '55000';
    end if;
    if v_expected <> coalesce(p_match_ids, '{}') then
      raise exception 'the matches changed' using errcode = '40001';
    end if;

    perform public.forfeit_match(v_expected[1], p_team_id, p_reason, p_forfeit_slots);
  end if;

  update public.team
  set disqualified_at = now(),
      disqualified_reason = trim(p_reason)
  where id = p_team_id;
end;
$$;

revoke execute on function public.disqualify_team(uuid, text, uuid[], jsonb) from public, anon;
grant execute on function public.disqualify_team(uuid, text, uuid[], jsonb) to authenticated;

-- reinstate_team --------------------------------------------------------------------------------------

-- BTC only, while the group is not closed. Security invoker, like disqualify_team.
--
-- p_match_ids: the matches the confirmation dialog listed: the team's annulled group matches whose
-- opponent is not disqualified too. Each goes back to status_before_annul; a match against another
-- disqualified team stays annulled until that team is reinstated as well.
-- Raises 42501 for anyone else, P0002 'team not found', P0001 'team not disqualified', 55000 once the
-- group is closed (a knock-out forfeit is final) and 40001 when p_match_ids is not the list above.
create function public.reinstate_team(p_team_id uuid, p_match_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_team public.team;
  v_expected uuid[];
begin
  if not private.is_btc() then
    raise exception 'only the BTC can reinstate a team' using errcode = '42501';
  end if;

  select * into v_team from public.team where id = p_team_id for update;
  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;
  if v_team.disqualified_at is null then
    raise exception 'team not disqualified' using errcode = 'P0001';
  end if;
  if private.group_is_closed(v_team.season_id) then
    raise exception 'group closed' using errcode = '55000';
  end if;

  select coalesce(array_agg(id order by id), '{}') into v_expected
  from (
    select m.id
    from public.match m
    left join public.team o
      on o.id = case when m.home_team_id = p_team_id then m.away_team_id else m.home_team_id end
    where m.season_id = v_team.season_id
      and m.stage = 'group'
      and m.status = 'annulled'
      and p_team_id in (m.home_team_id, m.away_team_id)
      and o.disqualified_at is null
    for update of m
  ) x;
  if v_expected <> coalesce(array(select unnest(p_match_ids) order by 1), '{}') then
    raise exception 'the matches changed' using errcode = '40001';
  end if;

  update public.match
  set status = status_before_annul,
      status_before_annul = null
  where id = any (v_expected);

  update public.team
  set disqualified_at = null,
      disqualified_reason = null
  where id = p_team_id;
end;
$$;

revoke execute on function public.reinstate_team(uuid, uuid[]) from public, anon;
grant execute on function public.reinstate_team(uuid, uuid[]) to authenticated;

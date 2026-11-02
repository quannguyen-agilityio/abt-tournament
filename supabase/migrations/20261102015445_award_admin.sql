-- Side awards admin (spec §6 A7, plan D3): the BTC adds and removes award winners, deletes awards and
-- reorders them. Each of these writes several rows (a winner and its members, or an award with its
-- winners), so it runs in one function call. The award row itself is inserted and updated directly,
-- under the "btc can do everything" policy. Winner writes go through the audit_log trigger on
-- award_winner.

-- add_award_winner --------------------------------------------------------------------------------------

-- BTC only. Security invoker: RLS lets the BTC write every award table.
--
-- p_kind `player` takes 1 member and `pair` 2 distinct members, all season players of the award's
-- season on the same team (or all without a team); the winner's team is that team, and p_team_id is
-- ignored. `team` takes no members and p_team_id, a team of the season. p_match_id is optional: a match
-- of the season that the winner's team played, when it has one.
-- Raises 42501 for anyone else, P0002 'award not found', and 22023 when the members, the team or the
-- match do not fit.
create function public.add_award_winner(
  p_award_id uuid,
  p_kind public.award_winner_kind,
  p_members uuid[],
  p_team_id uuid default null,
  p_match_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_members uuid[] := coalesce(p_members, '{}');
  v_count integer := 0;
  v_team_id uuid;
  v_teams uuid[];
  v_winner_id uuid;
begin
  if not private.is_btc() then
    raise exception 'only the BTC can add award winners' using errcode = '42501';
  end if;

  select season_id into v_season_id from public.award where id = p_award_id;
  if not found then
    raise exception 'award not found' using errcode = 'P0002';
  end if;

  if p_kind = 'player' then
    v_count := 1;
  elsif p_kind = 'pair' then
    v_count := 2;
  end if;
  if cardinality(v_members) <> v_count
    or cardinality(v_members) <> (select count(distinct m) from unnest(v_members) m)
  then
    raise exception 'wrong number of members' using errcode = '22023';
  end if;

  if p_kind = 'team' then
    if not exists (select 1 from public.team where id = p_team_id and season_id = v_season_id) then
      raise exception 'team not in season' using errcode = '22023';
    end if;
    v_team_id := p_team_id;
  else
    if (select count(*) from public.season_player sp where sp.id = any (v_members) and sp.season_id = v_season_id)
      <> cardinality(v_members)
    then
      raise exception 'member not in season' using errcode = '22023';
    end if;
    -- array_agg keeps a null team, so two players without a team still count as one "team".
    select array_agg(distinct sp.team_id) into v_teams from public.season_player sp where sp.id = any (v_members);
    if cardinality(v_teams) <> 1 then
      raise exception 'members on different teams' using errcode = '22023';
    end if;
    v_team_id := v_teams[1];
  end if;

  if p_match_id is not null and not exists (
    select 1 from public.match m
    where m.id = p_match_id
      and m.season_id = v_season_id
      and (v_team_id is null or v_team_id in (m.home_team_id, m.away_team_id))
  ) then
    raise exception 'match does not fit' using errcode = '22023';
  end if;

  insert into public.award_winner (award_id, kind, team_id, match_id, note)
  values (p_award_id, p_kind, v_team_id, p_match_id, nullif(btrim(p_note), ''))
  returning id into v_winner_id;

  insert into public.award_winner_member (award_winner_id, season_player_id)
  select v_winner_id, m from unnest(v_members) m;

  return v_winner_id;
end;
$$;

revoke execute on function public.add_award_winner(uuid, public.award_winner_kind, uuid[], uuid, uuid, text)
  from public, anon;
grant execute on function public.add_award_winner(uuid, public.award_winner_kind, uuid[], uuid, uuid, text)
  to authenticated;

-- delete_award_winner -----------------------------------------------------------------------------------

-- BTC only. Removes a winner with its members. Raises 42501 for anyone else and P0002 'winner not found'.
create function public.delete_award_winner(p_winner_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_btc() then
    raise exception 'only the BTC can remove award winners' using errcode = '42501';
  end if;

  delete from public.award_winner_member where award_winner_id = p_winner_id;
  delete from public.award_winner where id = p_winner_id;
  if not found then
    raise exception 'winner not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.delete_award_winner(uuid) from public, anon;
grant execute on function public.delete_award_winner(uuid) to authenticated;

-- delete_award ------------------------------------------------------------------------------------------

-- BTC only. Removes an award with its winners and their members. Raises 42501 for anyone else and
-- P0002 'award not found'.
create function public.delete_award(p_award_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_btc() then
    raise exception 'only the BTC can delete awards' using errcode = '42501';
  end if;

  delete from public.award_winner_member m
    using public.award_winner w
    where w.id = m.award_winner_id and w.award_id = p_award_id;
  delete from public.award_winner where award_id = p_award_id;
  delete from public.award where id = p_award_id;
  if not found then
    raise exception 'award not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.delete_award(uuid) from public, anon;
grant execute on function public.delete_award(uuid) to authenticated;

-- reorder_awards ----------------------------------------------------------------------------------------

-- BTC only. p_award_ids: every award of the season, in the new order; each gets sort_order 1, 2, ….
-- Raises 42501 for anyone else and 40001 'awards changed' when the list is not exactly the season's
-- awards (one was added or deleted since the page was read).
create function public.reorder_awards(p_season_id uuid, p_award_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_btc() then
    raise exception 'only the BTC can reorder awards' using errcode = '42501';
  end if;

  perform 1 from public.award where season_id = p_season_id for update;
  if cardinality(coalesce(p_award_ids, '{}')) <> (select count(distinct i) from unnest(p_award_ids) i)
    or array(select id from public.award where season_id = p_season_id order by id)
      <> array(select i from unnest(p_award_ids) i order by i)
  then
    raise exception 'awards changed' using errcode = '40001';
  end if;

  update public.award a
    set sort_order = o.n
    from unnest(p_award_ids) with ordinality as o (id, n)
    where a.id = o.id and a.sort_order <> o.n;
end;
$$;

revoke execute on function public.reorder_awards(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_awards(uuid, uuid[]) to authenticated;

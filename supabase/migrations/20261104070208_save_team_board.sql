-- Team board (spec §6 A3): the BTC rearranges players and captains as a draft on the page and saves
-- it at once. This applies the whole draft in one transaction: either every change lands or none.
-- Security invoker, so RLS still applies. Both tables are audited (season_player, team).
--
-- p_moves: [{ season_player_id, team_id }]. A null team_id takes the player out of every team.
-- p_captains: [{ team_id, season_player_id }], chosen captains, checked against the rosters after the
-- moves. Captains the draft does not choose follow private.sync_team_captains through the
-- season_player trigger, as for any other move.
--
-- BTC only. Raises 42501 for anyone else, P0002 'season not found', 'season player not in season' or
-- 'team not in season', and 22023 for a player or team listed twice, or a captain who is not an
-- active member of the team. Returns the number of changes applied.
create function public.save_team_board(p_season_id uuid, p_moves jsonb, p_captains jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_move_players uuid[];
  v_move_teams uuid[];
  v_captain_teams uuid[];
  v_captain_players uuid[];
  v_moves integer;
  v_captains integer;
begin
  if not private.is_btc() then
    raise exception 'only the BTC can edit the team board' using errcode = '42501';
  end if;
  if not exists (select 1 from public.season where id = p_season_id) then
    raise exception 'season not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(x.season_player_id), '{}'), coalesce(array_agg(x.team_id), '{}')
  into v_move_players, v_move_teams
  from jsonb_to_recordset(coalesce(p_moves, '[]')) as x (season_player_id uuid, team_id uuid);
  select coalesce(array_agg(x.team_id), '{}'), coalesce(array_agg(x.season_player_id), '{}')
  into v_captain_teams, v_captain_players
  from jsonb_to_recordset(coalesce(p_captains, '[]')) as x (team_id uuid, season_player_id uuid);

  if cardinality(v_move_players) <> (select count(distinct id) from unnest(v_move_players) as id)
    or cardinality(v_captain_teams) <> (select count(distinct id) from unnest(v_captain_teams) as id) then
    raise exception 'listed twice' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_move_players) as m (id)
    where not exists (select 1 from public.season_player sp where sp.id = m.id and sp.season_id = p_season_id)
  ) then
    raise exception 'season player not in season' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from unnest(v_move_teams || v_captain_teams) as x (id)
    where x.id is not null
      and not exists (select 1 from public.team t where t.id = x.id and t.season_id = p_season_id)
  ) then
    raise exception 'team not in season' using errcode = 'P0002';
  end if;

  -- One statement, so the captain trigger runs once, on the final rosters.
  update public.season_player sp
  set team_id = m.team_id
  from unnest(v_move_players, v_move_teams) as m (season_player_id, team_id)
  where sp.id = m.season_player_id and sp.team_id is distinct from m.team_id;
  get diagnostics v_moves = row_count;

  if exists (
    select 1 from unnest(v_captain_teams, v_captain_players) as c (team_id, season_player_id)
    where not exists (
      select 1 from public.season_player sp
      where sp.id = c.season_player_id and sp.team_id = c.team_id and sp.status = 'active'
    )
  ) then
    raise exception 'captain not on team' using errcode = '22023';
  end if;

  update public.team t
  set captain_id = c.season_player_id, captain_chosen = true
  from unnest(v_captain_teams, v_captain_players) as c (team_id, season_player_id)
  where t.id = c.team_id and (t.captain_id is distinct from c.season_player_id or not t.captain_chosen);
  get diagnostics v_captains = row_count;

  return v_moves + v_captains;
end;
$$;

revoke execute on function public.save_team_board(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_team_board(uuid, jsonb, jsonb) to authenticated;

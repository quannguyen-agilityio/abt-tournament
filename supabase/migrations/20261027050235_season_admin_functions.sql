-- Season admin functions (spec §6, A1): switch the current season and clone a season.
-- Both are security invoker, so RLS still applies and only the BTC can actually write.

-- Makes a season the current one. A draft is hidden from the public, so it cannot be the target of
-- the root redirect. The old flag is cleared first, in the same transaction, so there is always
-- exactly one current season (season_single_current_idx).
create function public.set_current_season(p_season_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.season_status;
begin
  select status into v_status from public.season where id = p_season_id;
  if not found then
    raise exception 'season not found' using errcode = 'P0002';
  end if;
  if v_status = 'draft' then
    raise exception 'a draft season cannot be current' using errcode = 'P0001';
  end if;

  update public.season set is_current = false where is_current and id <> p_season_id;
  update public.season set is_current = true where id = p_season_id;
end;
$$;

-- Creates a draft season from an existing one: same settings, courts and active players (with their
-- private fee data, unpaid). Teams, matches and match days are not copied. Returns the new season id.
create function public.clone_season(p_source_id uuid, p_year integer, p_name text, p_venue text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new_id uuid;
  v_old_player record;
  v_new_player_id uuid;
begin
  insert into public.season (year, name, venue, status, is_current, settings, match_days)
  select p_year, p_name, p_venue, 'draft', false, settings, '{}'
  from public.season
  where id = p_source_id
  returning id into v_new_id;
  if v_new_id is null then
    raise exception 'season not found' using errcode = 'P0002';
  end if;

  insert into public.court (season_id, name, sort_order)
  select v_new_id, name, sort_order from public.court where season_id = p_source_id;

  for v_old_player in
    select id, person_id, rank, skill_points
    from public.season_player
    where season_id = p_source_id and status = 'active'
  loop
    insert into public.season_player (season_id, person_id, team_id, rank, skill_points, status)
    values (v_new_id, v_old_player.person_id, null, v_old_player.rank, v_old_player.skill_points, 'active')
    returning id into v_new_player_id;

    insert into public.season_player_private (season_player_id, member_type, fee_amount, fee_paid_at, note)
    select v_new_player_id, member_type, fee_amount, null, ''
    from public.season_player_private
    where season_player_id = v_old_player.id;
  end loop;

  return v_new_id;
end;
$$;

revoke execute on function public.set_current_season(uuid) from public, anon;
revoke execute on function public.clone_season(uuid, integer, text, text) from public, anon;
grant execute on function public.set_current_season(uuid) to authenticated;
grant execute on function public.clone_season(uuid, integer, text, text) to authenticated;

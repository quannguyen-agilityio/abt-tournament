-- Teams (spec §6 A3, plan D7, D19): the captain defaults to the team's Rank 1 player, and the draw
-- CSV is applied in one transaction.

-- captain_chosen ---------------------------------------------------------------------------------------

-- False: the captain follows the default (the active member with the lowest rank number, then the
-- most skill points, then the name) and moves along as the roster changes. True: the BTC picked the
-- captain, who is kept for as long as they are an active member of the team.
alter table public.team add column captain_chosen boolean not null default false;

-- Re-applies the default captain to the given teams. Security invoker: only the BTC (or the service
-- role) writes season players, and so only they reach this.
create function private.sync_team_captains(p_team_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  with wanted as (
    select
      t.id,
      (
        select sp.id
        from public.season_player sp
        join public.person p on p.id = sp.person_id
        where sp.team_id = t.id and sp.status = 'active'
        order by sp.rank, sp.skill_points desc, p.full_name, sp.id
        limit 1
      ) as captain_id
    from public.team t
    where t.id = any (p_team_ids)
      and (
        not t.captain_chosen
        or not exists (
          select 1 from public.season_player c
          where c.id = t.captain_id and c.team_id = t.id and c.status = 'active'
        )
      )
  )
  update public.team t
  set captain_id = wanted.captain_id, captain_chosen = false
  from wanted
  where t.id = wanted.id and (t.captain_id is distinct from wanted.captain_id or t.captain_chosen);
$$;

-- Statement-level, so a bulk update (the draw import) picks the captain from the final rosters.
create function private.season_player_sync_captains()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.sync_team_captains(array(select distinct team_id from new_rows where team_id is not null));
  else
    perform private.sync_team_captains(array(
      select team_id from new_rows where team_id is not null
      union
      select team_id from old_rows where team_id is not null
    ));
  end if;
  return null;
end;
$$;

create trigger season_player_sync_captains_insert
  after insert on public.season_player
  referencing new table as new_rows
  for each statement execute function private.season_player_sync_captains();

create trigger season_player_sync_captains_update
  after update on public.season_player
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.season_player_sync_captains();

-- Teams that already have players but no captain get the default one.
select private.sync_team_captains(array(select id from public.team where captain_id is null));

-- import_team_draw -------------------------------------------------------------------------------------

-- Draw CSV import (spec §6 A3): apply a reviewed plan in one transaction. Security invoker, so RLS
-- still applies and only the BTC can actually write.
--
-- p_new_teams: [{ name, color }], the teams the file names that do not exist yet.
-- p_assignments: [{ season_player_id, team_id, team_name }]. A null team_id means the new team of
-- that name. Season players of other seasons are ignored. Captains follow from the trigger above.
-- Returns the number of players assigned.
create function public.import_team_draw(p_season_id uuid, p_new_teams jsonb, p_assignments jsonb)
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

  -- One statement, so the captain trigger runs once, on the final rosters.
  with inserted as (
    insert into public.team (season_id, name, color)
    select p_season_id, x.name, x.color
    from jsonb_to_recordset(p_new_teams) as x (name text, color text)
    returning id, name
  )
  update public.season_player sp
  set team_id = coalesce(a.team_id, (select i.id from inserted i where i.name = a.team_name))
  from jsonb_to_recordset(p_assignments) as a (season_player_id uuid, team_id uuid, team_name text)
  where sp.id = a.season_player_id
    and sp.season_id = p_season_id
    and (a.team_id is null and exists (select 1 from inserted i where i.name = a.team_name)
      or exists (select 1 from public.team t where t.id = a.team_id and t.season_id = p_season_id));
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke execute on function public.import_team_draw(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.import_team_draw(uuid, jsonb, jsonb) to authenticated;

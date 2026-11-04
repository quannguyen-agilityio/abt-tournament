-- Schedule (spec §6 A4): the BTC sets date, time, court and referee of the matches as a draft on the
-- page and saves it at once. This applies the whole draft in one transaction: either every slot lands
-- or none. Security invoker, so RLS still applies. The match table is audited.
--
-- p_slots: [{ match_id, scheduled_at, court_id, referee_id }], the full slot of each changed match.
-- Nulls clear the field.
--
-- BTC only. Raises 42501 for anyone else, P0002 'season not found' or 'match not in season', 22023
-- for a match listed twice, a court of another season or a newly chosen referee without an active
-- account, and P0001 'schedule locked' when a listed match has started or ended (past
-- `lineup_locked`), or is a group match of a season past the group stage. Returns the number of
-- matches changed.
create function public.save_match_slots(p_season_id uuid, p_slots jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_season_status public.season_status;
  v_ids uuid[];
  v_starts timestamptz[];
  v_courts uuid[];
  v_referees uuid[];
  v_count integer;
begin
  if not private.is_btc() then
    raise exception 'only the BTC can edit the schedule' using errcode = '42501';
  end if;
  select status into v_season_status from public.season where id = p_season_id;
  if not found then
    raise exception 'season not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(x.match_id), '{}'), coalesce(array_agg(x.scheduled_at), '{}'),
    coalesce(array_agg(x.court_id), '{}'), coalesce(array_agg(x.referee_id), '{}')
  into v_ids, v_starts, v_courts, v_referees
  from jsonb_to_recordset(coalesce(p_slots, '[]'))
    as x (match_id uuid, scheduled_at timestamptz, court_id uuid, referee_id uuid);
  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) as id) then
    raise exception 'listed twice' using errcode = '22023';
  end if;

  -- Lock the matches so that a lineup lock or a score saved meanwhile waits for this to finish.
  perform 1 from public.match where id = any (v_ids) for update;

  if exists (
    select 1 from unnest(v_ids) as i (match_id)
    where not exists (select 1 from public.match m where m.id = i.match_id and m.season_id = p_season_id)
  ) then
    raise exception 'match not in season' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.match m
    where m.id = any (v_ids)
      and (
        m.status not in ('scheduled', 'lineup_locked')
        or (m.stage = 'group' and v_season_status in ('knockout', 'finished'))
      )
  ) then
    raise exception 'schedule locked' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(v_courts) as i (court_id)
    where i.court_id is not null
      and not exists (select 1 from public.court c where c.id = i.court_id and c.season_id = p_season_id)
  ) then
    raise exception 'court not in season' using errcode = '22023';
  end if;
  -- A referee who has since been deactivated may stay on a match, but cannot be newly assigned.
  if exists (
    select 1 from unnest(v_ids, v_referees) as i (match_id, referee_id)
    join public.match m on m.id = i.match_id
    where i.referee_id is not null
      and i.referee_id is distinct from m.referee_id
      and not exists (select 1 from public.profile p where p.user_id = i.referee_id and p.is_active)
  ) then
    raise exception 'referee not active' using errcode = '22023';
  end if;

  update public.match m
  set scheduled_at = i.scheduled_at, court_id = i.court_id, referee_id = i.referee_id
  from unnest(v_ids, v_starts, v_courts, v_referees) as i (match_id, scheduled_at, court_id, referee_id)
  where m.id = i.match_id
    and (m.scheduled_at, m.court_id, m.referee_id) is distinct from (i.scheduled_at, i.court_id, i.referee_id);
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke execute on function public.save_match_slots(uuid, jsonb) from public, anon;
grant execute on function public.save_match_slots(uuid, jsonb) to authenticated;

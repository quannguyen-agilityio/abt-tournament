-- Lock and unlock the lineups (spec §4.1, §6 A5 step 3). The app checks that both lineups are valid
-- or overridden and computes the handicaps (§4.2, §4.3); these functions store the snapshot and move
-- the match in one transaction. Locking makes the lineups public (A6, private.lineup_is_public).
-- Both writes go through the audit_log triggers on match and match_slot.

-- lock_match_lineups ------------------------------------------------------------------------------------

-- Security invoker, so RLS still applies: the BTC locks any match, a referee only open ones.
--
-- p_slots: [{ slot_no, home_p1, home_p2, away_p1, away_p2, handicap_home, handicap_away }] for every
-- slot of the match: the players the handicaps were computed from, and the start points. Group only:
-- relay matches pass 0–0 per leg and the start of leg 1 in p_relay_home / p_relay_away (null for a
-- group match).
-- Raises P0002 'match not found' when the match is missing or not writable, P0001 'lineup locked'
-- once it is past `scheduled`, and 40001 'lineup changed' when the saved players differ from p_slots
-- (someone saved a lineup in the meantime; check again and retry).
create function public.lock_match_lineups(
  p_match_id uuid,
  p_slots jsonb,
  p_relay_home smallint default null,
  p_relay_away smallint default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.match_status;
  v_updated integer;
begin
  select status into v_status from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if v_status <> 'scheduled' then
    raise exception 'lineup locked' using errcode = 'P0001';
  end if;

  update public.match_slot s
  set handicap_home = x.handicap_home,
      handicap_away = x.handicap_away
  from jsonb_to_recordset(p_slots) as x (
    slot_no smallint, home_p1 uuid, home_p2 uuid, away_p1 uuid, away_p2 uuid,
    handicap_home smallint, handicap_away smallint
  )
  where s.match_id = p_match_id
    and s.slot_no = x.slot_no
    and s.home_p1 is not distinct from x.home_p1
    and s.home_p2 is not distinct from x.home_p2
    and s.away_p1 is not distinct from x.away_p1
    and s.away_p2 is not distinct from x.away_p2;
  get diagnostics v_updated = row_count;

  if v_updated <> jsonb_array_length(p_slots)
    or v_updated <> (select count(*) from public.match_slot where match_id = p_match_id) then
    raise exception 'lineup changed' using errcode = '40001';
  end if;

  update public.match
  set status = 'lineup_locked',
      relay_handicap_home = p_relay_home,
      relay_handicap_away = p_relay_away
  where id = p_match_id;
end;
$$;

revoke execute on function public.lock_match_lineups(uuid, jsonb, smallint, smallint) from public, anon;
grant execute on function public.lock_match_lineups(uuid, jsonb, smallint, smallint) to authenticated;

-- unlock_match_lineups ----------------------------------------------------------------------------------

-- BTC only (spec §4.1): moves a locked match back to `scheduled` and clears the handicap snapshot,
-- which the next lock takes again. The lineups and overrides stay. The audit_log triggers record who
-- unlocked and when. Raises 42501 for anyone but the BTC, P0002 when the match is missing and P0001
-- 'not locked' unless the match is `lineup_locked` (once play has started, changes go through
-- substitutions).
create function public.unlock_match_lineups(p_match_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.match_status;
begin
  if not private.is_btc() then
    raise exception 'only the btc can unlock' using errcode = '42501';
  end if;

  select status into v_status from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if v_status <> 'lineup_locked' then
    raise exception 'not locked' using errcode = 'P0001';
  end if;

  update public.match_slot
  set handicap_home = 0, handicap_away = 0
  where match_id = p_match_id and (handicap_home <> 0 or handicap_away <> 0);

  update public.match
  set status = 'scheduled', relay_handicap_home = null, relay_handicap_away = null
  where id = p_match_id;
end;
$$;

revoke execute on function public.unlock_match_lineups(uuid) from public, anon;
grant execute on function public.unlock_match_lineups(uuid) to authenticated;

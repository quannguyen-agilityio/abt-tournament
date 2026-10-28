-- Score entry, completion and reopening (spec §4.4, §6 A5 steps 4 and 5). The app validates the scores
-- (§4.4) on the state it read; these functions check that state is still current, then write it in one
-- transaction. Every write goes through the audit_log triggers on match and match_slot.

-- private.match_score_state -----------------------------------------------------------------------------

-- The scores and start points of every slot of a match, in slot order: what the app validated against.
-- Security invoker, so it shows the caller only the slots RLS lets them read; the functions below call
-- it after locking a match row the caller can write, whose slots are readable once it is locked.
create function private.match_score_state(p_match_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slot_no', slot_no,
        'score_home', score_home,
        'score_away', score_away,
        'handicap_home', handicap_home,
        'handicap_away', handicap_away
      )
      order by slot_no
    ),
    '[]'::jsonb
  )
  from public.match_slot
  where match_id = p_match_id;
$$;

revoke execute on function private.match_score_state(uuid) from public, anon;
grant execute on function private.match_score_state(uuid) to authenticated;

-- save_slot_score ---------------------------------------------------------------------------------------

-- Security invoker, so RLS still applies: the BTC scores any match, a referee only open ones.
--
-- Saves one set (group) or one leg (relay, cumulative) on its own, so a weak connection loses at most
-- the row being saved. A saved row can be corrected by saving it again. The first save moves the match
-- from `lineup_locked` to `in_progress`.
-- p_expected: the private.match_score_state the app validated the new score against.
-- Raises P0002 'match not found' when the match or slot is missing or not writable, P0001 'scores
-- closed' unless the match is `lineup_locked` or `in_progress`, 22023 when a score is missing, and
-- 40001 'scores changed' when another save landed in the meantime (check again and retry).
create function public.save_slot_score(
  p_match_id uuid,
  p_slot_no smallint,
  p_score_home smallint,
  p_score_away smallint,
  p_expected jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.match_status;
begin
  select status into v_status from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if v_status not in ('lineup_locked', 'in_progress') then
    raise exception 'scores closed' using errcode = 'P0001';
  end if;
  if p_score_home is null or p_score_away is null then
    raise exception 'both scores are required' using errcode = '22023';
  end if;
  if private.match_score_state(p_match_id) <> p_expected then
    raise exception 'scores changed' using errcode = '40001';
  end if;

  update public.match_slot
  set score_home = p_score_home, score_away = p_score_away
  where match_id = p_match_id and slot_no = p_slot_no;
  if not found then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;

  if v_status = 'lineup_locked' then
    update public.match set status = 'in_progress' where id = p_match_id;
  end if;
end;
$$;

revoke execute on function public.save_slot_score(uuid, smallint, smallint, smallint, jsonb) from public, anon;
grant execute on function public.save_slot_score(uuid, smallint, smallint, smallint, jsonb) to authenticated;

-- complete_match ----------------------------------------------------------------------------------------

-- Security invoker: the BTC completes any match, a referee only open ones. Once `completed`, the
-- referee policies no longer let a referee write the match (private.match_is_open).
--
-- The app derives the winner from the scores (§4.4: sets won, or the side at the final relay
-- milestone); p_expected is the private.match_score_state it derived it from.
-- Raises P0002 when the match is missing or not writable, P0001 'not in progress' unless the match is
-- `in_progress`, 22023 when the winner is not one of the two teams, and 40001 'scores changed'.
create function public.complete_match(p_match_id uuid, p_winner_team_id uuid, p_expected jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_match public.match;
begin
  select * into v_match from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if v_match.status <> 'in_progress' then
    raise exception 'not in progress' using errcode = 'P0001';
  end if;
  if p_winner_team_id is null or p_winner_team_id not in (v_match.home_team_id, v_match.away_team_id) then
    raise exception 'winner is not in this match' using errcode = '22023';
  end if;
  if private.match_score_state(p_match_id) <> p_expected then
    raise exception 'scores changed' using errcode = '40001';
  end if;

  update public.match
  set status = 'completed', winner_team_id = p_winner_team_id
  where id = p_match_id;
end;
$$;

revoke execute on function public.complete_match(uuid, uuid, jsonb) from public, anon;
grant execute on function public.complete_match(uuid, uuid, jsonb) to authenticated;

-- reopen_match ------------------------------------------------------------------------------------------

-- BTC only (spec §6 A5): moves a completed match back to `in_progress` and clears the winner, so the
-- scores can be corrected and the match completed again. The audit_log triggers record who reopened it
-- and when. Raises 42501 for anyone but the BTC, P0002 when the match is missing and P0001 'not
-- completed' unless the match is `completed`.
create function public.reopen_match(p_match_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.match_status;
begin
  if not private.is_btc() then
    raise exception 'only the btc can reopen' using errcode = '42501';
  end if;

  select status into v_status from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if v_status <> 'completed' then
    raise exception 'not completed' using errcode = 'P0001';
  end if;

  update public.match
  set status = 'in_progress', winner_team_id = null
  where id = p_match_id;
end;
$$;

revoke execute on function public.reopen_match(uuid) from public, anon;
grant execute on function public.reopen_match(uuid) to authenticated;

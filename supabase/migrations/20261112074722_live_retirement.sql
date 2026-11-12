-- Retirement in live scoring (spec-phase-2 §6, L8, L9): live_apply accepts `retire` and writes what
-- it means, in the same transaction as the event.
--
-- A `retire` follows an open medical timeout of the same player (the server action replays the log
-- with `replay()` first; the RPC checks it again). It ends the slot, which goes to `finished` with:
--
-- - group (L8): the opponent credited `set_target`, the retiring side keeping its points
--   (e.g. 18–22 is stored 18–31), and `retired_side`/`retired_player_id`. Every later set that is
--   not started yet and has the injured player in its lineup is forfeited `set_target`–0
--   (`forfeit_side`), start points ignored. Those sets have no live event and stay `pending`, like a
--   set entered as a final score, so live scoring skips them. The other later sets are played as
--   normal, and the match completes once every set has a score, as after an `end_confirmed`.
-- - relay (L9): the opponent's cumulative score := the final milestone, the retiring team keeping
--   its own; `match.retired_team_id` is set and the match completes with the opponent as winner.
--   Later legs stay empty.
--
-- A live-scored match has no substitution after the lock (L6), so the stored lineup is the one
-- played. A BTC reopen of the slot (20261111073640_live_reopen_retirement.sql) undoes all of this.
--
-- save_slot_score also refuses a forfeited set, so the Phase 1 entry grid cannot overwrite it.

-- live_apply ------------------------------------------------------------------------------------------

-- As in 20261109080435_live_scoring.sql, plus `retire`. Returns the seq written. Raises 42501 when
-- the caller is not the scorer (or not the BTC, for a reopen), P0002 'slot not found', 40001 'events
-- changed' on a stale p_expected_seq, P0001 when the slot or match is closed to the event, and 22023
-- for an invalid payload (a `retire` without an open timeout of that player included).
create or replace function public.live_apply(
  p_slot_id uuid,
  p_expected_seq integer,
  p_kind public.live_event_kind,
  p_payload jsonb default '{}'::jsonb,
  p_client_at timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_id uuid;
  v_match public.match;
  v_slot public.match_slot;
  v_settings jsonb;
  v_relay boolean;
  v_last integer;
  v_start_home integer;
  v_start_away integer;
  v_home integer;
  v_away integer;
  v_unscored integer;
  v_home_sets integer;
  v_away_sets integer;
  v_final public.match_slot;
  v_winner uuid;
  v_timeout public.live_event;
  v_player uuid;
  v_side public.match_side;
  v_target integer;
begin
  if auth.uid() is null or private.current_user_role() is null then
    raise exception 'staff only' using errcode = '42501';
  end if;

  select match_id into v_match_id from public.match_slot where id = p_slot_id;
  if not found or not private.match_is_public(v_match_id) then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;
  -- Lock the match: the events of all its slots, the lock moves and the Phase 1 score saves queue
  -- behind each other.
  select * into v_match from public.match where id = v_match_id for update;
  select * into v_slot from public.match_slot where id = p_slot_id;
  select settings into v_settings from public.season where id = v_match.season_id;
  v_relay := v_match.stage <> 'group';

  if p_kind = 'reopened' then
    if not private.is_btc() then
      raise exception 'only the btc can reopen' using errcode = '42501';
    end if;
    if v_match.status not in ('in_progress', 'completed') then
      raise exception 'scores closed' using errcode = 'P0001';
    end if;
  else
    if v_match.scorer_id is distinct from auth.uid() then
      raise exception 'not the scorer' using errcode = '42501';
    end if;
    if v_match.status not in ('lineup_locked', 'in_progress') then
      raise exception 'scores closed' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(max(seq), 0) into v_last from public.live_event where match_slot_id = p_slot_id;
  if p_expected_seq is distinct from v_last + 1 then
    raise exception 'events changed' using errcode = '40001';
  end if;

  if v_slot.live_status = 'pending' and v_slot.score_home is not null then
    raise exception 'slot scored as a final score' using errcode = 'P0001';
  end if;

  -- The start of the slot: start points (group), the leg-1 start, or the score of the previous leg,
  -- which must be confirmed first (relay legs are cumulative).
  if not v_relay then
    v_start_home := v_slot.handicap_home;
    v_start_away := v_slot.handicap_away;
  elsif v_slot.slot_no = 1 then
    v_start_home := coalesce(v_match.relay_handicap_home, 0);
    v_start_away := coalesce(v_match.relay_handicap_away, 0);
  else
    select score_home, score_away into v_start_home, v_start_away
    from public.match_slot
    where match_id = v_match.id and slot_no = v_slot.slot_no - 1;
    if v_start_home is null or v_start_away is null then
      raise exception 'previous leg not confirmed' using errcode = 'P0001';
    end if;
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be an object' using errcode = '22023';
  end if;

  if p_kind = 'reopened' then
    if v_slot.live_status <> 'finished' then
      raise exception 'not confirmed' using errcode = 'P0001';
    end if;
    if coalesce(btrim(p_payload ->> 'reason'), '') = '' then
      raise exception 'a reason is required' using errcode = '22023';
    end if;
    if v_relay then
      if exists (
        select 1 from public.match_slot
        where match_id = v_match.id and slot_no > v_slot.slot_no and score_home is not null
      ) then
        raise exception 'a later leg is confirmed' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from public.match_slot ms, private.live_points(ms.id) p
        where ms.match_id = v_match.id and ms.slot_no = v_slot.slot_no + 1
      ) then
        raise exception 'the next leg has started' using errcode = 'P0001';
      end if;
    end if;
  else
    -- L10: after the end is confirmed, only the BTC can reopen it.
    if v_slot.live_status = 'finished' then
      raise exception 'slot confirmed' using errcode = 'P0001';
    end if;
    if p_kind = 'point' and coalesce(p_payload ->> 'side', '') not in ('home', 'away') then
      raise exception 'point needs a side' using errcode = '22023';
    end if;
    if p_kind = 'undo' and (
      coalesce(p_payload ->> 'seq', '') !~ '^[0-9]{1,9}$'
      or (p_payload ->> 'seq')::integer is distinct from (
        select max(p.seq) from private.live_points(p_slot_id) p
      )
    ) then
      raise exception 'undo must cancel the last point' using errcode = '22023';
    end if;
    if p_kind = 'retire' then
      -- §6: a retirement follows a medical timeout of the same player that is still open.
      select * into v_timeout
      from public.live_event
      where match_slot_id = p_slot_id and kind in ('timeout_start', 'timeout_end')
      order by seq desc
      limit 1;
      if v_timeout.kind is distinct from 'timeout_start'
        or (v_timeout.payload ->> 'player') is distinct from (p_payload ->> 'player') then
        raise exception 'retire needs an open timeout of that player' using errcode = '22023';
      end if;
      v_player := (p_payload ->> 'player')::uuid;
      v_side := case
        when v_player in (v_slot.home_p1, v_slot.home_p2) then 'home'::public.match_side
        when v_player in (v_slot.away_p1, v_slot.away_p2) then 'away'::public.match_side
      end;
      if v_side is null then
        raise exception 'the player is not on court' using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.live_event (match_slot_id, seq, kind, payload, client_at, created_by)
  values (p_slot_id, v_last + 1, p_kind, p_payload, coalesce(p_client_at, now()), auth.uid());

  if v_slot.live_status = 'pending' then
    update public.match_slot set live_status = 'live', started_at = now() where id = p_slot_id;
  end if;
  if v_match.status = 'lineup_locked' then
    update public.match set status = 'in_progress' where id = v_match.id;
  end if;

  if p_kind in ('end_confirmed', 'retire') then
    select v_start_home + count(*) filter (where p.side = 'home'),
      v_start_away + count(*) filter (where p.side = 'away')
    into v_home, v_away
    from private.live_points(p_slot_id) p;

    if p_kind = 'retire' then
      -- The opponent is credited the target: set_target (group, L8) or the final milestone (relay, L9).
      v_target := case
        when v_relay then coalesce((v_settings -> 'relay_milestones' ->> -1)::integer, 125)
        else coalesce((v_settings ->> 'set_target')::integer, 31)
      end;
      if v_side = 'home' then
        v_away := v_target;
      else
        v_home := v_target;
      end if;
    end if;

    update public.match_slot
    set score_home = v_home, score_away = v_away, live_status = 'finished', ended_at = now(),
      retired_side = case when p_kind = 'retire' then v_side end,
      retired_player_id = case when p_kind = 'retire' then v_player end
    where id = p_slot_id;

    if p_kind = 'retire' and v_relay then
      update public.match
      set status = 'completed', retired_team_id = case when v_side = 'home' then home_team_id else away_team_id end,
        winner_team_id = case when v_side = 'home' then away_team_id else home_team_id end
      where id = v_match.id;
      return v_last + 1;
    end if;

    if p_kind = 'retire' then
      -- L8: later sets not started yet with the injured player lined up are forfeited target–0.
      update public.match_slot ms
      set forfeit_side = v_side,
        score_home = case when v_side = 'home' then 0 else v_target end,
        score_away = case when v_side = 'home' then v_target else 0 end
      where ms.match_id = v_match.id
        and ms.slot_no > v_slot.slot_no
        and ms.live_status = 'pending'
        and ms.score_home is null
        and v_player in (ms.home_p1, ms.home_p2, ms.away_p1, ms.away_p2);
    end if;

    select count(*) filter (where score_home is null or score_away is null),
      count(*) filter (where score_home > score_away),
      count(*) filter (where score_away > score_home)
    into v_unscored, v_home_sets, v_away_sets
    from public.match_slot
    where match_id = v_match.id;

    if v_unscored = 0 then
      if v_relay then
        select * into v_final from public.match_slot where match_id = v_match.id order by slot_no desc limit 1;
        v_home_sets := (v_final.score_home > v_final.score_away)::integer;
        v_away_sets := (v_final.score_away > v_final.score_home)::integer;
      end if;
      if v_home_sets <> v_away_sets then
        v_winner := case when v_home_sets > v_away_sets then v_match.home_team_id else v_match.away_team_id end;
        update public.match set status = 'completed', winner_team_id = v_winner where id = v_match.id;
      end if;
    end if;
  elsif p_kind = 'reopened' then
    update public.match_slot
    set score_home = null, score_away = null, live_status = 'live', ended_at = null
    where id = p_slot_id;
    if v_match.status = 'completed' then
      update public.match set status = 'in_progress', winner_team_id = null where id = v_match.id;
    end if;
  end if;

  return v_last + 1;
end;
$$;

-- save_slot_score: a forfeited set is not entered ---------------------------------------------------

-- As in 20261109080435_live_scoring.sql, plus: raises P0001 'slot forfeited' for a set forfeited by a
-- retirement (L8). Only a BTC reopen of the retired set clears that forfeit.
create or replace function public.save_slot_score(
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
  if exists (
    select 1 from public.match_slot
    where match_id = p_match_id and slot_no = p_slot_no and live_status <> 'pending'
  ) then
    raise exception 'slot scored live' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.match_slot
    where match_id = p_match_id and slot_no = p_slot_no and forfeit_side is not null
  ) then
    raise exception 'slot forfeited' using errcode = 'P0001';
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

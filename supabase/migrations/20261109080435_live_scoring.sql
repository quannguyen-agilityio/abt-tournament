-- Live scoring (spec-phase-2 §7): the append-only event log of each set or relay leg, the live
-- columns of match_slot and match, and live_apply, the one entry point that writes the log and the
-- final scores it leads to.
--
-- Where the rules run: the doubles service rules (replay(), src/domain/live.ts) are TypeScript. The
-- server action loads the log, replays it with the new event and calls live_apply only if the event
-- is valid. live_apply then checks what the database can check on its own: the caller holds the
-- scorer lock, the log has not changed since it was read (expected_seq), the slot is open for the
-- event (not confirmed, not scored as a Phase 1 final score, relay legs in order), and the BTC rules
-- for reopening. It computes the confirmed score from the log itself.

-- Enums ---------------------------------------------------------------------------------------------

create type public.live_event_kind as enum (
  'setup', 'point', 'undo', 'ends_changed', 'timeout_start', 'timeout_end', 'retire', 'end_confirmed',
  'reopened'
);
-- pending: no live event yet (a Phase 1 final score can still be entered). live: scoring has started,
-- or the slot was reopened. finished: the end is confirmed.
create type public.slot_live_status as enum ('pending', 'live', 'finished');

-- match_slot and match: live columns ------------------------------------------------------------------

alter table public.match_slot
  add column live_status public.slot_live_status not null default 'pending',
  -- §6 (L8, L9): the side whose player retired in this slot, and that player.
  add column retired_side public.match_side,
  add column retired_player_id uuid references public.season_player (id),
  -- §6 (L8): a later set forfeited because the injured player is lined up in it.
  add column forfeit_side public.match_side,
  add column started_at timestamptz,
  add column ended_at timestamptz,
  add constraint match_slot_retired_player_check check ((retired_side is null) = (retired_player_id is null)),
  add constraint match_slot_retired_or_forfeit_check check (retired_side is null or forfeit_side is null);

create index match_slot_retired_player_id_idx on public.match_slot (retired_player_id);

alter table public.match
  -- §5 (L5): the user who holds the scorer lock, and since when.
  add column scorer_id uuid references public.profile (user_id),
  add column scorer_since timestamptz,
  -- §6 (L9): the team that retired from a relay match.
  add column retired_team_id uuid references public.team (id),
  add constraint match_scorer_check check ((scorer_id is null) = (scorer_since is null)),
  add constraint match_retired_team_check
    check (retired_team_id is null or retired_team_id in (home_team_id, away_team_id));

create index match_scorer_id_idx on public.match (scorer_id);
create index match_retired_team_id_idx on public.match (retired_team_id);

-- live_event ------------------------------------------------------------------------------------------

create table public.live_event (
  id uuid primary key default gen_random_uuid(),
  match_slot_id uuid not null references public.match_slot (id),
  -- 1, 2, 3… per slot.
  seq integer not null check (seq >= 1),
  kind public.live_event_kind not null,
  -- setup: serving_side?, server, receiver, ends. point: side. undo: the seq it cancels.
  -- timeout_start, retire: player. reopened: reason.
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  -- When the scorer tapped (the device clock), for the timeline.
  client_at timestamptz not null default now(),
  created_by uuid references public.profile (user_id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (match_slot_id, seq)
);

create index live_event_created_by_idx on public.live_event (created_by);

alter table public.live_event enable row level security;

-- Append-only, and written only by live_apply (security definer).
revoke insert, update, delete, truncate on public.live_event from anon, authenticated;

-- Only the BTC reopen is audited: every point is in the log already, and the score writes and the
-- lock moves are audited through match_slot and match.
create trigger live_event_audit after insert on public.live_event
  for each row when (new.kind = 'reopened') execute function public.audit_row_change();

-- Supabase Realtime: the public match page subscribes to inserts (§8.2). Realtime applies the select
-- policies below to every subscriber.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.live_event;
  end if;
end;
$$;

-- RLS -------------------------------------------------------------------------------------------------

-- The log of a slot is public while its match is in progress or completed, in a non-draft season.
create function private.live_events_are_public(p_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select s.status <> 'draft' and m.status in ('in_progress', 'completed')
      from public.match_slot ms
      join public.match m on m.id = ms.match_id
      join public.season s on s.id = m.season_id
      where ms.id = p_slot_id
    ),
    false
  );
$$;

revoke execute on function private.live_events_are_public(uuid) from public;
grant execute on function private.live_events_are_public(uuid) to anon, authenticated, service_role;

create policy "btc can read" on public.live_event
  for select to authenticated
  using ((select private.is_btc()));
create policy "anyone can read in progress and completed matches" on public.live_event
  for select to anon, authenticated
  using (private.live_events_are_public(match_slot_id));
-- A referee also reads the log of a match that was forfeit or annulled after it started.
create policy "referee can read" on public.live_event
  for select to authenticated
  using (
    (select private.is_referee())
    and exists (
      select 1 from public.match_slot ms where ms.id = match_slot_id and private.match_is_public(ms.match_id)
    )
  );

-- private.live_points ---------------------------------------------------------------------------------

-- The points of a slot that no undo cancels, in order.
create function private.live_points(p_slot_id uuid)
returns table (seq integer, side public.match_side)
language sql
stable
security definer
set search_path = ''
as $$
  select e.seq, (e.payload ->> 'side')::public.match_side
  from public.live_event e
  where e.match_slot_id = p_slot_id
    and e.kind = 'point'
    and not exists (
      select 1 from public.live_event u
      where u.match_slot_id = e.match_slot_id and u.kind = 'undo' and (u.payload ->> 'seq')::integer = e.seq
    )
  order by e.seq;
$$;

revoke execute on function private.live_points(uuid) from public, anon, authenticated;

-- live_apply ------------------------------------------------------------------------------------------

-- Appends one event to the log of a slot (spec-phase-2 §7). Security definer, so it can write the log
-- that nobody else writes; it checks the caller itself.
--
-- - Every event but `reopened` comes from the current scorer (match.scorer_id), while the match is
--   `lineup_locked` or `in_progress`. The first event moves the match to `in_progress` and the slot
--   to `live`.
-- - p_expected_seq must be the last seq + 1, so an event replayed against an older log is refused.
-- - `end_confirmed` writes the slot score, computed from the log (start points, or the cumulative
--   score of the previous leg, plus the points no undo cancels). Once every slot has a score, the
--   match is completed: sets won (group), or the side ahead after the last leg (relay).
-- - `reopened` comes from a BTC member, with a reason, on a confirmed slot (relay: the last
--   confirmed leg, while the next leg has no point). It clears the slot score and moves a completed
--   match back to `in_progress`. The scorer lock does not change.
-- - `retire` is refused until the retirement flow lands (it also writes the forfeits of §6).
--
-- Returns the seq written. Raises 42501 when the caller is not the scorer (or not the BTC, for a
-- reopen), P0002 'slot not found', 40001 'events changed' on a stale p_expected_seq, P0001 when the
-- slot or match is closed to the event, 22023 for an invalid payload, and 0A000 for `retire`.
create function public.live_apply(
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

  if p_kind = 'retire' then
    raise exception 'retirement not supported yet' using errcode = '0A000';
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
  end if;

  insert into public.live_event (match_slot_id, seq, kind, payload, client_at, created_by)
  values (p_slot_id, v_last + 1, p_kind, p_payload, coalesce(p_client_at, now()), auth.uid());

  if v_slot.live_status = 'pending' then
    update public.match_slot set live_status = 'live', started_at = now() where id = p_slot_id;
  end if;
  if v_match.status = 'lineup_locked' then
    update public.match set status = 'in_progress' where id = v_match.id;
  end if;

  if p_kind = 'end_confirmed' then
    select v_start_home + count(*) filter (where p.side = 'home'),
      v_start_away + count(*) filter (where p.side = 'away')
    into v_home, v_away
    from private.live_points(p_slot_id) p;

    update public.match_slot
    set score_home = v_home, score_away = v_away, live_status = 'finished', ended_at = now()
    where id = p_slot_id;

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

revoke execute on function public.live_apply(uuid, integer, public.live_event_kind, jsonb, timestamptz)
  from public, anon;
grant execute on function public.live_apply(uuid, integer, public.live_event_kind, jsonb, timestamptz)
  to authenticated;

-- save_slot_score: a slot scored live is written only by live_apply -------------------------------------

-- As in 20261028080436_match_scores.sql, plus: raises P0001 'slot scored live' once the slot has a
-- live event, so the two ways of scoring cannot overwrite each other (§8.0).
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

-- Live scoring entry on A5 (spec-phase-2 §8.0, §8.1 L-A, L6).
--
-- - match.final_entry: the BTC switched the match to Phase 1 final-score entry before any rally. The
--   live scoring card is then closed for that match, and substitutions are offered again (L6).
-- - live_set_final_entry: the one way to switch it, BTC only.
-- - live_claim refuses a match switched to final-score entry.
-- - L6: no substitution after the lock in a live-scored match (live_scoring on and not switched).
-- - scorer_name: the name of the user holding a scorer lock, for referees, who cannot read profile.

-- match.final_entry ---------------------------------------------------------------------------------

alter table public.match add column final_entry boolean not null default false;

-- The lock columns and final_entry change only through live_claim and live_set_final_entry. As in
-- 20261109083421_live_scorer_lock.sql, the security definer functions run as their owner and the
-- service role is trusted, so only the API roles are refused.
create or replace function private.guard_match_scorer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.scorer_id is not null or new.scorer_since is not null))
    or (
      tg_op = 'UPDATE'
      and (new.scorer_id, new.scorer_since) is distinct from (old.scorer_id, old.scorer_since)
    ) then
    raise exception 'the scorer lock moves only through live_claim' using errcode = '42501';
  end if;
  if (tg_op = 'INSERT' and new.final_entry)
    or (tg_op = 'UPDATE' and new.final_entry is distinct from old.final_entry) then
    raise exception 'final_entry changes only through live_set_final_entry' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- private.match_is_live_scored ----------------------------------------------------------------------

-- The match is scored live: its season has live_scoring on (the default when the key is missing, as in
-- src/domain/settings.ts) and the BTC has not switched it to final-score entry.
create function private.match_is_live_scored(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select coalesce((s.settings ->> 'live_scoring')::boolean, true) and not m.final_entry
      from public.match m
      join public.season s on s.id = m.season_id
      where m.id = p_match_id
    ),
    false
  );
$$;

revoke execute on function private.match_is_live_scored(uuid) from public, anon;
grant execute on function private.match_is_live_scored(uuid) to authenticated, service_role;

-- live_set_final_entry ------------------------------------------------------------------------------

-- Switches a match to Phase 1 final-score entry (p_on true) or back to live scoring (false). BTC only,
-- while the match is `lineup_locked` or `in_progress`. Switching to final-score entry needs every slot
-- to be without a live event ("before any rally", §8.1 L-A) and releases the scorer lock. The change is
-- audited by match_audit.
--
-- Raises 42501 for anyone but an active BTC member, P0002 'match not found', and P0001 when the match
-- is closed or a slot has a live event.
create function public.live_set_final_entry(p_match_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.match;
begin
  if auth.uid() is null or not private.is_btc() then
    raise exception 'btc only' using errcode = '42501';
  end if;
  select * into v_match from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if v_match.status not in ('lineup_locked', 'in_progress') then
    raise exception 'scores closed' using errcode = 'P0001';
  end if;
  if p_on and exists (
    select 1 from public.match_slot where match_id = p_match_id and live_status <> 'pending'
  ) then
    raise exception 'live scoring started' using errcode = 'P0001';
  end if;
  if v_match.final_entry is not distinct from p_on then
    return;
  end if;
  update public.match
  set final_entry = p_on,
    scorer_id = case when p_on then null else scorer_id end,
    scorer_since = case when p_on then null else scorer_since end
  where id = p_match_id;
end;
$$;

revoke execute on function public.live_set_final_entry(uuid, boolean) from public, anon;
grant execute on function public.live_set_final_entry(uuid, boolean) to authenticated;

-- live_claim: refuse a match switched to final-score entry ------------------------------------------

-- As in 20261109083421_live_scorer_lock.sql, plus: P0001 when the match is switched to final-score
-- entry. live_apply needs the caller to hold the lock, so it is closed to such a match as well.
create or replace function public.live_claim(p_match_id uuid, p_expected_scorer uuid default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.match;
begin
  if auth.uid() is null or private.current_user_role() is null then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if not private.match_is_public(p_match_id) then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  select * into v_match from public.match where id = p_match_id for update;
  if v_match.status not in ('lineup_locked', 'in_progress') or v_match.final_entry then
    raise exception 'scores closed' using errcode = 'P0001';
  end if;
  if v_match.scorer_id = auth.uid() then
    return v_match.scorer_since;
  end if;
  if v_match.scorer_id is distinct from p_expected_scorer then
    raise exception 'scorer changed' using errcode = '40001';
  end if;
  update public.match
  set scorer_id = auth.uid(), scorer_since = now()
  where id = p_match_id
  returning scorer_since into v_match.scorer_since;
  return v_match.scorer_since;
end;
$$;

-- L6: no substitution in a live-scored match --------------------------------------------------------

-- Substitutions exist only after the lock, so a live-scored match refuses every one. substitute_player
-- is security invoker: it reaches this trigger as `authenticated`, and maps P0001 to "closed".
create function private.guard_live_substitution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and private.match_is_live_scored(
    (select match_id from public.match_slot where id = new.match_slot_id)
  ) then
    raise exception 'no substitution in a live-scored match' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_live_substitution() from public, anon, authenticated;

create trigger slot_substitution_guard_live before insert on public.slot_substitution
  for each row execute function private.guard_live_substitution();

-- scorer_name -----------------------------------------------------------------------------------------

-- The names of the users holding a scorer lock in a non-draft season. Like referee_name, a view so a
-- referee can show "Đang chấm bởi {name}" without reading profile; staff only.
create view public.scorer_name as
  select p.user_id, p.display_name
  from public.profile p
  where exists (
    select 1
    from public.match m
    join public.season s on s.id = m.season_id
    where m.scorer_id = p.user_id and s.status <> 'draft'
  );

revoke all on public.scorer_name from anon, authenticated;
grant select on public.scorer_name to authenticated;

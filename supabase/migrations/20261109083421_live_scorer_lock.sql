-- Scorer lock (spec-phase-2 §5, L5): live_claim, the one way to claim or take over match.scorer_id.
--
-- The lock moves are audited by match_audit (20261026081355_audit_log.sql): the entry's actor is the
-- user who claims, `before.scorer_id` the previous scorer and `after.scorer_id` the new one.

-- Guard: the lock columns change only through live_claim ----------------------------------------------

-- A referee may update an open match and the BTC any match (RLS), so without this an API user could
-- write scorer_id directly and skip the checks of live_claim. live_claim and the other security
-- definer functions run as their owner, and the service role (seeds, imports) is trusted, so only
-- the API roles are refused.
create function private.guard_match_scorer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    (tg_op = 'INSERT' and (new.scorer_id is not null or new.scorer_since is not null))
    or (
      tg_op = 'UPDATE'
      and (new.scorer_id, new.scorer_since) is distinct from (old.scorer_id, old.scorer_since)
    )
  ) then
    raise exception 'the scorer lock moves only through live_claim' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_match_scorer() from public, anon, authenticated;

create trigger match_guard_scorer before insert or update on public.match
  for each row execute function private.guard_match_scorer();

-- live_claim ------------------------------------------------------------------------------------------

-- Claims the scorer lock of a match for the caller (spec-phase-2 §5). Security definer: it writes
-- match.scorer_id, which the guard above keeps from API users, and checks the caller itself.
--
-- - The caller is an active BTC member or referee, and the match is `lineup_locked` or `in_progress`.
-- - p_expected_scorer is the scorer the caller saw: null to start live scoring when nobody holds the
--   lock, or the current scorer to take over after the confirmation. The match row is locked first,
--   so of two users claiming at once exactly one wins; the other gets 40001, as does a takeover of a
--   scorer who has changed since the confirmation was shown.
-- - Claiming a lock the caller already holds changes nothing.
--
-- Returns scorer_since. Raises 42501 for anon and inactive users, P0002 'match not found', P0001
-- when the match is not open for live scoring, and 40001 'scorer changed'.
create function public.live_claim(p_match_id uuid, p_expected_scorer uuid default null)
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

  if v_match.status not in ('lineup_locked', 'in_progress') then
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

revoke execute on function public.live_claim(uuid, uuid) from public, anon;
grant execute on function public.live_claim(uuid, uuid) to authenticated;

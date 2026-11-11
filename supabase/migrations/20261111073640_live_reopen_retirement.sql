-- BTC reopen of a slot that ended by retirement (spec-phase-2 §4.5, §6): the reopen also clears the
-- retirement and the forfeits it caused, so the scorer continues the match from before the injury.
--
-- live_apply already checks the reopen (BTC only, with a reason, relay legs from the last one
-- backwards) and clears the score of the reopened slot. This trigger runs on the `reopened` insert,
-- inside the same transaction, and undoes what a `retire` wrote:
--
-- - group (L8): `retired_side` and `retired_player_id` of the slot, and every later set of the match
--   forfeited (`forfeit_side`) with the injured player in its lineup. Those sets have no live event
--   (a forfeit is written, not scored), so they go back to `pending` with no score and can be
--   played. A live-scored match has no substitution after the lock (L6), so the stored lineup is the
--   one played.
-- - relay (L9): the same slot columns and `match.retired_team_id`. Later legs stay empty after a
--   relay retirement, so there is nothing else to clear.
--
-- A slot that did not end by retirement is left as it is.

create function private.live_reopen_clear_retirement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.match_slot;
begin
  select * into v_slot from public.match_slot where id = new.match_slot_id;
  if v_slot.retired_side is null then
    return null;
  end if;

  update public.match_slot ms
  set forfeit_side = null, score_home = null, score_away = null, live_status = 'pending', ended_at = null
  where ms.match_id = v_slot.match_id
    and ms.slot_no > v_slot.slot_no
    and ms.forfeit_side is not null
    and v_slot.retired_player_id in (ms.home_p1, ms.home_p2, ms.away_p1, ms.away_p2)
    and not exists (select 1 from public.live_event e where e.match_slot_id = ms.id);

  update public.match_slot set retired_side = null, retired_player_id = null where id = v_slot.id;
  update public.match set retired_team_id = null where id = v_slot.match_id and retired_team_id is not null;
  return null;
end;
$$;

revoke execute on function private.live_reopen_clear_retirement() from public, anon, authenticated;

create trigger live_event_reopen_retirement after insert on public.live_event
  for each row when (new.kind = 'reopened') execute function private.live_reopen_clear_retirement();

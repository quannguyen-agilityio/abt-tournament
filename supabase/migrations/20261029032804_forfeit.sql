-- Forfeit a match (spec §4.5, D17, A5, §6 A5 side actions). The app computes the recorded result from
-- the season settings (src/domain/forfeit.ts: 31–0 in every set in the group, the relay milestones to 0
-- in the knock-out); this function checks who may forfeit the match and writes the result in one
-- transaction. Every write goes through the audit_log triggers on match and match_slot.

-- forfeit_match -----------------------------------------------------------------------------------------

-- Security definer: a referee can write an open match but RLS keeps it from setting the `forfeit` status,
-- which the spec lists as a match-day action for all staff (§6 A5). So the function checks the caller
-- itself: the BTC forfeits any match, a referee only an open one (private.match_is_open).
--
-- p_forfeit_team_id: the team that loses by forfeit; the other team wins (and advances in the knock-out).
-- p_reason: required, shown on the public match page.
-- p_slots: [{ slot_no, score_home, score_away }] for every slot: the recorded forfeit result. Lineups and
-- handicaps are ignored: the start points are cleared, and so are the players of a lineup that was never
-- locked, so it stays hidden (A6).
-- Raises 42501 for anyone else, P0002 'match not found', P0001 'match closed' unless the match is
-- `scheduled`, `lineup_locked` or `in_progress`, and 22023 when the team is not in the match, the reason
-- is empty or p_slots does not give the forfeiting team 0 in every slot of the match.
create function public.forfeit_match(
  p_match_id uuid,
  p_forfeit_team_id uuid,
  p_reason text,
  p_slots jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.match;
  v_side public.match_side;
  v_updated integer;
begin
  if not (private.is_btc() or (private.is_referee() and private.match_is_open(p_match_id))) then
    raise exception 'only staff can forfeit an open match' using errcode = '42501';
  end if;

  select * into v_match from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if v_match.status not in ('scheduled', 'lineup_locked', 'in_progress') then
    raise exception 'match closed' using errcode = 'P0001';
  end if;
  if p_forfeit_team_id is null or p_forfeit_team_id not in (v_match.home_team_id, v_match.away_team_id) then
    raise exception 'team is not in this match' using errcode = '22023';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  v_side := case when p_forfeit_team_id = v_match.home_team_id then 'home' else 'away' end;

  update public.match_slot s
  set score_home = x.score_home,
      score_away = x.score_away,
      handicap_home = 0,
      handicap_away = 0,
      home_p1 = case when v_match.status = 'scheduled' then null else s.home_p1 end,
      home_p2 = case when v_match.status = 'scheduled' then null else s.home_p2 end,
      away_p1 = case when v_match.status = 'scheduled' then null else s.away_p1 end,
      away_p2 = case when v_match.status = 'scheduled' then null else s.away_p2 end
  from jsonb_to_recordset(p_slots) as x (slot_no smallint, score_home smallint, score_away smallint)
  where s.match_id = p_match_id
    and s.slot_no = x.slot_no
    and x.score_home >= 0
    and x.score_away >= 0
    and (case v_side when 'home' then x.score_home else x.score_away end) = 0;
  get diagnostics v_updated = row_count;

  if v_updated <> jsonb_array_length(p_slots)
    or v_updated <> (select count(*) from public.match_slot where match_id = p_match_id) then
    raise exception 'forfeit scores do not fit the match' using errcode = '22023';
  end if;

  update public.match
  set status = 'forfeit',
      forfeit_team_id = p_forfeit_team_id,
      forfeit_reason = trim(p_reason),
      winner_team_id = case v_side when 'home' then v_match.away_team_id else v_match.home_team_id end,
      relay_handicap_home = case when v_match.stage = 'group' then null else 0 end,
      relay_handicap_away = case when v_match.stage = 'group' then null else 0 end
  where id = p_match_id;
end;
$$;

revoke execute on function public.forfeit_match(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.forfeit_match(uuid, uuid, text, jsonb) to authenticated;

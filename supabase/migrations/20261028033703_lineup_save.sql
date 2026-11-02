-- Lineup step (spec §4.1, §6 A5 step 2): one team's lineup and its overrides are saved in one
-- transaction. The rules themselves are checked in the app (validateLineup); the database only makes
-- sure that the match is still open for lineups and that only the BTC records an override.

-- Overrides ---------------------------------------------------------------------------------------------

-- Replaces the overrides of one team in a match. Security definer because lineup_override is BTC-only
-- (spec §3.2), yet a referee who saves a valid lineup must clear the overrides of an earlier one so
-- that they cannot cover a later violation. Called only by save_lineup, after its checks; the private
-- schema is not exposed by the API.
create function private.replace_lineup_overrides(
  p_match_id uuid,
  p_team_id uuid,
  p_codes public.lineup_rule_code[],
  p_reason text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.lineup_override where match_id = p_match_id and team_id = p_team_id;
  insert into public.lineup_override (match_id, team_id, rule_code, reason, created_by)
  select distinct p_match_id, p_team_id, c, p_reason, auth.uid()
  from unnest(p_codes) as c;
$$;

revoke execute on function private.replace_lineup_overrides(uuid, uuid, public.lineup_rule_code[], text) from public;
grant execute on function private.replace_lineup_overrides(uuid, uuid, public.lineup_rule_code[], text)
  to authenticated;

-- The rules the BTC overrode for a match, per team, without the reasons (those stay BTC-only). The
-- referee needs them to know whether an overridden lineup can be locked. Empty for anyone else.
create function public.lineup_override_codes(p_match_id uuid)
returns table (team_id uuid, rule_code public.lineup_rule_code)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct o.team_id, o.rule_code
  from public.lineup_override o
  where o.match_id = p_match_id
    and (private.is_btc() or (private.is_referee() and private.match_is_public(p_match_id)));
$$;

revoke execute on function public.lineup_override_codes(uuid) from public, anon;
grant execute on function public.lineup_override_codes(uuid) to authenticated;

-- save_lineup -------------------------------------------------------------------------------------------

-- Security invoker, so RLS still applies: the BTC writes any match, a referee only open ones.
--
-- p_slots: [{ slot_no, p1, p2 }] for every slot of the match, the players of p_team_id's side.
-- p_override_codes: the rules the BTC accepts breaking, with p_override_reason. Empty for a valid
-- lineup, which also clears the team's earlier overrides.
-- Raises P0002 'match not found' when the match is missing or not writable, P0001 'lineup locked'
-- once the match is past `scheduled`, 42501 when a referee sends overrides, and 22023 for a team
-- that does not play the match or slots that do not match the match's slots.
create function public.save_lineup(
  p_match_id uuid,
  p_team_id uuid,
  p_slots jsonb,
  p_override_codes public.lineup_rule_code[],
  p_override_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_match record;
  v_side public.match_side;
  v_updated integer;
begin
  -- Lock the match so that a lock or another save waits for this one.
  select status, home_team_id, away_team_id into v_match
  from public.match
  where id = p_match_id
  for update;
  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception 'lineup locked' using errcode = 'P0001';
  end if;

  v_side := case p_team_id
    when v_match.home_team_id then 'home'::public.match_side
    when v_match.away_team_id then 'away'::public.match_side
  end;
  if v_side is null then
    raise exception 'team not in match' using errcode = '22023';
  end if;

  if coalesce(cardinality(p_override_codes), 0) > 0 and not private.is_btc() then
    raise exception 'only the btc can override' using errcode = '42501';
  end if;

  update public.match_slot s
  set home_p1 = case when v_side = 'home' then x.p1 else s.home_p1 end,
      home_p2 = case when v_side = 'home' then x.p2 else s.home_p2 end,
      away_p1 = case when v_side = 'away' then x.p1 else s.away_p1 end,
      away_p2 = case when v_side = 'away' then x.p2 else s.away_p2 end
  from jsonb_to_recordset(p_slots) as x (slot_no smallint, p1 uuid, p2 uuid)
  where s.match_id = p_match_id and s.slot_no = x.slot_no;
  get diagnostics v_updated = row_count;

  if v_updated <> jsonb_array_length(p_slots)
    or v_updated <> (select count(*) from public.match_slot where match_id = p_match_id) then
    raise exception 'slots do not match' using errcode = '22023';
  end if;

  perform private.replace_lineup_overrides(
    p_match_id, p_team_id, coalesce(p_override_codes, '{}'), coalesce(p_override_reason, '')
  );
end;
$$;

revoke execute on function public.save_lineup(uuid, uuid, jsonb, public.lineup_rule_code[], text) from public, anon;
grant execute on function public.save_lineup(uuid, uuid, jsonb, public.lineup_rule_code[], text) to authenticated;

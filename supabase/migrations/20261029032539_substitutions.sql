-- Substitutions (spec §4.1 SUB_RANK, D18, §6 A5 side actions). After the lock, the lineups change only
-- through substitutions. The app checks the substitution against the rules on the effective players and
-- recomputes the handicap (§4.2, §4.3); this function checks that state is still current, then stores the
-- substitution and the new handicap in one transaction. Every write goes through the audit_log triggers
-- on slot_substitution, match_slot, match and lineup_override.

-- private.match_substitution_state ------------------------------------------------------------------------

-- What the app validated a substitution against: the scores and start points of every slot (they decide
-- which slots can still change and the relay start) and the ids of the match's substitutions so far.
-- Security invoker, like private.match_score_state.
create function private.match_substitution_state(p_match_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'slots', private.match_score_state(p_match_id),
    'substitutions', coalesce(
      (
        select jsonb_agg(ss.id order by ss.id)
        from public.slot_substitution ss
        join public.match_slot s on s.id = ss.match_slot_id
        where s.match_id = p_match_id
      ),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function private.match_substitution_state(uuid) from public, anon;
grant execute on function private.match_substitution_state(uuid) to authenticated;

-- substitute_player ---------------------------------------------------------------------------------------

-- Security invoker, so RLS still applies: the BTC substitutes in any match, a referee only in open ones,
-- and only the BTC can add overrides (lineup_override is BTC-only).
--
-- Replaces p_replaced_id by p_substitute_id on p_side of slot p_slot_no, which has no score yet.
-- Group: p_handicap_home / p_handicap_away are the slot's new start points (relay: pass null).
-- Relay: p_relay_home / p_relay_away are the start of leg 1, recomputed while no leg is scored and kept
-- as they are afterwards (group: pass null).
-- p_override_codes: the rules the BTC accepts the substitution breaking, with p_override_reason. They are
-- added to the team's overrides.
-- p_expected: the private.match_substitution_state the app validated against.
-- Raises P0002 'match not found' when the match or slot is missing or not writable, P0001 'substitutions
-- closed' unless the match is `lineup_locked` or `in_progress`, 22023 when the slot is already scored or
-- the substitute is not in that team, and 40001 'match changed' when another save landed in the meantime
-- (check again and retry).
create function public.substitute_player(
  p_match_id uuid,
  p_slot_no smallint,
  p_side public.match_side,
  p_replaced_id uuid,
  p_substitute_id uuid,
  p_reason text,
  p_expected jsonb,
  p_handicap_home smallint default null,
  p_handicap_away smallint default null,
  p_relay_home smallint default null,
  p_relay_away smallint default null,
  p_override_codes public.lineup_rule_code[] default '{}',
  p_override_reason text default ''
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_match public.match;
  v_team_id uuid;
  v_slot_id uuid;
  v_scored boolean;
begin
  select * into v_match from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if v_match.status not in ('lineup_locked', 'in_progress') then
    raise exception 'substitutions closed' using errcode = 'P0001';
  end if;

  select id, score_home is not null or score_away is not null into v_slot_id, v_scored
  from public.match_slot
  where match_id = p_match_id and slot_no = p_slot_no;
  if not found then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;
  if v_scored then
    raise exception 'slot already scored' using errcode = '22023';
  end if;

  v_team_id := case p_side when 'home' then v_match.home_team_id else v_match.away_team_id end;
  if not exists (
    select 1 from public.season_player
    where id = p_substitute_id and season_id = v_match.season_id and team_id = v_team_id
  ) then
    raise exception 'substitute is not in this team' using errcode = '22023';
  end if;

  if private.match_substitution_state(p_match_id) <> p_expected then
    raise exception 'match changed' using errcode = '40001';
  end if;

  insert into public.slot_substitution (match_slot_id, side, replaced_id, substitute_id, reason)
  values (v_slot_id, p_side, p_replaced_id, p_substitute_id, coalesce(p_reason, ''));

  if v_match.stage = 'group' then
    update public.match_slot
    set handicap_home = p_handicap_home, handicap_away = p_handicap_away
    where id = v_slot_id
      and (handicap_home is distinct from p_handicap_home or handicap_away is distinct from p_handicap_away);
  elsif v_match.relay_handicap_home is distinct from p_relay_home
    or v_match.relay_handicap_away is distinct from p_relay_away then
    update public.match
    set relay_handicap_home = p_relay_home, relay_handicap_away = p_relay_away
    where id = p_match_id;
  end if;

  insert into public.lineup_override (match_id, team_id, rule_code, reason)
  select distinct p_match_id, v_team_id, c, coalesce(p_override_reason, '')
  from unnest(coalesce(p_override_codes, '{}')) as c
  where not exists (
    select 1 from public.lineup_override o
    where o.match_id = p_match_id and o.team_id = v_team_id and o.rule_code = c
  );
end;
$$;

revoke execute on function public.substitute_player(
  uuid, smallint, public.match_side, uuid, uuid, text, jsonb, smallint, smallint, smallint, smallint,
  public.lineup_rule_code[], text
) from public, anon;
grant execute on function public.substitute_player(
  uuid, smallint, public.match_side, uuid, uuid, text, jsonb, smallint, smallint, smallint, smallint,
  public.lineup_rule_code[], text
) to authenticated;

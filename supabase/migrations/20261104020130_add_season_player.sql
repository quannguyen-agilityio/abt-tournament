-- Add one player to a season from the admin form (A2), in one transaction.
-- Security invoker, so RLS still applies and only the BTC can actually write.
--
-- A null p_person_id creates the person (full name, slug, gender); otherwise the existing person is
-- registered, their gender is updated and the stored name and slug are kept (as the CSV import does).
-- The team, when given, must belong to the season. p_paid sets the fee paid date to now.
-- A person already in the season fails with unique_violation (23505) from season_player.
-- Returns the new season player id.

create function public.add_season_player(
  p_season_id uuid,
  p_full_name text,
  p_slug text,
  p_gender public.gender,
  p_rank smallint,
  p_skill_points smallint,
  p_member_type public.member_type,
  p_fee_amount integer,
  p_paid boolean,
  p_person_id uuid default null,
  p_team_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_person_id uuid := p_person_id;
  v_season_player_id uuid;
begin
  if p_team_id is not null
    and not exists (select 1 from public.team where id = p_team_id and season_id = p_season_id) then
    raise exception 'team not in season' using errcode = 'P0002';
  end if;

  if v_person_id is null then
    insert into public.person (full_name, slug, gender)
    values (p_full_name, p_slug, p_gender)
    returning id into v_person_id;
  else
    update public.person set gender = p_gender where id = v_person_id;
    if not found then
      raise exception 'person not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.season_player (season_id, person_id, rank, skill_points, team_id)
  values (p_season_id, v_person_id, p_rank, p_skill_points, p_team_id)
  returning id into v_season_player_id;

  insert into public.season_player_private (season_player_id, member_type, fee_amount, fee_paid_at)
  values (v_season_player_id, p_member_type, p_fee_amount, case when p_paid then now() end);

  return v_season_player_id;
end;
$$;

revoke execute on function public.add_season_player(
  uuid, text, text, public.gender, smallint, smallint, public.member_type, integer, boolean, uuid, uuid
) from public, anon;
grant execute on function public.add_season_player(
  uuid, text, text, public.gender, smallint, smallint, public.member_type, integer, boolean, uuid, uuid
) to authenticated;

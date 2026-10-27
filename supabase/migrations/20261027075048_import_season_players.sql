-- Players CSV import (spec §6, A2): apply a reviewed import plan in one transaction.
-- Security invoker, so RLS still applies and only the BTC can actually write.
--
-- p_rows is a jsonb array built by the app after the BTC reviewed the preview. Each element is
--   { person_id, full_name, slug, gender, rank, skill_points, member_type, fee_amount }
-- A null person_id creates the person (full_name, slug, gender); otherwise the person's gender is
-- updated and the stored name and slug are kept. The season player is then inserted or updated
-- (rank and skill points; status and team are left alone) and its private row is upserted (member
-- type and fee; the paid date is left alone). Any failure rolls the whole import back.
-- Returns the number of rows applied.
create function public.import_season_players(p_season_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_person_id uuid;
  v_season_player_id uuid;
  v_count integer := 0;
begin
  if not exists (select 1 from public.season where id = p_season_id) then
    raise exception 'season not found' using errcode = 'P0002';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_person_id := nullif(v_row ->> 'person_id', '')::uuid;
    if v_person_id is null then
      insert into public.person (full_name, slug, gender)
      values (v_row ->> 'full_name', v_row ->> 'slug', (v_row ->> 'gender')::public.gender)
      returning id into v_person_id;
    else
      update public.person set gender = (v_row ->> 'gender')::public.gender where id = v_person_id;
    end if;

    insert into public.season_player (season_id, person_id, rank, skill_points)
    values (p_season_id, v_person_id, (v_row ->> 'rank')::smallint, (v_row ->> 'skill_points')::smallint)
    on conflict (season_id, person_id)
      do update set rank = excluded.rank, skill_points = excluded.skill_points
    returning id into v_season_player_id;

    insert into public.season_player_private (season_player_id, member_type, fee_amount)
    values (v_season_player_id, (v_row ->> 'member_type')::public.member_type, (v_row ->> 'fee_amount')::integer)
    on conflict (season_player_id)
      do update set member_type = excluded.member_type, fee_amount = excluded.fee_amount;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.import_season_players(uuid, jsonb) from public, anon;
grant execute on function public.import_season_players(uuid, jsonb) to authenticated;

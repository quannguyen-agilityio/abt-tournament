-- Row Level Security policies (spec §3.2): anon reads public data, a referee also reads lineups and
-- writes match data until the match is completed or forfeit, and the BTC can do everything.
-- Lineups stay hidden from the public until the match is lineup_locked (A6).
-- The service role bypasses RLS and is used only by server actions after a BTC check.

-- Helpers ---------------------------------------------------------------------------------------------
-- Security definer so that policies can look up profile, season and match without going through
-- (and recursing into) their own policies. The schema is not exposed by the API.

create schema private;

grant usage on schema private to anon, authenticated;

-- Role of the signed-in user, or null for anon and deactivated accounts.
create function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profile where user_id = auth.uid() and is_active;
$$;

create function private.is_btc()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.current_user_role() = 'btc', false);
$$;

create function private.is_referee()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.current_user_role() = 'referee', false);
$$;

-- Draft seasons and everything in them are visible only to the BTC.
create function private.season_is_public(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select status <> 'draft' from public.season where id = p_season_id), false);
$$;

create function private.match_is_public(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select s.status <> 'draft'
      from public.match m
      join public.season s on s.id = m.season_id
      where m.id = p_match_id
    ),
    false
  );
$$;

-- Lineups are public once the match is lineup_locked or later (A6). An annulled match keeps the
-- status it had before, so a lineup that was never locked stays hidden.
create function private.lineup_is_public(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select s.status <> 'draft'
        and m.status <> 'scheduled'
        and m.status_before_annul is distinct from 'scheduled'
      from public.match m
      join public.season s on s.id = m.season_id
      where m.id = p_match_id
    ),
    false
  );
$$;

-- A referee can write a match and its attendance, slots and substitutions until it is completed or
-- forfeit.
create function private.match_is_open(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select s.status <> 'draft' and m.status not in ('completed', 'forfeit')
      from public.match m
      join public.season s on s.id = m.season_id
      where m.id = p_match_id
    ),
    false
  );
$$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated;

-- BTC: everything -------------------------------------------------------------------------------------

create policy "btc can do everything" on public.person
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.season
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.court
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.team
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.season_player
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.season_player_private
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.profile
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.match
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.match_attendance
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.match_slot
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.slot_substitution
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.lineup_override
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.group_closure
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.award
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.award_winner
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));
create policy "btc can do everything" on public.award_winner_member
  for all to authenticated
  using ((select private.is_btc())) with check ((select private.is_btc()));

-- The log is written only by its trigger (audit_log migration), so the BTC can only read it.
create policy "btc can read" on public.audit_log
  for select to authenticated
  using ((select private.is_btc()));

-- Public read -----------------------------------------------------------------------------------------

create policy "anyone can read" on public.person
  for select to anon, authenticated
  using (true);
create policy "anyone can read non-draft seasons" on public.season
  for select to anon, authenticated
  using (status <> 'draft');
create policy "anyone can read in non-draft seasons" on public.court
  for select to anon, authenticated
  using (private.season_is_public(season_id));
create policy "anyone can read in non-draft seasons" on public.team
  for select to anon, authenticated
  using (private.season_is_public(season_id));
create policy "anyone can read in non-draft seasons" on public.season_player
  for select to anon, authenticated
  using (private.season_is_public(season_id));
create policy "anyone can read in non-draft seasons" on public.group_closure
  for select to anon, authenticated
  using (private.season_is_public(season_id));
create policy "anyone can read in non-draft seasons" on public.award
  for select to anon, authenticated
  using (private.season_is_public(season_id));
-- Visible when the parent row is (its own policy decides).
create policy "anyone can read with the award" on public.award_winner
  for select to anon, authenticated
  using (exists (select 1 from public.award a where a.id = award_id));
create policy "anyone can read with the award winner" on public.award_winner_member
  for select to anon, authenticated
  using (exists (select 1 from public.award_winner w where w.id = award_winner_id));

-- Every match in a non-draft season, including upcoming ones (the public schedule, P3).
create policy "anyone can read in non-draft seasons" on public.match
  for select to anon, authenticated
  using (private.season_is_public(season_id));
-- Lineups and scores once the lineup is locked (A6).
create policy "anyone can read locked lineups" on public.match_slot
  for select to anon, authenticated
  using (private.lineup_is_public(match_id));
create policy "anyone can read with the slot" on public.slot_substitution
  for select to anon, authenticated
  using (exists (select 1 from public.match_slot s where s.id = match_slot_id));

-- Referee ---------------------------------------------------------------------------------------------

create policy "users can read their own profile" on public.profile
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "referee can read" on public.match_attendance
  for select to authenticated
  using ((select private.is_referee()) and private.match_is_public(match_id));
create policy "referee can read" on public.match_slot
  for select to authenticated
  using ((select private.is_referee()) and private.match_is_public(match_id));

-- A referee updates a match (status, results) but does not create or delete one. Forfeit and
-- annulment are BTC actions (spec §4.5).
create policy "referee can update open matches" on public.match
  for update to authenticated
  using ((select private.is_referee()) and private.match_is_open(id))
  with check (
    (select private.is_referee())
    and private.season_is_public(season_id)
    and status not in ('forfeit', 'annulled')
  );

create policy "referee can write open matches" on public.match_attendance
  for insert to authenticated
  with check ((select private.is_referee()) and private.match_is_open(match_id));
create policy "referee can update open matches" on public.match_attendance
  for update to authenticated
  using ((select private.is_referee()) and private.match_is_open(match_id))
  with check ((select private.is_referee()) and private.match_is_open(match_id));
create policy "referee can delete open matches" on public.match_attendance
  for delete to authenticated
  using ((select private.is_referee()) and private.match_is_open(match_id));

create policy "referee can write open matches" on public.match_slot
  for insert to authenticated
  with check ((select private.is_referee()) and private.match_is_open(match_id));
create policy "referee can update open matches" on public.match_slot
  for update to authenticated
  using ((select private.is_referee()) and private.match_is_open(match_id))
  with check ((select private.is_referee()) and private.match_is_open(match_id));
create policy "referee can delete open matches" on public.match_slot
  for delete to authenticated
  using ((select private.is_referee()) and private.match_is_open(match_id));

create policy "referee can write open matches" on public.slot_substitution
  for insert to authenticated
  with check (
    (select private.is_referee())
    and exists (
      select 1 from public.match_slot s
      where s.id = match_slot_id and private.match_is_open(s.match_id)
    )
  );
create policy "referee can update open matches" on public.slot_substitution
  for update to authenticated
  using (
    (select private.is_referee())
    and exists (
      select 1 from public.match_slot s
      where s.id = match_slot_id and private.match_is_open(s.match_id)
    )
  )
  with check (
    (select private.is_referee())
    and exists (
      select 1 from public.match_slot s
      where s.id = match_slot_id and private.match_is_open(s.match_id)
    )
  );
create policy "referee can delete open matches" on public.slot_substitution
  for delete to authenticated
  using (
    (select private.is_referee())
    and exists (
      select 1 from public.match_slot s
      where s.id = match_slot_id and private.match_is_open(s.match_id)
    )
  );

-- Referee names for the public match page (P4) ----------------------------------------------------------
-- profile is not public, so this view exposes only the display name of users assigned as referee to
-- a match in a non-draft season. It runs with the owner's rights (no security_invoker) on purpose.

create view public.referee_name as
  select p.user_id, p.display_name
  from public.profile p
  where exists (
    select 1
    from public.match m
    join public.season s on s.id = m.season_id
    where m.referee_id = p.user_id and s.status <> 'draft'
  );

revoke all on public.referee_name from anon, authenticated;
grant select on public.referee_name to anon, authenticated;

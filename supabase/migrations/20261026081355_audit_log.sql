-- Audit log (spec §3.1): one row per insert, update or delete on the audited tables, written by a
-- generic trigger. Results and lineups are audited (spec §8).
-- Row Level Security is enabled with no policies yet (BTC-only read, spec §3.2).

create type public.audit_action as enum ('insert', 'update', 'delete');

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  -- auth.uid() of the writer; null for the service role and migrations. Kept if the user is deleted.
  actor_id uuid references auth.users (id) on delete set null,
  -- Table name, e.g. 'match_slot'.
  entity text not null,
  entity_id uuid not null,
  action public.audit_action not null,
  -- Whole row before and after the change; null on insert and delete respectively.
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id, at desc);
create index audit_log_actor_id_idx on public.audit_log (actor_id);
create index audit_log_at_idx on public.audit_log (at desc);

alter table public.audit_log enable row level security;

-- The log is append-only for API users; only this trigger writes to it.
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

-- Security definer so that a write by a referee is logged even though they cannot write to
-- audit_log themselves.
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, entity, entity_id, action, after)
    values (auth.uid(), tg_table_name, new.id, 'insert', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    -- Skip updates that change nothing but updated_at.
    if to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then
      return null;
    end if;
    insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
    values (auth.uid(), tg_table_name, new.id, 'update', to_jsonb(old), to_jsonb(new));
  else
    insert into public.audit_log (actor_id, entity, entity_id, action, before)
    values (auth.uid(), tg_table_name, old.id, 'delete', to_jsonb(old));
  end if;
  return null;
end;
$$;

revoke execute on function public.audit_row_change() from public, anon, authenticated;

create trigger match_audit after insert or update or delete on public.match
  for each row execute function public.audit_row_change();
create trigger match_slot_audit after insert or update or delete on public.match_slot
  for each row execute function public.audit_row_change();
create trigger match_attendance_audit after insert or update or delete on public.match_attendance
  for each row execute function public.audit_row_change();
create trigger slot_substitution_audit after insert or update or delete on public.slot_substitution
  for each row execute function public.audit_row_change();
create trigger lineup_override_audit after insert or update or delete on public.lineup_override
  for each row execute function public.audit_row_change();
create trigger group_closure_audit after insert or update or delete on public.group_closure
  for each row execute function public.audit_row_change();
create trigger award_winner_audit after insert or update or delete on public.award_winner
  for each row execute function public.audit_row_change();
create trigger season_player_audit after insert or update or delete on public.season_player
  for each row execute function public.audit_row_change();
create trigger season_player_private_audit after insert or update or delete
  on public.season_player_private
  for each row execute function public.audit_row_change();

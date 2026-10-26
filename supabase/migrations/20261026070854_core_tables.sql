-- Core tables (spec §3.1): person, season, court, team, season_player, season_player_private, profile.
-- Row Level Security is enabled on every table with no policies yet, so only the service role can
-- read or write until the policies land (spec §3.2).

-- Enums ---------------------------------------------------------------------------------------------

create type public.gender as enum ('male', 'female');
create type public.season_status as enum ('draft', 'published', 'group', 'knockout', 'finished');
create type public.season_player_status as enum ('active', 'withdrawn');
create type public.member_type as enum ('employee', 'intern', 'guest');
create type public.user_role as enum ('btc', 'referee');

-- updated_at ----------------------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- person: one human across seasons --------------------------------------------------------------------

create table public.person (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (full_name <> ''),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  gender public.gender not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- season ----------------------------------------------------------------------------------------------

create table public.season (
  id uuid primary key default gen_random_uuid(),
  year integer not null unique,
  name text not null check (name <> ''),
  venue text not null default '',
  status public.season_status not null default 'draft',
  is_current boolean not null default false,
  -- All season parameters (spec §2), validated by the Zod schema in the app.
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  match_days date[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one current season. "Exactly one" once a season exists is kept by switching the flag in
-- one transaction (unset the old row, then set the new one).
create unique index season_single_current_idx on public.season (is_current) where is_current;

-- court -----------------------------------------------------------------------------------------------

create table public.court (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.season (id),
  name text not null check (name <> ''),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index court_season_id_idx on public.court (season_id);

-- team ------------------------------------------------------------------------------------------------

create table public.team (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.season (id),
  name text not null check (name <> ''),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text,
  -- FK to season_player is added below, after that table exists.
  captain_id uuid,
  disqualified_at timestamptz,
  disqualified_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index team_season_id_idx on public.team (season_id);

-- season_player: a person's registration in a season (public) -----------------------------------------

create table public.season_player (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.season (id),
  person_id uuid not null references public.person (id),
  -- Null until the draw is imported.
  team_id uuid references public.team (id),
  -- Upper bound is the season's max_rank setting, checked in the app.
  rank smallint not null check (rank >= 1),
  skill_points smallint not null check (skill_points >= 0),
  status public.season_player_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, person_id)
);

create index season_player_person_id_idx on public.season_player (person_id);
create index season_player_team_id_idx on public.season_player (team_id);

alter table public.team
  add constraint team_captain_id_fkey foreign key (captain_id) references public.season_player (id);

create index team_captain_id_idx on public.team (captain_id);

-- season_player_private: fee and member type (admin-only) ---------------------------------------------

create table public.season_player_private (
  id uuid primary key default gen_random_uuid(),
  season_player_id uuid not null unique references public.season_player (id),
  member_type public.member_type not null,
  -- VND
  fee_amount integer not null check (fee_amount >= 0),
  fee_paid_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- profile: app data for an auth user (1:1 auth.users) -------------------------------------------------

create table public.profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (display_name <> ''),
  role public.user_role not null,
  must_change_password boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Triggers and RLS ------------------------------------------------------------------------------------

create trigger person_set_updated_at before update on public.person
  for each row execute function public.set_updated_at();
create trigger season_set_updated_at before update on public.season
  for each row execute function public.set_updated_at();
create trigger court_set_updated_at before update on public.court
  for each row execute function public.set_updated_at();
create trigger team_set_updated_at before update on public.team
  for each row execute function public.set_updated_at();
create trigger season_player_set_updated_at before update on public.season_player
  for each row execute function public.set_updated_at();
create trigger season_player_private_set_updated_at before update on public.season_player_private
  for each row execute function public.set_updated_at();
create trigger profile_set_updated_at before update on public.profile
  for each row execute function public.set_updated_at();

alter table public.person enable row level security;
alter table public.season enable row level security;
alter table public.court enable row level security;
alter table public.team enable row level security;
alter table public.season_player enable row level security;
alter table public.season_player_private enable row level security;
alter table public.profile enable row level security;

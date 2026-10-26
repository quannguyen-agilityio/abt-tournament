-- Match flow and award tables (spec §3.1): match, match_attendance, match_slot, slot_substitution,
-- lineup_override, group_closure, award, award_winner, award_winner_member.
-- Row Level Security is enabled on every table with no policies yet, so only the service role can
-- read or write until the policies land (spec §3.2).

-- Enums ---------------------------------------------------------------------------------------------

create type public.match_stage as enum ('group', 'semi_final', 'third_place', 'final');
create type public.match_status as enum (
  'scheduled', 'lineup_locked', 'in_progress', 'completed', 'forfeit', 'annulled'
);
create type public.slot_type as enum ('open', 'low', 'high');
create type public.match_side as enum ('home', 'away');
-- Violation codes of validateLineup (spec §4.1).
create type public.lineup_rule_code as enum (
  'SLOT_INCOMPLETE', 'NOT_PRESENT', 'MIN_SETS', 'MAX_SETS', 'CONSECUTIVE',
  'LOW_RANK_SLOT', 'HIGH_RANK_SLOT', 'COMPENSATION', 'MIN_PRESENT', 'SUB_RANK'
);
create type public.award_winner_kind as enum ('player', 'pair', 'team');

-- match -----------------------------------------------------------------------------------------------

create table public.match (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.season (id),
  code text not null check (code ~ '^(V[0-9]{2}|SF[12]|3RD|F)$'),
  stage public.match_stage not null,
  -- Round-robin round number.
  round smallint check (round >= 1),
  -- Null for bracket slots not yet decided.
  home_team_id uuid references public.team (id),
  away_team_id uuid references public.team (id),
  scheduled_at timestamptz,
  court_id uuid references public.court (id),
  referee_id uuid references public.profile (user_id),
  status public.match_status not null default 'scheduled',
  -- Set when the match is annulled, so that "Reinstate" can restore it (spec §4.5).
  status_before_annul public.match_status check (status_before_annul <> 'annulled'),
  -- The team that loses by forfeit.
  forfeit_team_id uuid references public.team (id),
  forfeit_reason text,
  -- Relay only: start-of-leg-1 points, snapshot at lock time (spec §4.3).
  relay_handicap_home smallint check (relay_handicap_home >= 0),
  relay_handicap_away smallint check (relay_handicap_away >= 0),
  -- Derived on completion, stored for queries.
  winner_team_id uuid references public.team (id),
  -- True for 2026 data: lineup and handicap checks are skipped and scores are stored as recorded.
  imported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, code),
  check (home_team_id <> away_team_id),
  check ((status = 'annulled') = (status_before_annul is not null)),
  check (status <> 'forfeit' or forfeit_team_id is not null),
  check (forfeit_team_id is null or forfeit_team_id in (home_team_id, away_team_id)),
  check (winner_team_id is null or winner_team_id in (home_team_id, away_team_id)),
  check (stage <> 'group' or (relay_handicap_home is null and relay_handicap_away is null))
);

create index match_home_team_id_idx on public.match (home_team_id);
create index match_away_team_id_idx on public.match (away_team_id);
create index match_court_id_idx on public.match (court_id);
create index match_referee_id_idx on public.match (referee_id);
create index match_forfeit_team_id_idx on public.match (forfeit_team_id);
create index match_winner_team_id_idx on public.match (winner_team_id);

-- match_attendance: players present for a match; they drive the lineup rules -------------------------

create table public.match_attendance (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.match (id),
  team_id uuid not null references public.team (id),
  season_player_id uuid not null references public.season_player (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, season_player_id)
);

create index match_attendance_team_id_idx on public.match_attendance (team_id);
create index match_attendance_season_player_id_idx on public.match_attendance (season_player_id);

-- match_slot: one row per set (group) or leg (relay) ------------------------------------------------

create table public.match_slot (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.match (id),
  slot_no smallint not null check (slot_no between 1 and 5),
  -- Copied from the season settings at creation.
  slot_type public.slot_type not null,
  -- As registered on the lineup sheet; substitutions are applied on top (slot_substitution).
  home_p1 uuid references public.season_player (id),
  home_p2 uuid references public.season_player (id),
  away_p1 uuid references public.season_player (id),
  away_p2 uuid references public.season_player (id),
  -- Group: start points for this set. Relay: 0, see match.relay_handicap_* (imported 2026 relay
  -- legs keep their per-leg values here). Snapshot at lock; recomputed on substitution.
  handicap_home smallint not null default 0 check (handicap_home >= 0),
  handicap_away smallint not null default 0 check (handicap_away >= 0),
  -- Group: final set score. Relay: cumulative scoreboard at the end of this leg.
  score_home smallint check (score_home >= 0),
  score_away smallint check (score_away >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, slot_no),
  check (home_p1 <> home_p2),
  check (away_p1 <> away_p2),
  -- Only the weaker side gets a start.
  check (handicap_home = 0 or handicap_away = 0)
);

create index match_slot_home_p1_idx on public.match_slot (home_p1);
create index match_slot_home_p2_idx on public.match_slot (home_p2);
create index match_slot_away_p1_idx on public.match_slot (away_p1);
create index match_slot_away_p2_idx on public.match_slot (away_p2);

-- slot_substitution -----------------------------------------------------------------------------------

create table public.slot_substitution (
  id uuid primary key default gen_random_uuid(),
  match_slot_id uuid not null references public.match_slot (id),
  side public.match_side not null,
  replaced_id uuid not null references public.season_player (id),
  substitute_id uuid not null references public.season_player (id),
  reason text not null default '',
  created_by uuid references public.profile (user_id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (replaced_id <> substitute_id)
);

create index slot_substitution_match_slot_id_idx on public.slot_substitution (match_slot_id);
create index slot_substitution_replaced_id_idx on public.slot_substitution (replaced_id);
create index slot_substitution_substitute_id_idx on public.slot_substitution (substitute_id);
create index slot_substitution_created_by_idx on public.slot_substitution (created_by);

-- lineup_override: the BTC accepted a lineup with a rule violation ------------------------------------

create table public.lineup_override (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.match (id),
  team_id uuid not null references public.team (id),
  rule_code public.lineup_rule_code not null,
  reason text not null check (reason <> ''),
  created_by uuid references public.profile (user_id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lineup_override_match_id_idx on public.lineup_override (match_id);
create index lineup_override_team_id_idx on public.lineup_override (team_id);
create index lineup_override_created_by_idx on public.lineup_override (created_by);

-- group_closure: final group order, one per season ------------------------------------------------------

create table public.group_closure (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique references public.season (id),
  -- Team ids, first place first.
  final_order uuid[] not null check (cardinality(final_order) >= 1),
  -- Draw orders the BTC decided by hand where the tie-breaks could not split teams (spec §4.6).
  manual_draws jsonb not null default '{}'::jsonb,
  closed_by uuid references public.profile (user_id) default auth.uid(),
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index group_closure_closed_by_idx on public.group_closure (closed_by);

-- award: side awards ------------------------------------------------------------------------------------

create table public.award (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.season (id),
  sort_order smallint not null default 0,
  name_vi text not null check (name_vi <> ''),
  name_en text,
  criteria_vi text not null default '',
  criteria_en text,
  sponsor text,
  value_vnd integer check (value_vnd >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index award_season_id_idx on public.award (season_id);

-- award_winner ------------------------------------------------------------------------------------------

create table public.award_winner (
  id uuid primary key default gen_random_uuid(),
  award_id uuid not null references public.award (id),
  -- Members: 1 for a player, 2 for a pair (award_winner_member), checked in the app.
  kind public.award_winner_kind not null,
  team_id uuid references public.team (id),
  match_id uuid references public.match (id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'team' or team_id is not null)
);

create index award_winner_award_id_idx on public.award_winner (award_id);
create index award_winner_team_id_idx on public.award_winner (team_id);
create index award_winner_match_id_idx on public.award_winner (match_id);

-- award_winner_member -----------------------------------------------------------------------------------

create table public.award_winner_member (
  id uuid primary key default gen_random_uuid(),
  award_winner_id uuid not null references public.award_winner (id),
  season_player_id uuid not null references public.season_player (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (award_winner_id, season_player_id)
);

create index award_winner_member_season_player_id_idx
  on public.award_winner_member (season_player_id);

-- Triggers and RLS ------------------------------------------------------------------------------------

create trigger match_set_updated_at before update on public.match
  for each row execute function public.set_updated_at();
create trigger match_attendance_set_updated_at before update on public.match_attendance
  for each row execute function public.set_updated_at();
create trigger match_slot_set_updated_at before update on public.match_slot
  for each row execute function public.set_updated_at();
create trigger slot_substitution_set_updated_at before update on public.slot_substitution
  for each row execute function public.set_updated_at();
create trigger lineup_override_set_updated_at before update on public.lineup_override
  for each row execute function public.set_updated_at();
create trigger group_closure_set_updated_at before update on public.group_closure
  for each row execute function public.set_updated_at();
create trigger award_set_updated_at before update on public.award
  for each row execute function public.set_updated_at();
create trigger award_winner_set_updated_at before update on public.award_winner
  for each row execute function public.set_updated_at();
create trigger award_winner_member_set_updated_at before update on public.award_winner_member
  for each row execute function public.set_updated_at();

alter table public.match enable row level security;
alter table public.match_attendance enable row level security;
alter table public.match_slot enable row level security;
alter table public.slot_substitution enable row level security;
alter table public.lineup_override enable row level security;
alter table public.group_closure enable row level security;
alter table public.award enable row level security;
alter table public.award_winner enable row level security;
alter table public.award_winner_member enable row level security;

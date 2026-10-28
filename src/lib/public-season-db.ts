import 'server-only';

import { connection } from 'next/server';
import { cache } from 'react';

import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings, type SeasonSettings } from '@/domain/settings';
import type { Database } from '@/lib/database.types';
import type { MatchDetailInput, MatchPlayer } from '@/lib/public-match';
import type { ScheduleMatchInput } from '@/lib/public-matches';
import type { PublicTeam } from '@/lib/public-standings';
import { createClient } from '@/lib/supabase/server';

export interface PublicSeason {
  id: string;
  year: number;
  name: string;
  status: Database['public']['Enums']['season_status'];
  settings: SeasonSettings;
  matchDays: string[];
}

/** A match with its court name and slot scores, as the public pages read it. */
export interface SeasonMatch {
  id: string;
  code: string;
  stage: Database['public']['Enums']['match_stage'];
  status: Database['public']['Enums']['match_status'];
  home_team_id: string | null;
  away_team_id: string | null;
  forfeit_team_id: string | null;
  forfeit_reason: string | null;
  scheduled_at: string | null;
  winner_team_id: string | null;
  court: string | null;
  slots: { slot_no: number; score_home: number | null; score_away: number | null }[];
}

// Each reads the session cookies, which is request-time data under cacheComponents.

/** The season of `year`, or null when it does not exist or RLS hides it (a draft). */
export const getPublicSeason = cache(async (year: number): Promise<PublicSeason | null> => {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('season')
    .select('id, year, name, status, settings, match_days')
    .eq('year', year)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const parsed = parseSeasonSettings(data.settings);
  return {
    id: data.id,
    year: data.year,
    name: data.name,
    status: data.status,
    settings: parsed.ok ? parsed.settings : DEFAULT_SEASON_SETTINGS,
    matchDays: data.match_days,
  };
});

export const getSeasonTeams = cache(async (seasonId: string): Promise<PublicTeam[]> => {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('team')
    .select('id, name, color, disqualified_at, disqualified_reason')
    .eq('season_id', seasonId)
    .order('name');
  if (error) throw error;
  return data.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    disqualified: t.disqualified_at !== null,
    disqualifiedReason: t.disqualified_reason,
  }));
});

/** The final team order fixed when the group closed, or null while it is open. */
export const getGroupClosure = cache(async (seasonId: string): Promise<string[] | null> => {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('group_closure')
    .select('final_order')
    .eq('season_id', seasonId)
    .maybeSingle();
  if (error) throw error;
  return data ? data.final_order : null;
});

/** Group matches, or every knock-out match (semi-finals, third place, final). */
export const getSeasonMatches = cache(async (seasonId: string, stage: 'group' | 'knockout'): Promise<SeasonMatch[]> => {
  await connection();
  const supabase = await createClient();
  const query = supabase
    .from('match')
    .select(
      'id, code, stage, status, home_team_id, away_team_id, forfeit_team_id, forfeit_reason, scheduled_at, winner_team_id, court(name), match_slot(slot_no, score_home, score_away)',
    )
    .eq('season_id', seasonId);
  const { data, error } = await (stage === 'group' ? query.eq('stage', 'group') : query.neq('stage', 'group'));
  if (error) throw error;
  return data.map(({ court, match_slot: slots, ...match }) => ({
    ...match,
    court: court?.name ?? null,
    slots: [...slots].sort((a, b) => a.slot_no - b.slot_no),
  }));
});

export const getSeasonCourts = cache(async (seasonId: string): Promise<{ id: string; name: string }[]> => {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.from('court').select('id, name').eq('season_id', seasonId).order('sort_order');
  if (error) throw error;
  return data;
});

/** Every match of the season with only what a schedule card needs, to keep the P3 payload small. */
export const getSeasonSchedule = cache(async (seasonId: string): Promise<ScheduleMatchInput[]> => {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('match')
    .select(
      'id, code, stage, round, status, home_team_id, away_team_id, forfeit_team_id, winner_team_id, scheduled_at, court_id, match_slot(slot_no, score_home, score_away)',
    )
    .eq('season_id', seasonId);
  if (error) throw error;
  return data.map(({ match_slot: slots, ...match }) => ({ ...match, slots }));
});

export interface MatchDetail extends MatchDetailInput {
  court: string | null;
  referee: string | null;
  players: Map<string, MatchPlayer>;
}

/**
 * One match of the season by code, with its slots, substitutions, the players they name and the
 * referee's display name. RLS returns no slots until the lineup is public (A6).
 */
export const getMatchDetail = cache(async (seasonId: string, code: string): Promise<MatchDetail | null> => {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('match')
    .select(
      `id, code, stage, round, status, status_before_annul, home_team_id, away_team_id, forfeit_team_id,
      forfeit_reason, winner_team_id, scheduled_at, referee_id, relay_handicap_home, relay_handicap_away,
      court(name),
      match_slot(slot_no, slot_type, home_p1, home_p2, away_p1, away_p2, handicap_home, handicap_away,
        score_home, score_away, slot_substitution(side, replaced_id, substitute_id, reason, created_at))`,
    )
    .eq('season_id', seasonId)
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { court, referee_id: refereeId, match_slot: rows, ...match } = data;
  const slots = rows.map(({ slot_substitution: subs, ...slot }) => ({
    ...slot,
    substitutions: [...subs]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(({ side, replaced_id, substitute_id, reason }) => ({ side, replaced_id, substitute_id, reason })),
  }));
  const ids = [
    ...new Set(
      slots.flatMap((s) => [
        s.home_p1,
        s.home_p2,
        s.away_p1,
        s.away_p2,
        ...s.substitutions.flatMap((sub) => [sub.replaced_id, sub.substitute_id]),
      ]),
    ),
  ].filter((id): id is string => id !== null);

  const [players, referee] = await Promise.all([
    ids.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('season_player').select('id, rank, skill_points, person(full_name, slug)').in('id', ids),
    refereeId
      ? supabase.from('referee_name').select('display_name').eq('user_id', refereeId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (players.error) throw players.error;
  if (referee.error) throw referee.error;

  return {
    ...match,
    slots,
    court: court?.name ?? null,
    referee: referee.data?.display_name ?? null,
    players: new Map(
      players.data.map((p) => [
        p.id,
        { id: p.id, name: p.person.full_name, slug: p.person.slug, rank: p.rank, skill: p.skill_points },
      ]),
    ),
  };
});

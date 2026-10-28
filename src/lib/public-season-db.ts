import 'server-only';

import { connection } from 'next/server';
import { cache } from 'react';

import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings, type SeasonSettings } from '@/domain/settings';
import type { Database } from '@/lib/database.types';
import type { PublicTeam } from '@/lib/public-standings';
import { createClient } from '@/lib/supabase/server';

export interface PublicSeason {
  id: string;
  year: number;
  name: string;
  status: Database['public']['Enums']['season_status'];
  settings: SeasonSettings;
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
    .select('id, year, name, status, settings')
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

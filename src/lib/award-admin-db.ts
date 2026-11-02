import 'server-only';

import type { AwardFields, WinnerContext } from '@/lib/award-admin';
import type { AwardWinnerKind } from '@/lib/public-awards';
import { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AdminAwardWinner = {
  id: string;
  kind: AwardWinnerKind;
  note: string | null;
  created_at: string;
  team: { id: string; name: string; color: string } | null;
  match: { id: string; code: string } | null;
  members: { id: string; name: string }[];
};

export type AdminAward = AwardFields & { id: string; sort_order: number; winners: AdminAwardWinner[] };

/** The season's awards in the BTC's order, with every field and their winners, through the session. */
export async function loadSeasonAwards(supabase: Supabase, seasonId: string): Promise<AdminAward[]> {
  const { data, error } = await supabase
    .from('award')
    .select(
      `id, sort_order, name_vi, name_en, criteria_vi, criteria_en, sponsor, value_vnd, note,
      award_winner(id, kind, note, created_at, team(id, name, color), match(id, code),
        award_winner_member(season_player(id, person(full_name))))`,
    )
    .eq('season_id', seasonId)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return data.map(({ award_winner: winners, ...award }) => ({
    ...award,
    winners: winners
      .map(({ award_winner_member: members, ...winner }) => ({
        ...winner,
        members: members
          .map(({ season_player: p }) => ({ id: p.id, name: p.person.full_name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}

/** What a new winner of a season's award is checked against (`parseWinnerForm`). */
export async function loadWinnerContext(supabase: Supabase, seasonId: string): Promise<WinnerContext> {
  const [players, teams, matches] = await Promise.all([
    supabase.from('season_player').select('id, team_id').eq('season_id', seasonId),
    supabase.from('team').select('id').eq('season_id', seasonId),
    supabase.from('match').select('id, home_team_id, away_team_id').eq('season_id', seasonId),
  ]);
  if (players.error) throw players.error;
  if (teams.error) throw teams.error;
  if (matches.error) throw matches.error;
  return {
    players: new Map(players.data.map((p) => [p.id, p.team_id])),
    teamIds: new Set(teams.data.map((t) => t.id)),
    matches: matches.data,
  };
}

import 'server-only';

import type { DisqualificationMatch } from '@/lib/match-disqualification';
import { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * What the disqualify and reinstate rules read for a season, through the caller's session: the
 * matches of the given teams, whether the group stage is closed and which teams are disqualified.
 */
export async function loadDisqualificationState(supabase: Supabase, seasonId: string, teamIds: readonly string[]) {
  const ids = teamIds.join(',');
  const [matchesResult, closureResult, teamsResult] = await Promise.all([
    supabase
      .from('match')
      .select('id, code, stage, status, status_before_annul, home_team_id, away_team_id')
      .eq('season_id', seasonId)
      .or(`home_team_id.in.(${ids}),away_team_id.in.(${ids})`),
    supabase.from('group_closure').select('id').eq('season_id', seasonId).maybeSingle(),
    supabase.from('team').select('id').eq('season_id', seasonId).not('disqualified_at', 'is', null),
  ]);
  if (matchesResult.error) throw matchesResult.error;
  if (closureResult.error) throw closureResult.error;
  if (teamsResult.error) throw teamsResult.error;
  return {
    // A check constraint keeps status_before_annul from being `annulled`; this narrows the type.
    matches: matchesResult.data.map((m): DisqualificationMatch => ({
      ...m,
      status_before_annul: m.status_before_annul === 'annulled' ? null : m.status_before_annul,
    })),
    groupClosed: closureResult.data !== null,
    disqualifiedTeamIds: teamsResult.data.map((t) => t.id),
  };
}

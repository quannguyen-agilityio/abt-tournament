'use server';

import { requireBtc } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import { invalidatePublicData } from '@/lib/public-cache';
import { parseBoardChanges, type BoardChanges } from '@/lib/team-board';
import { parseTeamForm, type TeamFormError } from '@/lib/teams';
import { createClient } from '@/lib/supabase/server';

export type TeamFormState = { ok: true } | { ok: false; errors: TeamFormError[] } | { error: 'failed' } | undefined;
export type TeamActionState = { ok: true } | { error: 'notEmpty' | 'inUse' | 'failed' } | undefined;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** True when the team exists and belongs to the season: a form could be tampered with. */
async function teamInSeason(supabase: Supabase, teamId: string, seasonId: string): Promise<boolean> {
  const { data } = await supabase.from('team').select('id').eq('id', teamId).eq('season_id', seasonId).maybeSingle();
  return !!data;
}

export async function createTeam(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  if (!isUuid(seasonId)) return { error: 'failed' };
  const parsed = parseTeamForm(formData);
  if (!parsed.ok) return parsed;

  // The user session, not the service role: RLS lets the BTC write and nobody else.
  const supabase = await createClient();
  const { error } = await supabase.from('team').insert({ season_id: seasonId, ...parsed.value });
  if (error) return { error: 'failed' };

  invalidatePublicData();
  return { ok: true };
}

export async function updateTeam(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const teamId = String(formData.get('teamId') ?? '');
  if (!isUuid(seasonId) || !isUuid(teamId)) return { error: 'failed' };
  const parsed = parseTeamForm(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('team')
    .update(parsed.value)
    .eq('id', teamId)
    .eq('season_id', seasonId)
    .select('id');
  if (error || data.length === 0) return { error: 'failed' };

  invalidatePublicData();
  return { ok: true };
}

/** Only a team without players can be deleted; one that has matches is kept by its foreign keys. */
export async function deleteTeam(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const teamId = String(formData.get('teamId') ?? '');
  if (!isUuid(seasonId) || !isUuid(teamId)) return { error: 'failed' };

  const supabase = await createClient();
  if (!(await teamInSeason(supabase, teamId, seasonId))) return { error: 'failed' };
  const { count, error: countError } = await supabase
    .from('season_player')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId);
  if (countError) return { error: 'failed' };
  if (count) return { error: 'notEmpty' };

  const { error } = await supabase.from('team').delete().eq('id', teamId);
  if (error) return { error: error.code === '23503' ? 'inUse' : 'failed' };

  invalidatePublicData();
  return { ok: true };
}

/**
 * Saves the team board draft: every move and chosen captain in one request and one transaction
 * (save_team_board), so a failure changes nothing and the board keeps the draft.
 */
export async function saveTeamBoard(seasonId: string, changes: BoardChanges): Promise<TeamActionState> {
  await requireBtc();
  // Arguments come from the client as they are: check them again.
  const parsed = parseBoardChanges(changes);
  if (typeof seasonId !== 'string' || !isUuid(seasonId) || !parsed) return { error: 'failed' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('save_team_board', {
    p_season_id: seasonId,
    p_moves: parsed.moves.map((m) => ({ season_player_id: m.seasonPlayerId, team_id: m.teamId })),
    p_captains: parsed.captains.map((c) => ({ team_id: c.teamId, season_player_id: c.seasonPlayerId })),
  });
  if (error) return { error: 'failed' };

  invalidatePublicData();
  return { ok: true };
}

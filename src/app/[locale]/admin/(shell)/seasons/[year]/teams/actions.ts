'use server';

import { refresh } from 'next/cache';

import { requireBtc } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
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

  refresh();
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

  refresh();
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

  refresh();
  return { ok: true };
}

/** Moves a player to a team of the same season, or out of every team when `teamId` is empty. */
export async function moveTeamPlayer(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const seasonPlayerId = String(formData.get('seasonPlayerId') ?? '');
  const teamId = String(formData.get('teamId') ?? '');
  if (!isUuid(seasonId) || !isUuid(seasonPlayerId) || (teamId !== '' && !isUuid(teamId))) return { error: 'failed' };

  const supabase = await createClient();
  if (teamId && !(await teamInSeason(supabase, teamId, seasonId))) return { error: 'failed' };
  // Captains follow from the season_player trigger.
  const { data, error } = await supabase
    .from('season_player')
    .update({ team_id: teamId || null })
    .eq('id', seasonPlayerId)
    .eq('season_id', seasonId)
    .select('id');
  if (error || data.length === 0) return { error: 'failed' };

  refresh();
  return { ok: true };
}

/** Makes an active member of the team its captain; it then stays until they leave the team. */
export async function setTeamCaptain(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const teamId = String(formData.get('teamId') ?? '');
  const seasonPlayerId = String(formData.get('seasonPlayerId') ?? '');
  if (!isUuid(seasonId) || !isUuid(teamId) || !isUuid(seasonPlayerId)) return { error: 'failed' };

  const supabase = await createClient();
  const { data: player } = await supabase
    .from('season_player')
    .select('id')
    .eq('id', seasonPlayerId)
    .eq('team_id', teamId)
    .eq('season_id', seasonId)
    .eq('status', 'active')
    .maybeSingle();
  if (!player) return { error: 'failed' };

  const { error } = await supabase
    .from('team')
    .update({ captain_id: player.id, captain_chosen: true })
    .eq('id', teamId)
    .eq('season_id', seasonId);
  if (error) return { error: 'failed' };

  refresh();
  return { ok: true };
}

'use server';

import { refresh } from 'next/cache';

import { requireBtc } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import { groupResultState, planGroupClosure, type CloseGroupError } from '@/lib/close-group';
import { getPublicSeason, getSeasonMatches, getSeasonTeams } from '@/lib/public-season-db';
import { createClient } from '@/lib/supabase/server';

export type CloseGroupState =
  { ok: true } | { error: CloseGroupError | 'status' | 'bracketStarted' | 'failed' } | undefined;
export type ReopenGroupState = { ok: true } | { error: 'status' | 'bracketStarted' | 'failed' } | undefined;

/**
 * Closes the group stage (spec §6 A6): recomputes the standings, applies the BTC's draw to the teams
 * still level after step 5, then locks the order, moves the season to the knock-out and seeds the
 * bracket in one database call. The database refuses when the results changed since they were read.
 */
export async function closeGroup(_prev: CloseGroupState, formData: FormData): Promise<CloseGroupState> {
  await requireBtc();
  const year = Number(formData.get('year'));
  if (!Number.isInteger(year)) return { error: 'failed' };

  // Through the user session: RLS lets the BTC read every season and match.
  const season = await getPublicSeason(year);
  if (!season) return { error: 'failed' };
  if (season.status !== 'group') return { error: 'status' };
  const [teams, matches] = await Promise.all([getSeasonTeams(season.id), getSeasonMatches(season.id, 'group')]);

  const drawOrder = formData.getAll('draw').map(String);
  if (!drawOrder.every(isUuid)) return { error: 'changed' };
  const plan = planGroupClosure({
    teams,
    matches,
    settings: season.settings,
    drawOrder,
    note: String(formData.get('note') ?? ''),
  });
  if (!plan.ok) return { error: plan.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc('close_group', {
    p_season_id: season.id,
    p_final_order: plan.finalOrder,
    p_manual_draws: plan.manualDraws,
    p_bracket: plan.bracket,
    p_expected: groupResultState(matches, teams),
  });
  if (error) {
    if (error.code === '40001') return { error: 'changed' };
    if (error.code === 'P0001') return { error: 'status' };
    if (error.code === '55000') return { error: error.message === 'bracket started' ? 'bracketStarted' : 'unfinished' };
    return { error: 'failed' };
  }

  refresh();
  return { ok: true };
}

/** Reopens the group stage while no bracket match has started; the database has the final say. */
export async function reopenGroup(_prev: ReopenGroupState, formData: FormData): Promise<ReopenGroupState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  if (!isUuid(seasonId)) return { error: 'failed' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('reopen_group', { p_season_id: seasonId });
  if (error) {
    if (error.code === '55000') return { error: 'bracketStarted' };
    if (error.code === 'P0001') return { error: 'status' };
    return { error: 'failed' };
  }

  refresh();
  return { ok: true };
}

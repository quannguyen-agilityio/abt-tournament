'use server';

import { refresh } from 'next/cache';

import { requireBtc } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import { MAX_DRAW_BYTES, parseDrawCsv, planDrawImport, type DrawPlan } from '@/lib/team-draw';
import { createClient } from '@/lib/supabase/server';

export type DrawError = 'failed' | 'tooLarge' | 'empty' | 'header' | 'tooMany';

export type DrawPreviewState = { ok: true; csv: string; plan: DrawPlan } | { error: DrawError } | undefined;
export type DrawApplyState = { ok: true; applied: number; skipped: number } | { error: DrawError } | undefined;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Reads the database and recomputes the plan: the client is never trusted with the plan itself. */
async function buildPlan(
  supabase: Supabase,
  formData: FormData,
): Promise<{ error: DrawError } | { seasonId: string; csv: string; plan: DrawPlan }> {
  const seasonId = String(formData.get('seasonId') ?? '');
  const csv = formData.get('csv');
  if (!isUuid(seasonId) || typeof csv !== 'string') return { error: 'failed' };
  if (new TextEncoder().encode(csv).length > MAX_DRAW_BYTES) return { error: 'tooLarge' };

  const parsed = parseDrawCsv(csv);
  if (!parsed.ok) return { error: parsed.error };

  const { data: teams, error: teamsError } = await supabase
    .from('team')
    .select('id, name, color')
    .eq('season_id', seasonId)
    .order('created_at');
  if (teamsError) return { error: 'failed' };
  // A season has a few dozen players, well under the 1000-row page of PostgREST.
  const { data: players, error: playersError } = await supabase
    .from('season_player')
    .select('id, team_id, person(full_name, slug)')
    .eq('season_id', seasonId);
  if (playersError) return { error: 'failed' };

  const plan = planDrawImport({
    rows: parsed.rows,
    teams,
    players: players.map((sp) => ({
      id: sp.id,
      fullName: sp.person?.full_name ?? '',
      slug: sp.person?.slug ?? '',
      teamId: sp.team_id,
    })),
  });
  return { seasonId, csv, plan };
}

export async function previewTeamDraw(_prev: DrawPreviewState, formData: FormData): Promise<DrawPreviewState> {
  await requireBtc();
  // The user session, not the service role: RLS lets the BTC read and write and nobody else.
  const supabase = await createClient();
  const result = await buildPlan(supabase, formData);
  if ('error' in result) return result;
  return { ok: true, csv: result.csv, plan: result.plan };
}

export async function applyTeamDraw(_prev: DrawApplyState, formData: FormData): Promise<DrawApplyState> {
  await requireBtc();
  const supabase = await createClient();
  const result = await buildPlan(supabase, formData);
  if ('error' in result) return result;
  const { seasonId, plan } = result;
  if (!plan.canApply) return { error: 'failed' };

  const { data, error } = await supabase.rpc('import_team_draw', {
    p_season_id: seasonId,
    p_new_teams: plan.newTeams,
    p_assignments: plan.assignments,
  });
  if (error) return { error: 'failed' };

  refresh();
  return { ok: true, applied: data, skipped: plan.counts.invalid };
}

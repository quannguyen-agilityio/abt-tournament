'use server';

import { refresh } from 'next/cache';

import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { requireBtc } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import {
  MAX_IMPORT_BYTES,
  parsePlayerCsv,
  planPlayerImport,
  type ImportPerson,
  type ImportPlan,
  type ImportSeasonPlayer,
} from '@/lib/player-import';
import { createClient } from '@/lib/supabase/server';

export type ImportError = 'failed' | 'tooLarge' | 'empty' | 'header' | 'tooMany' | 'unresolved' | 'conflict';

export type ImportPreviewState = { ok: true; csv: string; plan: ImportPlan } | { error: ImportError } | undefined;
export type ImportApplyState = { ok: true; applied: number; skipped: number } | { error: ImportError } | undefined;

/** PostgREST returns at most 1000 rows per request. */
const PAGE_SIZE = 1000;

/** Keys must be CSV line numbers and values a person id or 'new'; anything else is ignored. */
function parseResolutions(value: FormDataEntryValue | null): Record<number, string> {
  const resolutions: Record<number, string> = {};
  if (typeof value !== 'string') return resolutions;
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return resolutions;
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return resolutions;
  for (const [key, choice] of Object.entries(json)) {
    if (/^\d+$/.test(key) && typeof choice === 'string' && (choice === 'new' || isUuid(choice))) {
      resolutions[Number(key)] = choice;
    }
  }
  return resolutions;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadPersons(supabase: Supabase): Promise<ImportPerson[] | null> {
  const persons: ImportPerson[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('person')
      .select('id, full_name, slug, gender')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) return null;
    for (const p of data) persons.push({ id: p.id, fullName: p.full_name, slug: p.slug, gender: p.gender });
    if (data.length < PAGE_SIZE) return persons;
  }
}

/** Reads the database and recomputes the plan: the client is never trusted with the plan itself. */
async function buildPlan(
  supabase: Supabase,
  formData: FormData,
): Promise<{ error: ImportError } | { seasonId: string; csv: string; plan: ImportPlan }> {
  const seasonId = String(formData.get('seasonId') ?? '');
  const csv = formData.get('csv');
  if (!isUuid(seasonId) || typeof csv !== 'string') return { error: 'failed' };
  if (new TextEncoder().encode(csv).length > MAX_IMPORT_BYTES) return { error: 'tooLarge' };

  const { data: season } = await supabase.from('season').select('settings').eq('id', seasonId).maybeSingle();
  if (!season) return { error: 'failed' };
  const parsedSettings = parseSeasonSettings(season.settings);
  const settings = parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS;

  const parsed = parsePlayerCsv(csv, { maxRank: settings.max_rank });
  if (!parsed.ok) return { error: parsed.error };

  const persons = await loadPersons(supabase);
  if (!persons) return { error: 'failed' };
  const { data: players, error } = await supabase
    .from('season_player')
    .select('person_id, rank, skill_points, season_player_private(member_type, fee_amount)')
    .eq('season_id', seasonId);
  if (error) return { error: 'failed' };
  const seasonPlayers: ImportSeasonPlayer[] = players.map((sp) => ({
    personId: sp.person_id,
    rank: sp.rank,
    skillPoints: sp.skill_points,
    memberType: sp.season_player_private?.member_type ?? null,
    feeAmount: sp.season_player_private ? sp.season_player_private.fee_amount : null,
  }));

  const plan = planPlayerImport({
    rows: parsed.rows,
    persons,
    seasonPlayers,
    fees: settings.fees,
    resolutions: parseResolutions(formData.get('resolutions')),
  });
  return { seasonId, csv, plan };
}

export async function previewPlayerImport(_prev: ImportPreviewState, formData: FormData): Promise<ImportPreviewState> {
  await requireBtc();
  // The user session, not the service role: RLS lets the BTC read and write and nobody else.
  const supabase = await createClient();
  const result = await buildPlan(supabase, formData);
  if ('error' in result) return result;
  return { ok: true, csv: result.csv, plan: result.plan };
}

export async function applyPlayerImport(_prev: ImportApplyState, formData: FormData): Promise<ImportApplyState> {
  await requireBtc();
  const supabase = await createClient();
  const result = await buildPlan(supabase, formData);
  if ('error' in result) return result;
  const { seasonId, plan } = result;
  if (plan.counts.ambiguous > 0) return { error: 'unresolved' };
  if (plan.ops.length === 0) return { error: 'failed' };

  const { data, error } = await supabase.rpc('import_season_players', { p_season_id: seasonId, p_rows: plan.ops });
  if (error) return { error: error.code === '23505' ? 'conflict' : 'failed' };

  refresh();
  return { ok: true, applied: data, skipped: plan.counts.invalid };
}

'use server';

import { refresh } from 'next/cache';

import { parseSeasonSettings, type SettingsError } from '@/domain/settings';
import { canSetCurrent, canTransitionSeason, SEASON_STATUSES, type SeasonStatus } from '@/domain/season-status';
import { requireBtc } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import type { Json } from '@/lib/database.types';
import {
  moveCourt as reorderCourts,
  parseCourtName,
  parseSeasonDetails,
  type SeasonDetailsError,
} from '@/lib/season-admin';
import { settingsFromForm } from '@/lib/season-settings-form';
import { createClient } from '@/lib/supabase/server';

// Postgres foreign_key_violation: a match still refers to the court.
const FOREIGN_KEY_VIOLATION = '23503';

// Raised by set_current_season (errcode P0001) for a draft season.
const RAISE_EXCEPTION = 'P0001';

export type SeasonActionState = { error: 'transition' | 'draft' | 'failed' } | { ok: true } | undefined;

/** On error, the submitted fields come back so the form can refill them (React resets it). */
export type SeasonDetailsFields = { name: string; venue: string };

export type SeasonDetailsState =
  { error: SeasonDetailsError | 'failed'; fields: SeasonDetailsFields } | { ok: true } | undefined;

function isSeasonStatus(value: string): value is SeasonStatus {
  return (SEASON_STATUSES as readonly string[]).includes(value);
}

export async function setSeasonStatus(_prev: SeasonActionState, formData: FormData): Promise<SeasonActionState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!isUuid(seasonId)) return { error: 'failed' };
  if (!isSeasonStatus(to)) return { error: 'transition' };

  // The user session, not the service role: RLS lets the BTC write and nobody else.
  const supabase = await createClient();
  // Re-read the season: the page the BTC is looking at may be stale.
  const { data: season, error: readError } = await supabase
    .from('season')
    .select('status, is_current')
    .eq('id', seasonId)
    .maybeSingle();
  if (readError || !season) return { error: 'failed' };
  if (!canTransitionSeason(season.status, to, { isCurrent: season.is_current })) return { error: 'transition' };

  const { error } = await supabase.from('season').update({ status: to }).eq('id', seasonId);
  if (error) return { error: 'failed' };

  refresh();
  return { ok: true };
}

export async function setCurrentSeason(_prev: SeasonActionState, formData: FormData): Promise<SeasonActionState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  if (!isUuid(seasonId)) return { error: 'failed' };

  const supabase = await createClient();
  const { data: season } = await supabase.from('season').select('status').eq('id', seasonId).maybeSingle();
  if (season && !canSetCurrent(season.status)) return { error: 'draft' };

  const { error } = await supabase.rpc('set_current_season', { p_season_id: seasonId });
  if (error) return { error: error.code === RAISE_EXCEPTION ? 'draft' : 'failed' };

  refresh();
  return { ok: true };
}

export async function updateSeasonDetails(_prev: SeasonDetailsState, formData: FormData): Promise<SeasonDetailsState> {
  await requireBtc();
  const fields: SeasonDetailsFields = {
    name: String(formData.get('name') ?? ''),
    venue: String(formData.get('venue') ?? ''),
  };
  const seasonId = String(formData.get('seasonId') ?? '');
  if (!isUuid(seasonId)) return { error: 'failed', fields };
  const parsed = parseSeasonDetails(formData);
  if (!parsed.ok) return { error: parsed.error, fields };
  const { name, venue, matchDays } = parsed.value;

  const supabase = await createClient();
  const { error } = await supabase.from('season').update({ name, venue, match_days: matchDays }).eq('id', seasonId);
  if (error) return { error: 'failed', fields };

  refresh();
  return { ok: true };
}

export type SeasonSettingsState =
  { ok: true } | { ok: false; errors: SettingsError[] } | { error: 'failed' } | undefined;

export async function saveSeasonSettings(_prev: SeasonSettingsState, formData: FormData): Promise<SeasonSettingsState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  if (!isUuid(seasonId)) return { error: 'failed' };

  // Authoritative check: store the parsed settings (defaults filled in), never the raw input.
  const result = parseSeasonSettings(settingsFromForm(formData));
  if (!result.ok) return result;

  const supabase = await createClient();
  const { error } = await supabase
    .from('season')
    .update({ settings: result.settings as unknown as NonNullable<Json> })
    .eq('id', seasonId);
  if (error) return { error: 'failed' };

  refresh();
  return { ok: true };
}

export type CourtActionState = { error: 'name' | 'inUse' | 'failed' } | { ok: true } | undefined;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** True when the court exists and belongs to the season: a form could be tampered with. */
async function courtInSeason(supabase: Supabase, courtId: string, seasonId: string): Promise<boolean> {
  const { data } = await supabase.from('court').select('id').eq('id', courtId).eq('season_id', seasonId).maybeSingle();
  return !!data;
}

export async function addCourt(_prev: CourtActionState, formData: FormData): Promise<CourtActionState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  if (!isUuid(seasonId)) return { error: 'failed' };
  const name = parseCourtName(String(formData.get('name') ?? ''));
  if (!name) return { error: 'name' };

  const supabase = await createClient();
  const { data: last, error: readError } = await supabase
    .from('court')
    .select('sort_order')
    .eq('season_id', seasonId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) return { error: 'failed' };

  const { error } = await supabase
    .from('court')
    .insert({ season_id: seasonId, name, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return { error: 'failed' };

  refresh();
  return { ok: true };
}

export async function renameCourt(_prev: CourtActionState, formData: FormData): Promise<CourtActionState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const courtId = String(formData.get('courtId') ?? '');
  if (!isUuid(seasonId) || !isUuid(courtId)) return { error: 'failed' };
  const name = parseCourtName(String(formData.get('name') ?? ''));
  if (!name) return { error: 'name' };

  const supabase = await createClient();
  if (!(await courtInSeason(supabase, courtId, seasonId))) return { error: 'failed' };
  const { error } = await supabase.from('court').update({ name }).eq('id', courtId);
  if (error) return { error: 'failed' };

  refresh();
  return { ok: true };
}

export async function moveCourt(_prev: CourtActionState, formData: FormData): Promise<CourtActionState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const courtId = String(formData.get('courtId') ?? '');
  const direction = formData.get('direction');
  if (!isUuid(seasonId) || !isUuid(courtId) || (direction !== 'up' && direction !== 'down')) return { error: 'failed' };

  const supabase = await createClient();
  const { data: courts, error: readError } = await supabase
    .from('court')
    .select('id, sort_order')
    .eq('season_id', seasonId)
    .order('sort_order')
    .order('name');
  if (readError || !courts.some((c) => c.id === courtId)) return { error: 'failed' };

  const current = new Map(courts.map((c) => [c.id, c.sort_order]));
  const changed = reorderCourts(courts, courtId, direction).filter((c) => current.get(c.id) !== c.sort_order);
  for (const { id, sort_order } of changed) {
    const { error } = await supabase.from('court').update({ sort_order }).eq('id', id).eq('season_id', seasonId);
    if (error) return { error: 'failed' };
  }

  refresh();
  return { ok: true };
}

export async function deleteCourt(_prev: CourtActionState, formData: FormData): Promise<CourtActionState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const courtId = String(formData.get('courtId') ?? '');
  if (!isUuid(seasonId) || !isUuid(courtId)) return { error: 'failed' };

  const supabase = await createClient();
  if (!(await courtInSeason(supabase, courtId, seasonId))) return { error: 'failed' };
  const { error } = await supabase.from('court').delete().eq('id', courtId);
  if (error) return { error: error.code === FOREIGN_KEY_VIOLATION ? 'inUse' : 'failed' };

  refresh();
  return { ok: true };
}

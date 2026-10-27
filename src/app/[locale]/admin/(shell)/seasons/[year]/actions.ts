'use server';

import { refresh } from 'next/cache';

import { parseSeasonSettings, type SettingsError } from '@/domain/settings';
import { canSetCurrent, canTransitionSeason, SEASON_STATUSES, type SeasonStatus } from '@/domain/season-status';
import { requireBtc } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import type { Json } from '@/lib/database.types';
import { parseSeasonDetails, type SeasonDetailsError } from '@/lib/season-admin';
import { settingsFromForm } from '@/lib/season-settings-form';
import { createClient } from '@/lib/supabase/server';

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

'use server';

import { getLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { requireBtc } from '@/lib/auth/session';
import type { Json } from '@/lib/database.types';
import { DEFAULT_SEASON_SETTINGS } from '@/domain/settings';
import { parseNewSeason, type NewSeasonError } from '@/lib/season-admin';
import { createClient } from '@/lib/supabase/server';

// Postgres unique_violation: the season year is unique.
const UNIQUE_VIOLATION = '23505';

/** On error, the submitted fields come back so the form can refill them (React resets it). */
export type CreateSeasonFields = { year: string; name: string; venue: string; source: string };

export type CreateSeasonState =
  { error: NewSeasonError | 'yearTaken' | 'failed'; fields: CreateSeasonFields } | undefined;

export async function createSeason(_prev: CreateSeasonState, formData: FormData): Promise<CreateSeasonState> {
  await requireBtc();
  const fields: CreateSeasonFields = {
    year: String(formData.get('year') ?? ''),
    name: String(formData.get('name') ?? ''),
    venue: String(formData.get('venue') ?? ''),
    source: String(formData.get('source') ?? ''),
  };
  const parsed = parseNewSeason(formData);
  if (!parsed.ok) return { error: parsed.error, fields };
  const { year, name, venue, sourceId } = parsed.value;

  // The user session, not the service role: RLS lets the BTC write and nobody else.
  const supabase = await createClient();
  const { error } = sourceId
    ? await supabase.rpc('clone_season', { p_source_id: sourceId, p_year: year, p_name: name, p_venue: venue })
    : await supabase
        .from('season')
        .insert({ year, name, venue, settings: { ...DEFAULT_SEASON_SETTINGS } as unknown as NonNullable<Json> });
  if (error) return { error: error.code === UNIQUE_VIOLATION ? 'yearTaken' : 'failed', fields };

  return redirect({ href: `/admin/seasons/${year}`, locale: await getLocale() });
}

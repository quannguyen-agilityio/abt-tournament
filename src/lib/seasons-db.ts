import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { connection } from 'next/server';
import { cache } from 'react';

import { PUBLIC_DATA_TAG } from '@/lib/public-cache';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient, hasSessionCookie } from '@/lib/supabase/server';
import { resolveCurrentYear, sortYearsDesc } from './seasons';

type Supabase = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createPublicClient>;

async function readSeasonYears(supabase: Supabase): Promise<number[]> {
  const { data, error } = await supabase.from('season').select('year');
  if (error) throw error;
  return sortYearsDesc(data.map((s) => s.year));
}

// Cached like public-season-db.ts: anon reads shared by every visitor, expired by admin actions.
async function cachedSeasonYears(): Promise<number[]> {
  'use cache';
  cacheTag(PUBLIC_DATA_TAG);
  cacheLife('minutes');
  return readSeasonYears(createPublicClient());
}

/**
 * Season years the viewer can see, newest first. RLS hides drafts from the public; a signed-in BTC
 * member also sees them, so their read goes through the session and is not cached.
 */
export const listPublicSeasons = cache(async (): Promise<number[]> =>
  (await hasSessionCookie()) ? readSeasonYears(await createClient()) : cachedSeasonYears(),
);

// The current season is never a draft (set_current_season refuses one), so anon sees the same row.
async function cachedCurrentSeason(): Promise<{ year: number } | null> {
  'use cache';
  cacheTag(PUBLIC_DATA_TAG);
  cacheLife('minutes');
  const { data, error } = await createPublicClient().from('season').select('year').eq('is_current', true).maybeSingle();
  if (error) throw error;
  return data;
}

/** Year of the season marked current, or the calendar year when none is. */
export const getCurrentSeasonYear = cache(async (): Promise<number> => {
  // The calendar-year fallback reads the clock, which is request-time data under cacheComponents.
  await connection();
  return resolveCurrentYear(await cachedCurrentSeason());
});

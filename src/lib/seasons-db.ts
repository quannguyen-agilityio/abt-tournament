import 'server-only';

import { connection } from 'next/server';
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { resolveCurrentYear, sortYearsDesc } from './seasons';

/**
 * Season years the viewer can see, newest first. RLS hides drafts from the public; a signed-in BTC
 * member also sees them.
 */
export const listPublicSeasons = cache(async (): Promise<number[]> => {
  // Reads the session cookies, which is request-time data under cacheComponents.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.from('season').select('year');
  if (error) throw error;
  return sortYearsDesc(data.map((s) => s.year));
});

/** Year of the season marked current, or the calendar year when none is. */
export const getCurrentSeasonYear = cache(async (): Promise<number> => {
  // The calendar-year fallback reads the clock, which is request-time data under cacheComponents.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.from('season').select('year').eq('is_current', true).maybeSingle();
  if (error) throw error;
  return resolveCurrentYear(data);
});

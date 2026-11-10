import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import Loading from '../../../../../matches/[id]/loading';

/**
 * The scoring screen's own route (spec-phase-2 §8.0 Direct link), so a bookmark or a link shared in
 * chat works: it needs the same role as A5 and opens the match's Scores step, which shows the Live
 * scoring card for the current lock state. The scorer screens (L-B–L-E, L-H) render here for the
 * user who holds the lock once they land.
 */
async function LiveEntry({
  params,
}: Pick<PageProps<'/[locale]/admin/seasons/[year]/matches/[code]/live'>, 'params'>): Promise<null> {
  const { locale, year, code } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireStaff();
  if (!/^\d{4}$/.test(year)) notFound();

  // The user session: RLS shows referees the matches of non-draft seasons, and the BTC all of them.
  const supabase = await createClient();
  const { data: season, error } = await supabase.from('season').select('id').eq('year', Number(year)).maybeSingle();
  if (error) throw error;
  if (!season) notFound();
  const { data: match, error: matchError } = await supabase
    .from('match')
    .select('id')
    .eq('season_id', season.id)
    .eq('code', decodeURIComponent(code))
    .maybeSingle();
  if (matchError) throw matchError;
  if (!match) notFound();

  return redirect({ href: `/admin/matches/${match.id}?step=scores`, locale });
}

export default function LiveEntryPage({ params }: PageProps<'/[locale]/admin/seasons/[year]/matches/[code]/live'>) {
  return (
    <Suspense fallback={<Loading />}>
      <LiveEntry params={params} />
    </Suspense>
  );
}

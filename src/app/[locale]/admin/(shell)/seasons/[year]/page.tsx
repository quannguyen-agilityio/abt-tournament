import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireBtc } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { SeasonDetailsForm } from './season-details-form';
import { SeasonStatusPanel } from './season-status-panel';

async function SeasonDetail({ params }: Pick<PageProps<'/[locale]/admin/seasons/[year]'>, 'params'>) {
  const { locale, year: yearParam } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireBtc();
  if (!/^\d{4}$/.test(yearParam)) notFound();
  const t = await getTranslations('Admin.seasons');

  // The user session: RLS lets the BTC read and write every season, drafts included.
  const supabase = await createClient();
  const { data: season, error } = await supabase
    .from('season')
    .select('id, year, name, venue, status, is_current, match_days')
    .eq('year', Number(yearParam))
    .maybeSingle();
  if (error) throw error;
  if (!season) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/seasons" className="text-primary text-sm font-medium hover:underline">
          {t('detail.back')}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl font-bold">{season.name}</h1>
          <span className="bg-muted text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
            {t(`status.${season.status}`)}
          </span>
          {season.is_current && (
            <span className="bg-brand-soft text-primary inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
              {t('current')}
            </span>
          )}
        </div>
      </div>
      <SeasonStatusPanel seasonId={season.id} status={season.status} isCurrent={season.is_current} />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="border-border bg-surface flex flex-col gap-4 rounded-[10px] border p-5">
            <h2 className="font-display text-2xl font-bold uppercase">{t('detail.title')}</h2>
            <SeasonDetailsForm
              seasonId={season.id}
              year={season.year}
              name={season.name}
              venue={season.venue}
              matchDays={season.match_days}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

export default function SeasonDetailPage({ params }: PageProps<'/[locale]/admin/seasons/[year]'>) {
  return (
    <Suspense>
      <SeasonDetail params={params} />
    </Suspense>
  );
}

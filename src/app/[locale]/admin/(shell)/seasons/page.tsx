import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireBtc } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { CreateSeasonForm } from './create-season-form';

async function Seasons({ params }: Pick<PageProps<'/[locale]/admin/seasons'>, 'params'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireBtc();
  const t = await getTranslations('Admin');

  // The user session: RLS lets the BTC read every season, drafts included.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('season')
    .select('id, year, name, venue, status, is_current')
    .order('year', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold">{t('seasons.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('seasons.count', { count: rows.length })}</p>
      </div>
      <div className="flex flex-col gap-6">
        <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('seasons.tableLabel')}</caption>
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-xs tracking-[0.1em] uppercase">
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t('seasons.year')}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t('seasons.name')}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t('seasons.venue')}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t('seasons.statusHeader')}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t('seasons.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-3 py-6 text-center">
                    {t('seasons.empty')}
                  </td>
                </tr>
              )}
              {rows.map((s) => (
                <tr key={s.id} className="border-border border-b align-top last:border-b-0">
                  <th scope="row" className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                    {s.year}
                  </th>
                  <td className="px-3 py-2.5">{s.name}</td>
                  <td className="text-muted-foreground px-3 py-2.5">{s.venue || '–'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={
                          s.status === 'draft'
                            ? 'bg-muted text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap'
                            : s.status === 'finished'
                              ? 'text-muted-foreground text-xs font-medium whitespace-nowrap'
                              : 'text-win text-xs font-medium whitespace-nowrap'
                        }
                      >
                        {t(`seasons.status.${s.status}`)}
                      </span>
                      {s.is_current && (
                        <span className="bg-brand-soft text-primary inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                          {t('seasons.current')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/seasons/${s.year}`}
                      className="text-primary text-sm font-medium whitespace-nowrap hover:underline"
                    >
                      {t('seasons.open')}
                      <span className="sr-only"> {s.name}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CreateSeasonForm sources={rows.map((s) => ({ id: s.id, name: s.name }))} />
      </div>
    </div>
  );
}

export default function SeasonsPage({ params }: PageProps<'/[locale]/admin/seasons'>) {
  return (
    <Suspense>
      <Seasons params={params} />
    </Suspense>
  );
}

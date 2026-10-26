import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { routing } from '@/i18n/routing';

async function SeasonHome({ params }: Pick<PageProps<'/[locale]/[year]'>, 'params'>) {
  const { locale, year } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('Home');

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p>{t('season', { year })}</p>
      <p>{t('description')}</p>
      <Button disabled>{t('comingSoon')}</Button>
    </div>
  );
}

export default function SeasonHomePage({ params }: PageProps<'/[locale]/[year]'>) {
  return (
    <Suspense>
      <SeasonHome params={params} />
    </Suspense>
  );
}

import { Suspense } from 'react';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { notFound, redirect } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { currentSeasonYear } from '@/lib/season';

async function RedirectToCurrentSeason({ params }: Pick<PageProps<'/[locale]'>, 'params'>): Promise<never> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // new Date() is request-time data under cacheComponents.
  await connection();
  redirect(`/${locale}/${currentSeasonYear()}`);
}

// Fallback only: src/proxy.ts already redirects `/{locale}` to `/{locale}/{year}` with a 307.
export default function LocaleIndex({ params }: PageProps<'/[locale]'>) {
  return (
    <Suspense>
      <RedirectToCurrentSeason params={params} />
    </Suspense>
  );
}

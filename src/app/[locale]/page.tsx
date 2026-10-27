import { Suspense } from 'react';
import { hasLocale } from 'next-intl';
import { notFound, redirect } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { getCurrentSeasonYear } from '@/lib/seasons-db';

async function RedirectToCurrentSeason({ params }: Pick<PageProps<'/[locale]'>, 'params'>): Promise<never> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  redirect(`/${locale}/${await getCurrentSeasonYear()}`);
}

// Fallback only: src/proxy.ts already redirects `/{locale}` to `/{locale}/{year}` with a 307.
export default function LocaleIndex({ params }: PageProps<'/[locale]'>) {
  return (
    <Suspense>
      <RedirectToCurrentSeason params={params} />
    </Suspense>
  );
}

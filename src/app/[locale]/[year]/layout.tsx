import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PublicNav } from '@/components/public-nav';
import { SeasonSwitcher } from '@/components/season-switcher';
import { SiteFooter } from '@/components/site-footer';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/wordmark';
import { routing } from '@/i18n/routing';
import { listPublicSeasons } from '@/lib/seasons-db';

const HEADER_CLASS = 'sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur';

// A season missing from the list (unknown year, or a draft hidden by RLS) is a 404 for the public.
async function visibleSeasons(params: LayoutProps<'/[locale]/[year]'>['params']) {
  const { locale, year } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year)) notFound();
  setRequestLocale(locale);
  const seasons = await listPublicSeasons();
  if (!seasons.includes(Number(year))) notFound();
  return { year, seasons };
}

async function SeasonHeader({ params }: Pick<LayoutProps<'/[locale]/[year]'>, 'params'>) {
  const { year, seasons } = await visibleSeasons(params);

  return (
    <header className={HEADER_CLASS}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 px-4">
        <Wordmark year={year} href={`/${year}`} className="flex h-14 items-center" />
        <PublicNav
          year={year}
          className="border-border order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto border-t px-4 py-1.5 lg:order-2 lg:mx-0 lg:w-auto lg:min-w-0 lg:flex-1 lg:border-0 lg:p-0"
        />
        <div className="order-2 ml-auto flex items-center gap-2 lg:order-3">
          <SeasonSwitcher seasons={seasons} />
          <Suspense fallback={<span className="inline-block h-8 w-[2.8rem]" />}>
            <LocaleSwitcher />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

async function SeasonGate({ params, children }: Pick<LayoutProps<'/[locale]/[year]'>, 'params' | 'children'>) {
  await visibleSeasons(params);
  return children;
}

export default function SeasonLayout({ children, params }: LayoutProps<'/[locale]/[year]'>) {
  return (
    <>
      <Suspense fallback={<header className={`${HEADER_CLASS} h-14`} />}>
        <SeasonHeader params={params} />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        {/* Each Suspense boundary throws its own notFound(), so the pages are gated too, not just the header. */}
        <Suspense>
          <SeasonGate params={params}>{children}</SeasonGate>
        </Suspense>
      </main>
      <Suspense>
        <SiteFooter />
      </Suspense>
    </>
  );
}

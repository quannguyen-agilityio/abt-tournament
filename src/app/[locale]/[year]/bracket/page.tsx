import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { SeasonRefresh } from '@/components/season-refresh';
import { routing } from '@/i18n/routing';
import { buildBracketView, type BracketCode } from '@/lib/public-bracket';
import { getGroupClosure, getPublicSeason, getSeasonMatches, getSeasonTeams } from '@/lib/public-season-db';
import { BracketCard } from './bracket-card';

const EYEBROW = 'text-muted-foreground text-xs font-semibold tracking-wider uppercase';

async function Bracket({ params }: Pick<PageProps<'/[locale]/[year]/bracket'>, 'params'>) {
  const { locale, year } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year)) notFound();
  setRequestLocale(locale);
  const [t, tn, tp] = await Promise.all([
    getTranslations('Public.bracket'),
    getTranslations('Nav'),
    getTranslations('Public'),
  ]);

  const season = await getPublicSeason(Number(year));
  if (!season) notFound();
  const [teams, matches, finalOrder] = await Promise.all([
    getSeasonTeams(season.id),
    getSeasonMatches(season.id, 'knockout'),
    getGroupClosure(season.id),
  ]);
  const view = buildBracketView({ matches, finalOrder, settings: season.settings });
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const card = (code: BracketCode) => (
    <BracketCard slot={view.slots.find((s) => s.code === code)!} year={year} teams={teamById} />
  );

  return (
    <>
      <h1 className="font-display mb-1 text-4xl font-extrabold uppercase">{tn('bracket')}</h1>
      <p className="text-muted-foreground mb-6">{t('relayNote')}</p>
      <SeasonRefresh season={season} className="-mt-4 mb-6" />

      {!view.closed && (
        <div className="border-border bg-surface mb-6 rounded-[10px] border p-4 text-sm">
          <span className="border-warn/60 bg-warn/10 text-warn inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
            {t('pending')}
          </span>{' '}
          <span className="text-muted-foreground">{t('pendingSeeds')}</span>
        </div>
      )}

      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {card('SF1')}
          {card('SF2')}
        </div>
        <svg
          className="text-border hidden h-64 w-10 md:block"
          viewBox="0 0 40 256"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M0 64H20V192H0M20 128H40" />
        </svg>
        <div className="flex flex-col gap-2">
          <div className={EYEBROW}>{tp('stage.final')}</div>
          {card('F')}
        </div>
      </div>

      <div className="mt-8 max-w-md">
        <div className={`${EYEBROW} mb-2`}>{tp('stage.third_place')}</div>
        {card('3RD')}
      </div>
    </>
  );
}

export default function BracketPage({ params }: PageProps<'/[locale]/[year]/bracket'>) {
  return (
    <Suspense>
      <Bracket params={params} />
    </Suspense>
  );
}

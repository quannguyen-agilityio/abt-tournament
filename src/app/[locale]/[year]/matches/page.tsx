import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { MatchCard } from '@/components/match-card';
import { SeasonRefresh } from '@/components/season-refresh';
import { routing } from '@/i18n/routing';
import { formatDay, formatTime } from '@/lib/format';
import {
  buildScheduleView,
  parseMatchFilters,
  scheduleDays,
  type MatchCard as MatchCardData,
} from '@/lib/public-matches';
import { getPublicSeason, getSeasonCourts, getSeasonSchedule, getSeasonTeams } from '@/lib/public-season-db';
import { zonedToUtc } from '@/lib/schedule';
import { MatchFiltersForm } from './match-filters';

const GRID = 'grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3';
const DAY_HEADING = 'font-display mb-1 text-2xl font-bold uppercase';
const COURTLINE = 'border-border mb-4 h-1.5 max-w-xs border-y';

async function Matches({ params, searchParams }: PageProps<'/[locale]/[year]/matches'>) {
  const { locale, year } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year)) notFound();
  setRequestLocale(locale);
  const [t, tn] = await Promise.all([getTranslations('Public.matches'), getTranslations('Nav')]);

  const season = await getPublicSeason(Number(year));
  if (!season) notFound();
  const [teams, courts, matches, query] = await Promise.all([
    getSeasonTeams(season.id),
    getSeasonCourts(season.id),
    getSeasonSchedule(season.id),
    searchParams,
  ]);
  const { timezone } = season.settings;
  const filters = parseMatchFilters(query, { teamIds: teams.map((x) => x.id), courtIds: courts.map((c) => c.id) });
  const view = buildScheduleView({ matches, filters, settings: season.settings });
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const courtById = new Map(courts.map((court) => [court.id, court.name]));
  const cards = (list: MatchCardData[]) => (
    <div className={GRID}>
      {list.map((match) => (
        <MatchCard key={match.id} match={match} year={year} teams={teamById} courts={courtById} timeZone={timezone} />
      ))}
    </div>
  );

  return (
    <>
      <h1 className="font-display mb-1 text-4xl font-extrabold uppercase">{tn('matches')}</h1>
      <p className="text-muted-foreground mb-5">{t('subtitle', { count: view.count })}</p>
      <SeasonRefresh season={season} className="-mt-3 mb-5" />

      <MatchFiltersForm
        filters={filters}
        days={scheduleDays(matches, season.matchDays, timezone).map((day) => ({
          value: day,
          label: formatDay(day, locale),
        }))}
        teams={teams.map((team) => ({ value: team.id, label: team.name }))}
        courts={courts.map((court) => ({ value: court.id, label: court.name }))}
      />

      {view.count === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-[10px] border p-8 text-center">
          {matches.length === 0 ? t('noSchedule') : t('empty')}
        </div>
      ) : (
        <>
          {view.days.map((day) => (
            <section key={day.date} className="mb-8" aria-labelledby={`day-${day.date}`}>
              <h2 id={`day-${day.date}`} className={DAY_HEADING}>
                {formatDay(day.date, locale)}
              </h2>
              <div className={COURTLINE} />
              {day.times.map(({ time, matches: atTime }) => (
                <div key={time} className="mb-4 grid gap-3 sm:grid-cols-[88px_minmax(0,1fr)]">
                  <h3 className="font-display text-muted-foreground text-xl font-semibold tabular-nums sm:pt-3">
                    {formatTime(zonedToUtc(day.date, time, timezone), locale, timezone)}
                  </h3>
                  {cards(atTime)}
                </div>
              ))}
            </section>
          ))}
          {view.unscheduled.length > 0 && (
            <section className="mb-8" aria-labelledby="day-unscheduled">
              <h2 id="day-unscheduled" className={DAY_HEADING}>
                {t('unscheduled')}
              </h2>
              <div className={COURTLINE} />
              {cards(view.unscheduled)}
            </section>
          )}
        </>
      )}
    </>
  );
}

export default function MatchesPage(props: PageProps<'/[locale]/[year]/matches'>) {
  return (
    <Suspense>
      <Matches {...props} />
    </Suspense>
  );
}

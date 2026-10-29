import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MatchCard } from '@/components/match-card';
import { TeamChip } from '@/components/team-chip';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { formatDate, formatMoney } from '@/lib/format';
import { buildBracketView, type BracketCode } from '@/lib/public-bracket';
import { buildHomeView, buildPodium } from '@/lib/public-home';
import type { MatchCard as MatchCardData } from '@/lib/public-matches';
import {
  getGroupClosure,
  getPublicSeason,
  getSeasonCourts,
  getSeasonMatches,
  getSeasonSchedule,
  getSeasonTeams,
} from '@/lib/public-season-db';
import { buildStandingsView } from '@/lib/public-standings';
import { cn } from '@/lib/utils';
import { BracketCard } from './bracket/bracket-card';

const PANEL = 'border-border bg-surface rounded-[10px] border';
const EMPTY = `${PANEL} text-muted-foreground p-6 text-center text-sm`;
const EYEBROW = 'text-muted-foreground text-xs font-semibold tracking-wider uppercase';
const TH = 'px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const TD = 'px-3 py-2.5 text-right';
const PODIUM_TONE = {
  champion: 'border-primary bg-brand-soft/40',
  runner_up: 'border-border',
  third: 'border-border',
} as const;

function Section({ title, more, children }: { title: string; more?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-end gap-3">
        <h2 className="font-display text-2xl font-bold tracking-wide uppercase">{title}</h2>
        {more}
      </div>
      {children}
    </section>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-primary ml-auto text-sm hover:underline">
      {label} →
    </Link>
  );
}

async function SeasonHome({ params }: Pick<PageProps<'/[locale]/[year]'>, 'params'>) {
  const { locale, year } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year)) notFound();
  setRequestLocale(locale);
  const [t, tn, ts] = await Promise.all([
    getTranslations('Public.home'),
    getTranslations('Nav'),
    getTranslations('Public.standings'),
  ]);

  const season = await getPublicSeason(Number(year));
  if (!season) notFound();
  const [teams, courts, schedule, groupMatches, knockoutMatches, finalOrder] = await Promise.all([
    getSeasonTeams(season.id),
    getSeasonCourts(season.id),
    getSeasonSchedule(season.id),
    getSeasonMatches(season.id, 'group'),
    getSeasonMatches(season.id, 'knockout'),
    getGroupClosure(season.id),
  ]);
  const { settings } = season;
  const view = buildHomeView({ matches: schedule, courts, settings });
  const standings = buildStandingsView({ teams, matches: groupMatches, settings, finalOrder });
  const bracket = buildBracketView({ matches: knockoutMatches, finalOrder, settings });
  const podium = season.status === 'finished' ? buildPodium(bracket.slots, settings.prizes) : [];
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const courtById = new Map(courts.map((court) => [court.id, court.name]));
  const top = standings.rows.slice(0, standings.qualifyingCount);

  const card = (match: MatchCardData, withDate = false) => (
    <MatchCard
      key={match.id}
      match={match}
      year={year}
      teams={teamById}
      courts={courtById}
      timeZone={settings.timezone}
      withDate={withDate}
    />
  );
  const bracketCard = (code: BracketCode) => (
    <BracketCard key={code} slot={bracket.slots.find((s) => s.code === code)!} year={year} teams={teamById} />
  );
  const dates = season.matchDays.map((day) => formatDate(new Date(`${day}T00:00:00Z`), locale, 'UTC'));

  return (
    <>
      <section className="mb-8">
        <div className={cn(EYEBROW, 'mb-2')}>{[...dates, season.venue].filter(Boolean).join(' · ')}</div>
        <h1 className="font-display text-5xl leading-none font-extrabold uppercase sm:text-6xl">{season.name}</h1>
        <div className="border-border mt-5 h-1.5 max-w-md border-y" />
      </section>

      {podium.length > 0 && (
        <section className="mb-8" aria-labelledby="podium">
          <h2 id="podium" className="font-display mb-3 text-2xl font-bold tracking-wide uppercase">
            {t('podium')}
          </h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {podium.map((place) => {
              const team = teamById.get(place.teamId);
              return (
                <li
                  key={place.placing}
                  className={cn(PANEL, 'flex min-w-0 flex-col gap-2 p-4', PODIUM_TONE[place.placing])}
                >
                  <span className={EYEBROW}>{t(`placing.${place.placing}`)}</span>
                  {team && (
                    <Link href={`/${year}/teams/${team.id}`} className="min-w-0 text-lg hover:underline">
                      <TeamChip name={team.name} color={team.color} />
                    </Link>
                  )}
                  {place.prize !== null && (
                    <span className="font-display text-xl font-bold tabular-nums">
                      {formatMoney(place.prize, locale)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {!view.hasSchedule ? (
        <div className={EMPTY}>{t('noSchedule')}</div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-8">
            {season.status !== 'finished' && (
              <Section title={t('nowNext')} more={<SeeAll href={`/${year}/matches`} label={t('seeAll')} />}>
                {view.courts.length === 0 ? (
                  <div className={EMPTY}>{t('nothingNext')}</div>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2">
                    {view.courts.map((court) => (
                      <div key={court.courtId} className="flex min-w-0 flex-col gap-3">
                        <h3 className="font-display text-xl font-semibold">{court.court}</h3>
                        {court.now.map((match) => (
                          <div key={match.id} className="flex flex-col gap-1.5">
                            <span className={EYEBROW}>{t('now')}</span>
                            {card(match)}
                          </div>
                        ))}
                        {court.next && (
                          <div className="flex flex-col gap-1.5">
                            <span className={EYEBROW}>{t('next')}</span>
                            {card(court.next, true)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            <Section title={t('latest')}>
              {view.latest.length === 0 ? (
                <div className={EMPTY}>{t('noResults')}</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">{view.latest.map((match) => card(match, true))}</div>
              )}
            </Section>
          </div>

          <aside className="flex min-w-0 flex-col gap-8">
            {top.length > 0 && (
              <Section
                title={t('top', { count: standings.qualifyingCount })}
                more={<SeeAll href={`/${year}/standings`} label={t('seeAll')} />}
              >
                <div className={PANEL}>
                  <table className="w-full border-collapse text-sm whitespace-nowrap tabular-nums">
                    <caption className="sr-only">{ts('caption')}</caption>
                    <thead>
                      <tr className="border-border border-b">
                        <th scope="col" className={cn(TH, 'text-left')}>
                          {ts('cols.pos')}
                        </th>
                        <th scope="col" className={cn(TH, 'text-left')}>
                          {ts('cols.team')}
                        </th>
                        <th scope="col" className={TH}>
                          <abbr title={ts('colsFull.played')} className="no-underline">
                            {ts('cols.played')}
                          </abbr>
                        </th>
                        <th scope="col" className={TH}>
                          <abbr title={ts('colsFull.won')} className="no-underline">
                            {ts('cols.won')}
                          </abbr>
                        </th>
                        <th scope="col" className={TH}>
                          <abbr title={ts('colsFull.lost')} className="no-underline">
                            {ts('cols.lost')}
                          </abbr>
                        </th>
                        <th scope="col" className={TH}>
                          <abbr title={ts('colsFull.points')} className="no-underline">
                            {ts('cols.points')}
                          </abbr>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {top.map((row) => (
                        <tr key={row.teamId} className="border-border border-b last:border-b-0">
                          <td className="px-3 py-2.5 text-left">
                            <span className="font-display text-primary text-lg font-bold">{row.rank}</span>
                          </td>
                          <td className="max-w-[12rem] px-3 py-2.5 text-left">
                            <TeamChip name={row.team.name} color={row.team.color} />
                          </td>
                          <td className={TD}>{row.played}</td>
                          <td className={TD}>{row.won}</td>
                          <td className={TD}>{row.lost}</td>
                          <td className={TD}>
                            <b className="font-display text-lg">{row.points}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {bracket.closed && (
              <Section title={tn('bracket')} more={<SeeAll href={`/${year}/bracket`} label={t('seeAll')} />}>
                <div className="flex flex-col gap-3">{(['F', '3RD'] as const).map(bracketCard)}</div>
              </Section>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

export default function SeasonHomePage({ params }: PageProps<'/[locale]/[year]'>) {
  return (
    <Suspense>
      <SeasonHome params={params} />
    </Suspense>
  );
}

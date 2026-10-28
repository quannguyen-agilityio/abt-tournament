import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { TeamBadge } from '@/components/team-badge';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { signed } from '@/lib/format';
import {
  getGroupClosure,
  getPublicSeason,
  getSeasonMatches,
  getSeasonPlayers,
  getSeasonTeams,
  getTeamCaptains,
} from '@/lib/public-season-db';
import { buildTeamCards } from '@/lib/public-teams';
import { cn } from '@/lib/utils';

const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';

async function Teams({ params }: Pick<PageProps<'/[locale]/[year]/teams'>, 'params'>) {
  const { locale, year } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year)) notFound();
  setRequestLocale(locale);
  const [t, ts, tn] = await Promise.all([
    getTranslations('Public.teams'),
    getTranslations('Public.standings'),
    getTranslations('Nav'),
  ]);

  const season = await getPublicSeason(Number(year));
  if (!season) notFound();
  const [teams, captains, players, matches, finalOrder] = await Promise.all([
    getSeasonTeams(season.id),
    getTeamCaptains(season.id),
    getSeasonPlayers(season.id),
    getSeasonMatches(season.id, 'group'),
    getGroupClosure(season.id),
  ]);
  const cards = buildTeamCards({ teams, captains, players, matches, settings: season.settings, finalOrder });

  return (
    <>
      <h1 className="font-display mb-1 text-4xl font-extrabold uppercase">{tn('teams')}</h1>
      <p className="text-muted-foreground mb-5">{t('subtitle', { count: teams.length })}</p>

      {cards.length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-[10px] border p-8 text-center">
          {t('empty')}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ team, captain, position, stats }) => (
            <li key={team.id} className="min-w-0">
              <Link
                href={`/${year}/teams/${team.id}`}
                className={cn(
                  'border-border bg-surface hover:border-primary/60 flex h-full flex-col gap-3 rounded-[10px] border p-5 transition-colors',
                  team.disqualified && 'opacity-75',
                )}
              >
                <div className="flex items-center gap-3">
                  <TeamBadge name={team.name} color={team.color} className="size-9 text-xl" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{team.name}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {captain ? t('captainOf', { name: captain.name }) : t('noCaptain')}
                    </div>
                  </div>
                  {position === null ? (
                    <span className={cn(CHIP, 'border-loss/60 bg-loss/10 text-loss ml-auto')}>{t('disqualified')}</span>
                  ) : (
                    <abbr
                      title={t('positionFull', { position })}
                      className="font-display text-muted-foreground ml-auto text-2xl font-bold no-underline"
                    >
                      {t('position', { position })}
                    </abbr>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                  <abbr title={t('recordFull', { won: stats.won, lost: stats.lost })} className="no-underline">
                    {t('record', { won: stats.won, lost: stats.lost })}
                  </abbr>
                  <span className="text-muted-foreground">
                    <abbr title={ts('colsFull.setDiff')} className="no-underline">
                      {ts('cols.setDiff')}
                    </abbr>{' '}
                    {signed(stats.setDiff, locale)}
                  </span>
                  <span className="text-muted-foreground">
                    <abbr title={ts('colsFull.pointDiff')} className="no-underline">
                      {ts('cols.pointDiff')}
                    </abbr>{' '}
                    {signed(stats.pointDiff, locale)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TeamsPage({ params }: PageProps<'/[locale]/[year]/teams'>) {
  return (
    <Suspense>
      <Teams params={params} />
    </Suspense>
  );
}

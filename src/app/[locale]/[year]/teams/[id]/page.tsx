import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { MatchCard } from '@/components/match-card';
import { TeamBadge } from '@/components/team-badge';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { signed } from '@/lib/format';
import {
  getGroupClosure,
  getPublicSeason,
  getSeasonCourts,
  getSeasonMatches,
  getSeasonPlayers,
  getSeasonSchedule,
  getSeasonTeams,
  getTeamCaptains,
} from '@/lib/public-season-db';
import { buildTeamCards, buildTeamDetail } from '@/lib/public-teams';
import { cn } from '@/lib/utils';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';
const TH = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const TD = 'px-3 py-2.5';
const SECTION_HEADING = 'font-display mb-3 text-2xl font-bold uppercase';

async function TeamPage({ params }: Pick<PageProps<'/[locale]/[year]/teams/[id]'>, 'params'>) {
  const { locale, year, id } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year) || !UUID.test(id)) notFound();
  setRequestLocale(locale);
  const [t, ts, tp] = await Promise.all([
    getTranslations('Public.teams'),
    getTranslations('Public.standings'),
    getTranslations('Public'),
  ]);

  const season = await getPublicSeason(Number(year));
  if (!season) notFound();
  const [teams, captains, players, groupMatches, finalOrder, schedule, courts] = await Promise.all([
    getSeasonTeams(season.id),
    getTeamCaptains(season.id),
    getSeasonPlayers(season.id),
    getSeasonMatches(season.id, 'group'),
    getGroupClosure(season.id),
    getSeasonSchedule(season.id),
    getSeasonCourts(season.id),
  ]);
  const card = buildTeamCards({
    teams,
    captains,
    players,
    matches: groupMatches,
    settings: season.settings,
    finalOrder,
  }).find((c) => c.team.id === id);
  if (!card) notFound();

  const { team, captain, position, stats } = card;
  const { roster, matches } = buildTeamDetail({ teamId: id, players, schedule, settings: season.settings });
  const teamById = new Map(teams.map((x) => [x.id, x]));
  const courtById = new Map(courts.map((c) => [c.id, c.name]));

  return (
    <>
      <Link href={`/${year}/teams`} className="text-muted-foreground text-sm hover:underline">
        ← {t('back')}
      </Link>
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-4">
        <TeamBadge name={team.name} color={team.color} className="size-14 rounded-lg text-3xl" />
        <div className="min-w-0">
          <h1 className="font-display text-4xl leading-none font-extrabold break-words uppercase">{team.name}</h1>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
            {position === null ? (
              <span className={cn(CHIP, 'border-loss/60 bg-loss/10 text-loss')}>{t('disqualified')}</span>
            ) : (
              <abbr title={t('positionFull', { position })} className="no-underline">
                {t('position', { position })}
              </abbr>
            )}
            <span aria-hidden>·</span>
            <abbr title={t('recordFull', { won: stats.won, lost: stats.lost })} className="no-underline">
              {t('record', { won: stats.won, lost: stats.lost })}
            </abbr>
            <span aria-hidden>·</span>
            <span>
              <abbr title={ts('colsFull.sets')} className="no-underline">
                {ts('cols.sets')}
              </abbr>{' '}
              {stats.setsWon}–{stats.setsLost}
            </span>
            <span aria-hidden>·</span>
            <span>
              <abbr title={ts('colsFull.pointDiff')} className="no-underline">
                {ts('cols.pointDiff')}
              </abbr>{' '}
              {signed(stats.pointDiff, locale)}
            </span>
          </div>
          {team.disqualified && team.disqualifiedReason && (
            <p className="text-muted-foreground mt-1 text-sm">{team.disqualifiedReason}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0" aria-labelledby="roster">
          <h2 id="roster" className={SECTION_HEADING}>
            {t('roster')}
          </h2>
          {roster.length === 0 ? (
            <p className="text-muted-foreground">{t('noPlayers')}</p>
          ) : (
            <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
              <table className="w-full border-collapse text-sm tabular-nums">
                <caption className="sr-only">{t('rosterCaption', { team: team.name })}</caption>
                <thead>
                  <tr className="border-border border-b">
                    <th scope="col" className={TH}>
                      {t('cols.rank')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('cols.player')}
                    </th>
                    <th scope="col" className={cn(TH, 'text-right')}>
                      {t('cols.skill')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('cols.gender')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((player) => (
                    <tr
                      key={player.id}
                      className={cn(
                        'border-border border-b last:border-b-0',
                        player.status === 'withdrawn' && 'text-muted-foreground',
                      )}
                    >
                      <td className={TD}>
                        <b className="font-display text-lg">{t('rank', { rank: player.rank })}</b>
                      </td>
                      <td className={TD}>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link href={`/${year}/players/${player.slug}`} className="font-medium hover:underline">
                            {player.name}
                          </Link>
                          {player.id === captain?.id && (
                            <span className={cn(CHIP, 'border-primary/40 bg-brand-soft text-primary')}>
                              {t('captain')}
                            </span>
                          )}
                          {player.status === 'withdrawn' && (
                            <span className={cn(CHIP, 'border-border bg-surface-2')}>{t('withdrawn')}</span>
                          )}
                        </span>
                      </td>
                      <td className={cn(TD, 'text-right')}>{player.skill}</td>
                      <td className={TD}>{tp(`gender.${player.gender}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="min-w-0" aria-labelledby="team-matches">
          <h2 id="team-matches" className={SECTION_HEADING}>
            {t('matches')}
          </h2>
          {matches.length === 0 ? (
            <p className="text-muted-foreground">{t('noMatches')}</p>
          ) : (
            <div className="grid gap-3">
              {matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  year={year}
                  teams={teamById}
                  courts={courtById}
                  timeZone={season.settings.timezone}
                  withDate
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default function TeamDetailPage({ params }: PageProps<'/[locale]/[year]/teams/[id]'>) {
  return (
    <Suspense>
      <TeamPage params={params} />
    </Suspense>
  );
}

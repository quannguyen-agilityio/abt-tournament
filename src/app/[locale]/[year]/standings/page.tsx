import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { SeasonRefresh } from '@/components/season-refresh';
import { TeamChip } from '@/components/team-chip';
import { routing } from '@/i18n/routing';
import { signed } from '@/lib/format';
import { buildStandingsView, type StandingsHint } from '@/lib/public-standings';
import { getGroupClosure, getPublicSeason, getSeasonMatches, getSeasonTeams } from '@/lib/public-season-db';
import { cn } from '@/lib/utils';

const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';
const CHIP_WARN = 'border-warn/60 bg-warn/10 text-warn';
const CHIP_WIN = 'border-win/60 text-win';
const CHIP_NEUTRAL = 'border-border bg-surface-2 text-muted-foreground';

const TH = 'px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const TD = 'px-3 py-2.5 text-right';

function Abbr({ short, full }: { short: string; full: string }) {
  return (
    <abbr title={full} className="cursor-help no-underline">
      {short}
    </abbr>
  );
}

async function Standings({ params }: Pick<PageProps<'/[locale]/[year]/standings'>, 'params'>) {
  const { locale, year } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year)) notFound();
  setRequestLocale(locale);
  const [t, tp] = await Promise.all([getTranslations('Public.standings'), getTranslations('Public')]);

  const season = await getPublicSeason(Number(year));
  if (!season) notFound();
  const [teams, matches, finalOrder] = await Promise.all([
    getSeasonTeams(season.id),
    getSeasonMatches(season.id, 'group'),
    getGroupClosure(season.id),
  ]);
  const view = buildStandingsView({ teams, matches, settings: season.settings, finalOrder });
  const hintClass = (hint: StandingsHint) => (hint === 'draw' || hint === 'draw_pending' ? CHIP_WARN : CHIP_NEUTRAL);

  return (
    <>
      <h1 className="font-display mb-1 text-4xl font-extrabold uppercase">{t('title')}</h1>
      <p className="text-muted-foreground mb-5">
        {t('subtitle', { teams: teams.length, played: view.groupPlayed, total: view.groupTotal })}
      </p>
      <SeasonRefresh season={season} className="-mt-3 mb-5" />

      {teams.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <div className="border-border bg-surface rounded-[10px] border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm whitespace-nowrap tabular-nums">
                <caption className="sr-only">{t('caption')}</caption>
                <thead>
                  <tr className="border-border border-b">
                    <th scope="col" className={cn(TH, 'text-left')}>
                      {t('cols.pos')}
                    </th>
                    <th scope="col" className={cn(TH, 'text-left')}>
                      {t('cols.team')}
                    </th>
                    <th scope="col" className={TH}>
                      <Abbr short={t('cols.played')} full={t('colsFull.played')} />
                    </th>
                    <th scope="col" className={TH}>
                      <Abbr short={t('cols.won')} full={t('colsFull.won')} />
                    </th>
                    <th scope="col" className={TH}>
                      <Abbr short={t('cols.lost')} full={t('colsFull.lost')} />
                    </th>
                    <th scope="col" className={TH}>
                      <Abbr short={t('cols.points')} full={t('colsFull.points')} />
                    </th>
                    <th scope="col" className={TH}>
                      <Abbr short={t('cols.sets')} full={t('colsFull.sets')} />
                    </th>
                    <th scope="col" className={TH}>
                      <Abbr short={t('cols.setDiff')} full={t('colsFull.setDiff')} />
                    </th>
                    <th scope="col" className={TH}>
                      <Abbr short={t('cols.pointsFor')} full={t('colsFull.pointsFor')} />
                    </th>
                    <th scope="col" className={TH}>
                      <Abbr short={t('cols.pointDiff')} full={t('colsFull.pointDiff')} />
                    </th>
                    <th scope="col" className={cn(TH, 'text-left')}>
                      {t('cols.why')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => {
                    const cut = row.rank === view.qualifyingCount;
                    return (
                      <tr
                        key={row.teamId}
                        className={cn(
                          'border-border border-b last:border-b-0',
                          row.qualifies && 'bg-brand-soft/40',
                          cut && 'border-primary border-b-2 border-dashed',
                        )}
                      >
                        <td className="px-3 py-2.5 text-left">
                          <span
                            className={cn(
                              'font-display text-lg font-bold',
                              row.qualifies ? 'text-primary' : 'text-muted-foreground',
                            )}
                          >
                            {row.rank}
                          </span>
                        </td>
                        <td className="max-w-[16rem] px-3 py-2.5 text-left">
                          <TeamChip name={row.team.name} color={row.team.color} />
                        </td>
                        <td className={TD}>{row.played}</td>
                        <td className={TD}>{row.won}</td>
                        <td className={TD}>{row.lost}</td>
                        <td className={TD}>
                          <b className="font-display text-lg">{row.points}</b>
                        </td>
                        <td className={TD}>
                          {row.setsWon}–{row.setsLost}
                        </td>
                        <td className={TD}>{signed(row.setDiff, locale)}</td>
                        <td className={cn(TD, 'text-muted-foreground')}>
                          {row.pointsFor}–{row.pointsAgainst}
                        </td>
                        <td className={TD}>{signed(row.pointDiff, locale)}</td>
                        <td className="px-3 py-2.5 text-left">
                          {row.hint && <span className={cn(CHIP, hintClass(row.hint))}>{t(`hint.${row.hint}`)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className={cn(CHIP, view.closed ? CHIP_WIN : CHIP_WARN)}>
              {view.closed ? tp('closed') : tp('provisional')}
            </span>
            <span>{t('topCount', { count: view.qualifyingCount })}</span>
          </p>

          {view.disqualified.length > 0 && (
            <section className="mt-6 max-w-3xl">
              <h2 className="font-display mb-2 text-2xl font-bold tracking-wide uppercase">{t('disqualifiedTitle')}</h2>
              <ul className="grid gap-2 text-sm">
                {view.disqualified.map((team) => (
                  <li key={team.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <TeamChip name={team.name} color={team.color} />
                    <span className="text-muted-foreground">{team.disqualifiedReason ?? t('noReason')}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-2 text-sm">{t('disqualifiedNote')}</p>
            </section>
          )}
        </>
      )}

      <div className="text-muted-foreground mt-6 grid max-w-3xl gap-2 text-sm">
        <div className="text-xs font-semibold tracking-wider uppercase">{t('tiebreakTitle')}</div>
        <p>{t('tiebreak')}</p>
      </div>
    </>
  );
}

export default function StandingsPage({ params }: PageProps<'/[locale]/[year]/standings'>) {
  return (
    <Suspense>
      <Standings params={params} />
    </Suspense>
  );
}

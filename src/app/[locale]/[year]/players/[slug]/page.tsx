import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PlayerAvatar } from '@/components/player-avatar';
import { TeamChip } from '@/components/team-chip';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { buildPlayerProfile } from '@/lib/public-players';
import {
  getPersonHistory,
  getProfileMatches,
  getPublicSeason,
  getSeasonPlayers,
  getSeasonTeams,
  getTeamCaptains,
} from '@/lib/public-season-db';
import type { PublicPlayer } from '@/lib/public-teams';
import { cn } from '@/lib/utils';

const PANEL = 'border-border bg-surface rounded-[10px] border';
const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';
const CHIP_NEUTRAL = 'border-border bg-surface-2 text-muted-foreground';
const EYEBROW = 'text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase';
const TH = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const TD = 'px-3 py-2.5 align-top';
const SECTION_HEADING = 'font-display mb-3 text-2xl font-bold uppercase';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={cn(PANEL, 'p-4')}>
      <div className={EYEBROW}>{label}</div>
      <div className="font-display text-3xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function PlayerLinks({ ids, players, year }: { ids: string[]; players: Map<string, PublicPlayer>; year: string }) {
  const known = ids.map((id) => players.get(id)).filter((p): p is PublicPlayer => p !== undefined);
  if (known.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {known.map((p) => (
        <Link key={p.id} href={`/${year}/players/${p.slug}`} className="whitespace-nowrap hover:underline">
          {p.name}
        </Link>
      ))}
    </span>
  );
}

async function PlayerPage({ params }: Pick<PageProps<'/[locale]/[year]/players/[slug]'>, 'params'>) {
  const { locale, year, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year)) notFound();
  setRequestLocale(locale);
  const [t, tp, tm] = await Promise.all([
    getTranslations('Public.player'),
    getTranslations('Public'),
    getTranslations('Public.match'),
  ]);

  const season = await getPublicSeason(Number(year));
  if (!season) notFound();
  const [players, teams, captains, matches] = await Promise.all([
    getSeasonPlayers(season.id),
    getSeasonTeams(season.id),
    getTeamCaptains(season.id),
    getProfileMatches(season.id),
  ]);
  const player = players.find((p) => p.slug === decodeURIComponent(slug));
  if (!player) notFound();
  const history = await getPersonHistory(player.personId);

  const { stats, sets } = buildPlayerProfile(player.id, matches);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const team = player.teamId ? teams.find((x) => x.id === player.teamId) : undefined;
  const isCaptain = player.teamId !== null && captains.get(player.teamId) === player.id;
  const partner = stats.partner && playerById.get(stats.partner.id);

  return (
    <>
      <Link href={`/${year}/players`} className="text-muted-foreground text-sm hover:underline">
        ← {t('back')}
      </Link>
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-4">
        <PlayerAvatar
          name={player.name}
          src={player.avatarUrl}
          alt={t('avatar', { name: player.name })}
          size={64}
          className="text-3xl"
        />
        <div className="min-w-0">
          <h1 className="font-display text-4xl leading-none font-extrabold break-words uppercase">{player.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {team && (
              <Link href={`/${year}/teams/${team.id}`} className="min-w-0 hover:underline">
                <TeamChip name={team.name} color={team.color} />
              </Link>
            )}
            <span className={cn(CHIP, CHIP_NEUTRAL)}>{t('rank', { rank: player.rank })}</span>
            <span className={cn(CHIP, CHIP_NEUTRAL, 'tabular-nums')}>{t('skill', { skill: player.skill })}</span>
            <span className={cn(CHIP, CHIP_NEUTRAL)}>{tp(`gender.${player.gender}`)}</span>
            {isCaptain && (
              <span className={cn(CHIP, 'border-primary/40 bg-brand-soft text-primary')}>{t('captain')}</span>
            )}
            {player.status === 'withdrawn' && (
              <span className={cn(CHIP, 'border-warn/60 bg-warn/10 text-warn')}>{t('withdrawn')}</span>
            )}
          </div>
        </div>
      </div>

      <section aria-labelledby="season-stats" className="mb-8">
        <h2 id="season-stats" className="sr-only">
          {t('statsTitle')}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('setsPlayed')} value={stats.setsPlayed} />
          <Stat label={t('setRecord')} value={`${stats.setsWon}–${stats.setsLost}`} />
          <Stat label={t('points')} value={`${stats.pointsFor}–${stats.pointsAgainst}`} />
          <div className={cn(PANEL, 'min-w-0 p-4')}>
            <div className={EYEBROW}>{t('partner')}</div>
            <div className="mt-2 font-semibold">
              {partner && stats.partner ? (
                <>
                  <Link href={`/${year}/players/${partner.slug}`} className="hover:underline">
                    {partner.name}
                  </Link>{' '}
                  <abbr
                    title={t('partnerSetsFull', { sets: stats.partner.sets })}
                    className="text-muted-foreground text-sm whitespace-nowrap tabular-nums no-underline"
                  >
                    {t('partnerSets', { sets: stats.partner.sets })}
                  </abbr>
                </>
              ) : (
                <span className="text-muted-foreground">{t('noPartner')}</span>
              )}
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">{t('statsNote')}</p>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0" aria-labelledby="sets-played">
          <h2 id="sets-played" className={SECTION_HEADING}>
            {t('setsTitle')}
          </h2>
          {sets.length === 0 ? (
            <p className="text-muted-foreground">{t('noSets')}</p>
          ) : (
            <div className={cn(PANEL, 'relative overflow-x-auto')}>
              <table className="w-full min-w-[36rem] border-collapse text-sm tabular-nums">
                <caption className="sr-only">{t('setsCaption', { name: player.name })}</caption>
                <thead>
                  <tr className="border-border border-b">
                    <th scope="col" className={TH}>
                      {t('cols.match')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('cols.set')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('cols.partner')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('cols.opponents')}
                    </th>
                    <th scope="col" className={cn(TH, 'text-right')}>
                      {t('cols.score')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sets.map((set) => (
                    <tr key={`${set.matchCode}-${set.slotNo}`} className="border-border border-b last:border-b-0">
                      <td className={TD}>
                        <Link href={`/${year}/matches/${set.matchCode}`} className="font-semibold hover:underline">
                          {set.matchCode}
                        </Link>
                      </td>
                      <td className={cn(TD, 'whitespace-nowrap')}>
                        {t('set', { no: set.slotNo })}{' '}
                        <span className="text-muted-foreground text-xs">· {tm(`slotType.${set.slotType}`)}</span>
                      </td>
                      <td className={TD}>
                        <PlayerLinks ids={set.partnerIds} players={playerById} year={year} />
                      </td>
                      <td className={TD}>
                        <PlayerLinks ids={set.opponentIds} players={playerById} year={year} />
                      </td>
                      <td className={cn(TD, 'text-right')}>
                        <span
                          className={cn(
                            CHIP,
                            set.won ? 'border-win/60 bg-win/10 text-win' : 'border-loss/60 bg-loss/10 text-loss',
                          )}
                        >
                          <span className="sr-only">{set.won ? t('won') : t('lost')} </span>
                          {set.pointsFor}–{set.pointsAgainst}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="min-w-0" aria-labelledby="history">
          <h2 id="history" className={SECTION_HEADING}>
            {t('historyTitle')}
          </h2>
          <ol className={cn(PANEL, 'divide-border divide-y')}>
            {history.map((h) => {
              const current = String(h.year) === year;
              return (
                <li key={h.year}>
                  <Link
                    href={`/${h.year}/players/${player.slug}`}
                    aria-current={current ? 'page' : undefined}
                    className={cn('hover:bg-surface-2 flex items-center gap-3 p-4', current && 'bg-brand-soft/40')}
                  >
                    <span className={cn('font-display text-2xl font-bold', current && 'text-primary')}>{h.year}</span>
                    <div className="min-w-0">
                      {h.team ? (
                        <TeamChip name={h.team.name} color={h.team.color} />
                      ) : (
                        <span className="text-muted-foreground">{t('noTeam')}</span>
                      )}
                      <div className="text-muted-foreground text-xs tabular-nums">
                        {t('historyRankSkill', { rank: h.rank, skill: h.skill })}
                        {h.status === 'withdrawn' && ` · ${t('withdrawn')}`}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </>
  );
}

export default function PlayerProfilePage({ params }: PageProps<'/[locale]/[year]/players/[slug]'>) {
  return (
    <Suspense>
      <PlayerPage params={params} />
    </Suspense>
  );
}

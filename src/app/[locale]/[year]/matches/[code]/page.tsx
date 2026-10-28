import { hasLocale, useLocale, useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { MatchStatusChip, scoreTone, useStageLabel, type CardTeam } from '@/components/match-card';
import { TeamChip } from '@/components/team-chip';
import type { SeasonSettings, Side } from '@/domain';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { formatDate, formatTime } from '@/lib/format';
import { buildMatchDetail, type MatchDetailView, type MatchPlayer, type SlotView } from '@/lib/public-match';
import type { MatchScore } from '@/lib/public-matches';
import { getMatchDetail, getPublicSeason, getSeasonTeams, type MatchDetail } from '@/lib/public-season-db';
import { cn } from '@/lib/utils';

const CODE = /^(V\d{2}|SF[12]|3RD|F)$/;
const PANEL = 'border-border bg-surface rounded-[10px] border';
const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';
const ROW =
  'grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 p-4 sm:grid-cols-[110px_minmax(0,1fr)_140px_minmax(0,1fr)]';

type Teams = Record<Side, CardTeam | undefined>;

function Player({ player }: { player: MatchPlayer }) {
  const t = useTranslations('Public.match');
  return (
    <div>
      {player.name}{' '}
      <abbr
        title={t('rankSkillFull', { rank: player.rank, skill: player.skill })}
        className="text-muted-foreground text-xs whitespace-nowrap tabular-nums no-underline"
      >
        {t('rankSkill', { rank: player.rank, skill: player.skill })}
      </abbr>
    </div>
  );
}

function Pair({ players, start, side }: { players: MatchPlayer[]; start: number; side: Side }) {
  const t = useTranslations('Public.match');
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', side === 'away' && 'sm:items-end sm:text-right')}>
      {players.length > 0 ? players.map((p) => <Player key={p.id} player={p} />) : <span>—</span>}
      {start > 0 && (
        <span className="font-display bg-shuttle/15 text-warn w-fit rounded px-1.5 text-[13px] font-semibold">
          {t('start', { points: start })}
        </span>
      )}
    </div>
  );
}

function Score({ score, className }: { score: MatchScore | null; className?: string }) {
  if (!score) return <span className={cn('font-display text-muted-foreground', className)}>–</span>;
  return (
    <span className={cn('font-display leading-none font-bold tabular-nums', className)}>
      <span className={scoreTone(score, 'home')}>{score.home}</span>
      <span className="text-muted-foreground px-1">–</span>
      <span className={scoreTone(score, 'away')}>{score.away}</span>
    </span>
  );
}

function SlotRow({ slot, relay, teams }: { slot: SlotView; relay: boolean; teams: Teams }) {
  const t = useTranslations('Public.match');
  const winner = slot.winner ? teams[slot.winner] : undefined;
  return (
    <li className={ROW}>
      <div className="row-span-3 flex flex-col items-start gap-1.5 sm:row-span-1">
        <span className="font-display text-lg font-bold">{t(relay ? 'leg' : 'set', { no: slot.slotNo })}</span>
        <span
          className={cn(
            CHIP,
            slot.type === 'open'
              ? 'border-border bg-surface-2 text-muted-foreground'
              : 'border-primary/40 text-primary',
          )}
        >
          {t(`slotType.${slot.type}`)}
        </span>
        {slot.milestone !== null && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {t('toMilestone', { milestone: slot.milestone })}
          </span>
        )}
      </div>
      <Pair players={slot.pairs.home} start={slot.handicap.home} side="home" />
      <div className="text-center">
        {slot.score ? (
          <>
            <Score score={{ ...slot.score, winner: relay ? null : slot.winner }} className="text-3xl" />
            {winner && !relay && (
              <div className="text-muted-foreground mt-1 truncate text-xs">
                {t('winner')}: {winner.name}
              </div>
            )}
          </>
        ) : (
          <span className="text-muted-foreground text-sm">{t('notPlayed')}</span>
        )}
      </div>
      <Pair players={slot.pairs.away} start={slot.handicap.away} side="away" />
      {slot.substitutions.map((sub, i) => (
        <div key={i} className="col-span-full flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className={cn(CHIP, 'border-warn/60 bg-warn/10 text-warn')}>{t('substitution')}</span>
          <span className="text-muted-foreground">{teams[sub.side]?.name}:</span>
          <span>
            {sub.out?.name ?? '—'} → {sub.in?.name ?? '—'}
          </span>
          {sub.reason && <span className="text-muted-foreground">({sub.reason})</span>}
        </div>
      ))}
    </li>
  );
}

function RelayPanel({ view, teams }: { view: MatchDetailView; teams: Teams }) {
  const t = useTranslations('Public.match');
  const tb = useTranslations('Public.bracket');
  const relay = view.relay!;
  return (
    <div className={cn(PANEL, 'mb-4 p-4')}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">{tb('relayNote')}</span>
        <span className="ml-auto">
          {relay.start ? (
            <>
              {t('relayStart')}:{' '}
              <b className="font-display text-lg tabular-nums">
                {relay.start.home}–{relay.start.away}
              </b>{' '}
              <span className="text-muted-foreground">({t('relayCap', { cap: relay.cap })})</span>
            </>
          ) : (
            <span className="text-muted-foreground">{t('relayNoStart')}</span>
          )}
        </span>
      </div>
      <div className="mt-4 grid gap-2" role="group" aria-label={t('progress', { target: relay.target })}>
        {(['home', 'away'] as const).map((side) => {
          const team = teams[side];
          const value = relay.current[side];
          return (
            <div key={side} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_2.5rem] items-center gap-3">
              <span className="truncate text-sm font-semibold">{team?.name ?? '—'}</span>
              <div
                role="progressbar"
                aria-label={team?.name}
                aria-valuemin={0}
                aria-valuemax={relay.target}
                aria-valuenow={value}
                className="bg-surface-2 relative h-2 overflow-hidden rounded"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded"
                  style={{
                    width: `${Math.min(100, (value / relay.target) * 100)}%`,
                    backgroundColor: team?.color ?? 'var(--primary)',
                  }}
                />
                {relay.milestones.slice(0, -1).map((m) => (
                  <i
                    key={m}
                    className="bg-background absolute inset-y-0 w-px"
                    style={{ left: `${(m / relay.target) * 100}%` }}
                  />
                ))}
              </div>
              <span className="font-display text-right text-lg font-bold tabular-nums">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Body({
  match,
  view,
  teams,
  settings,
}: {
  match: MatchDetail;
  view: MatchDetailView;
  teams: Teams;
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match'>;
}) {
  const t = useTranslations('Public.match');
  const relay = view.relay !== null;

  if (match.status === 'forfeit') {
    const loser = match.forfeit_team_id === match.home_team_id ? teams.home : teams.away;
    return (
      <div className={cn(PANEL, 'flex items-start gap-3 p-5')}>
        <MatchStatusChip status="forfeit" />
        <div>
          <div className="font-semibold">
            {t('forfeitTitle', { team: loser?.name ?? '—' })}: {match.forfeit_reason || t('noReason')}
          </div>
          <div className="text-muted-foreground text-sm">
            {relay
              ? t('forfeitKo', { target: view.relay!.target })
              : t('forfeitGroup', { sets: settings.sets_per_match, target: settings.set_target })}
          </div>
        </div>
      </div>
    );
  }

  if (!view.lineupVisible || view.slots.length === 0) {
    return <div className={cn(PANEL, 'text-muted-foreground p-8 text-center')}>{t('lineupHidden')}</div>;
  }

  return (
    <>
      {relay && <RelayPanel view={view} teams={teams} />}
      <ol aria-label={t(relay ? 'legs' : 'sets')} className={cn(PANEL, 'divide-border divide-y')}>
        {view.slots.map((slot) => (
          <SlotRow key={slot.slotNo} slot={slot} relay={relay} teams={teams} />
        ))}
      </ol>
    </>
  );
}

function Header({
  match,
  view,
  teams,
  timeZone,
}: {
  match: MatchDetail;
  view: MatchDetailView;
  teams: Teams;
  timeZone: string;
}) {
  const t = useTranslations('Public');
  const locale = useLocale() as 'vi' | 'en';
  const stageLabel = useStageLabel();
  const when = match.scheduled_at ? new Date(match.scheduled_at) : null;
  const team = (side: Side) => {
    const value = teams[side];
    return value ? (
      <TeamChip name={value.name} color={value.color} />
    ) : (
      <span className="text-muted-foreground">{t('tbd')}</span>
    );
  };

  return (
    <div className={cn(PANEL, 'mt-3 mb-6 p-5 sm:p-6')}>
      <div className="text-muted-foreground mb-4 flex flex-wrap items-center gap-2 text-sm">
        <h1 className="font-display text-foreground text-lg font-bold">{match.code}</h1>
        <span>{stageLabel(match.stage, match.round)}</span>
        <MatchStatusChip status={match.status} className="ml-auto" />
      </div>
      <div className="grid grid-cols-2 items-center gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="min-w-0 text-lg sm:text-2xl">{team('home')}</div>
        <div className="col-span-2 row-start-2 text-center sm:col-span-1 sm:row-start-auto">
          <Score score={view.score} className="text-5xl sm:text-6xl" />
        </div>
        <div className="flex min-w-0 justify-end text-lg sm:text-2xl">{team('away')}</div>
      </div>
      <div className="border-border my-4 h-1.5 border-y" />
      <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
        {when && (
          <span>
            {formatDate(when, locale, timeZone)} · {formatTime(when, locale, timeZone)}
          </span>
        )}
        {match.court && <span>{match.court}</span>}
        {match.referee && <span>{t('match.referee', { name: match.referee })}</span>}
      </div>
    </div>
  );
}

async function MatchPage({ params }: Pick<PageProps<'/[locale]/[year]/matches/[code]'>, 'params'>) {
  const { locale, year, code } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year) || !CODE.test(code)) notFound();
  setRequestLocale(locale);
  const [t, tn] = await Promise.all([getTranslations('Public.match'), getTranslations('Nav')]);

  const season = await getPublicSeason(Number(year));
  if (!season) notFound();
  const [match, seasonTeams] = await Promise.all([getMatchDetail(season.id, code), getSeasonTeams(season.id)]);
  if (!match) notFound();

  const view = buildMatchDetail({ match, players: match.players, settings: season.settings });
  const byId = new Map(seasonTeams.map((team) => [team.id, team]));
  const home = match.home_team_id ? byId.get(match.home_team_id) : undefined;
  const away = match.away_team_id ? byId.get(match.away_team_id) : undefined;
  const teams: Teams = { home, away };
  const disqualified = [home, away].find((team) => team?.disqualified);

  return (
    <>
      <Link href={`/${year}/matches`} className="text-muted-foreground text-sm hover:underline">
        ← {tn('matches')}
      </Link>
      <Header match={match} view={view} teams={teams} timeZone={season.settings.timezone} />
      {match.status === 'annulled' && (
        <div className={cn(PANEL, 'border-loss/60 mb-4 flex items-start gap-3 p-4 text-sm')}>
          <MatchStatusChip status="annulled" />
          <div>
            {disqualified && (
              <div className="font-semibold">
                {t('annulledReason', {
                  team: disqualified.name,
                  reason: disqualified.disqualifiedReason || t('noReason'),
                })}
              </div>
            )}
            <div className="text-muted-foreground">{t('annulledNote')}</div>
          </div>
        </div>
      )}
      <Body match={match} view={view} teams={teams} settings={season.settings} />
    </>
  );
}

export default function MatchDetailPage({ params }: PageProps<'/[locale]/[year]/matches/[code]'>) {
  return (
    <Suspense>
      <MatchPage params={params} />
    </Suspense>
  );
}

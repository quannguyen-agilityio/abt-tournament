import { useLocale, useTranslations } from 'next-intl';
import { TeamChip } from '@/components/team-chip';
import type { MatchStage, MatchStatus } from '@/domain';
import { Link } from '@/i18n/navigation';
import { formatTime } from '@/lib/format';
import type { MatchCard as MatchCardData, MatchScore } from '@/lib/public-matches';
import { cn } from '@/lib/utils';

const STATUS_CHIP: Partial<Record<MatchStatus, string>> = {
  lineup_locked: 'border-primary/40 bg-brand-soft text-primary',
  in_progress: 'border-loss/60 text-loss',
  forfeit: 'border-warn/60 bg-warn/10 text-warn',
  annulled: 'border-loss/60 bg-loss/10 text-loss',
};

export type CardTeam = { name: string; color: string };

export function MatchStatusChip({ status, className }: { status: MatchStatus; className?: string }) {
  const t = useTranslations('Public.matchStatus');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_CHIP[status] ?? 'border-border bg-surface-2 text-muted-foreground',
        className,
      )}
    >
      {t(status)}
    </span>
  );
}

/** "Group · Round 3", or the knock-out stage name. */
export function useStageLabel() {
  const t = useTranslations('Public');
  return (stage: MatchStage, round: number | null) =>
    stage === 'group' ? (round === null ? t('stage.group') : t('groupRound', { round })) : t(`stage.${stage}`);
}

/** Muted unless this side won; both stay plain while the match is undecided. */
export const scoreTone = (score: MatchScore, side: 'home' | 'away') =>
  score.winner !== null && score.winner !== side ? 'text-muted-foreground' : undefined;

/** One P3 schedule card. Links to the match page (P4). */
export function MatchCard({
  match,
  year,
  teams,
  courts,
  timeZone,
}: {
  match: MatchCardData;
  year: string;
  teams: ReadonlyMap<string, CardTeam>;
  courts: ReadonlyMap<string, string>;
  timeZone: string;
}) {
  const t = useTranslations('Public');
  const locale = useLocale() as 'vi' | 'en';
  const stageLabel = useStageLabel();
  const { score } = match;
  const court = match.court_id ? courts.get(match.court_id) : undefined;

  return (
    <Link
      href={`/${year}/matches/${match.code}`}
      className="border-border bg-surface hover:border-primary/60 flex min-w-0 flex-col gap-3 rounded-[10px] border p-4 transition-colors"
    >
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="font-display text-foreground text-sm font-semibold">{match.code}</span>
        <span aria-hidden>·</span>
        <span className="truncate">{stageLabel(match.stage, match.round)}</span>
        <MatchStatusChip status={match.status} className="ml-auto" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
        {(['home', 'away'] as const).map((side) => {
          const teamId = match[`${side}_team_id`];
          const team = teamId ? teams.get(teamId) : undefined;
          return [
            <div key={`${side}-team`} className="min-w-0">
              {team ? (
                <TeamChip name={team.name} color={team.color} />
              ) : (
                <span className="text-muted-foreground">{t('tbd')}</span>
              )}
            </div>,
            <div
              key={`${side}-score`}
              className={cn('font-display text-right text-xl font-bold tabular-nums', score && scoreTone(score, side))}
            >
              {score?.[side] ?? ''}
            </div>,
          ];
        })}
      </div>
      {(match.scheduled_at || court) && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
          {match.scheduled_at && <span>{formatTime(new Date(match.scheduled_at), locale, timeZone)}</span>}
          {court && <span>{court}</span>}
        </div>
      )}
    </Link>
  );
}

import { useLocale, useTranslations } from 'next-intl';
import { TeamChip } from '@/components/team-chip';
import { Link } from '@/i18n/navigation';
import { formatDate, formatTime } from '@/lib/format';
import type { BracketSide, BracketSlotView } from '@/lib/public-bracket';
import { cn } from '@/lib/utils';

const STATUS_CHIP: Record<string, string> = {
  in_progress: 'border-loss/60 text-loss',
  forfeit: 'border-warn/60 bg-warn/10 text-warn',
};

export type BracketTeam = { name: string; color: string };

function SideRow({ side, team, dim }: { side: BracketSide; team: BracketTeam | undefined; dim: boolean }) {
  const t = useTranslations('Public.bracket');
  const { source } = side;
  const label =
    source.kind === 'seed'
      ? t('seed', { seed: source.seed })
      : t(source.kind === 'winner' ? 'winnerOf' : 'loserOf', { code: source.of });

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {team ? (
          <>
            <TeamChip name={team.name} color={team.color} className={cn(dim && 'text-muted-foreground')} />
            {side.seed !== null && (
              <span className="text-muted-foreground text-xs">{t('seedNumber', { seed: side.seed })}</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground truncate">{label}</span>
        )}
      </div>
      <div className={cn('font-display text-right text-xl tabular-nums', dim && 'text-muted-foreground')}>
        {side.score ?? ''}
      </div>
    </>
  );
}

/** One knock-out match. Links to the match page once the match exists. */
export function BracketCard({
  slot,
  year,
  teams,
}: {
  slot: BracketSlotView;
  year: string;
  teams: ReadonlyMap<string, BracketTeam>;
}) {
  const t = useTranslations('Public');
  const locale = useLocale() as 'vi' | 'en';
  const finished = slot.home.won || slot.away.won;
  const when = slot.scheduledAt ? new Date(slot.scheduledAt) : null;
  const stage = slot.code === 'F' ? 'final' : slot.code === '3RD' ? 'third_place' : 'semi_final';

  const body = (
    <>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="font-display text-foreground text-sm font-semibold">{slot.code}</span>
        <span aria-hidden>·</span>
        <span>{t(`stage.${stage}`)}</span>
        <span className="ml-auto">
          {slot.status ? (
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                STATUS_CHIP[slot.status] ?? 'border-border bg-surface-2 text-muted-foreground',
              )}
            >
              {t(`matchStatus.${slot.status}`)}
            </span>
          ) : (
            t('bracket.empty')
          )}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
        {([slot.home, slot.away] as const).map((side, i) => (
          <SideRow
            key={i}
            side={side}
            team={side.teamId ? teams.get(side.teamId) : undefined}
            dim={finished && !side.won}
          />
        ))}
      </div>
      {(when || slot.court || slot.forfeitReason) && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
          {when && (
            <span>
              {formatDate(when, locale)} · {formatTime(when, locale)}
            </span>
          )}
          {slot.court && <span>{slot.court}</span>}
          {slot.forfeitReason && <span className="basis-full">{slot.forfeitReason}</span>}
        </div>
      )}
    </>
  );

  const className = 'border-border bg-surface flex min-w-0 flex-col gap-3 rounded-[10px] border p-4';
  return slot.exists ? (
    <Link href={`/${year}/matches/${slot.code}`} className={cn(className, 'hover:border-primary/60 transition-colors')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

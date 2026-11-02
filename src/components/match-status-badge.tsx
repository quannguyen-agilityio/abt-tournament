import { useTranslations } from 'next-intl';
import type { Database } from '@/lib/database.types';
import { cn } from '@/lib/utils';

export type MatchStatus = Database['public']['Enums']['match_status'];

const TONE: Record<MatchStatus, string> = {
  scheduled: 'border-border bg-surface-2',
  lineup_locked: 'bg-brand-soft text-primary border-transparent',
  in_progress: 'text-loss border-loss/40',
  completed: 'border-border bg-surface-2',
  forfeit: 'text-warn border-warn/40 bg-warn/10',
  annulled: 'text-loss border-loss/35 bg-loss/10',
};

/** A match status chip; a live match gets a dot. */
export function MatchStatusBadge({ status, className }: { status: MatchStatus; className?: string }) {
  const t = useTranslations('MatchStatus');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE[status],
        className,
      )}
    >
      {status === 'in_progress' && (
        <span aria-hidden className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
      )}
      {t(status)}
    </span>
  );
}

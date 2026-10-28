import { useTranslations } from 'next-intl';
import { TeamChip } from '@/components/team-chip';
import type { Handicap } from '@/domain/handicap';
import type { SlotType } from '@/domain/settings';
import { cn } from '@/lib/utils';
import { UnlockForm } from './unlock-form';

export type LockedSlot = {
  slotNo: number;
  slotType: SlotType;
  home: string[];
  away: string[];
  /** Group start points, as snapshot at the lock. */
  handicap: Handicap;
};

type Props = {
  matchId: string;
  code: string;
  relay: boolean;
  /** Relay only: the start of leg 1, as snapshot at the lock. */
  relayStart: Handicap | null;
  teams: { id: string; name: string; color: string }[];
  slots: LockedSlot[];
  /** The BTC sees Unlock while the match is `lineup_locked`. */
  canUnlock: boolean;
};

function Start({ points }: { points: number }) {
  if (points <= 0) return null;
  return (
    <span className="font-display bg-shuttle/15 text-warn w-fit rounded px-1.5 text-[13px] font-semibold tabular-nums">
      +{points}
    </span>
  );
}

/** A5 step 3 once done: both lineups with the handicap snapshot, read-only. */
export function LockedLineups({ matchId, code, relay, relayStart, teams, slots, canUnlock }: Props) {
  const t = useTranslations('Admin.match.lock');
  const tl = useTranslations('Admin.match.lineup');
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="border-win/35 bg-win/10 rounded-[10px] border p-3 text-sm">
        {t('locked')}
      </p>
      {relay && relayStart && (
        <p className="border-border bg-surface rounded-[10px] border p-3 text-sm">
          {t('relayStart')}:{' '}
          <b className="font-display text-lg tabular-nums">
            {relayStart.home}–{relayStart.away}
          </b>
        </p>
      )}
      <div className="border-border bg-surface overflow-hidden rounded-[10px] border">
        <div className="border-border grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b p-3 text-sm sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)]">
          <span />
          {teams.map((team) => (
            <TeamChip key={team.id} name={team.name} color={team.color} />
          ))}
        </div>
        <ul className="divide-border divide-y">
          {slots.map((slot) => (
            <li
              key={slot.slotNo}
              className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 p-3 sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)]"
            >
              <div className="flex flex-col">
                <b className="font-display">{tl(relay ? 'leg' : 'set', { no: slot.slotNo })}</b>
                <span className={cn('text-xs', slot.slotType === 'open' ? 'text-muted-foreground' : 'text-primary')}>
                  {tl(`slotType.${slot.slotType}`)}
                </span>
              </div>
              {(['home', 'away'] as const).map((side) => (
                <div key={side} className="flex min-w-0 flex-col gap-0.5 text-sm">
                  {slot[side].map((name, i) => (
                    <span key={i} className="truncate">
                      {name}
                    </span>
                  ))}
                  {!relay && <Start points={slot.handicap[side]} />}
                </div>
              ))}
            </li>
          ))}
        </ul>
      </div>
      {canUnlock && <UnlockForm matchId={matchId} code={code} />}
    </div>
  );
}

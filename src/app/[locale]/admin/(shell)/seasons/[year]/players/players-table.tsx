'use client';

import { useLocale, useTranslations } from 'next-intl';
import { startTransition, useActionState, useOptimistic, type FormEvent } from 'react';
import type { MemberType } from '@/domain/settings';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { setPlayerFeePaid, setPlayerStatus, type PlayerActionState } from './actions';
import { EditPlayerDialog, type Team } from './player-form';

export type PlayerRow = {
  id: string;
  fullName: string;
  gender: 'male' | 'female';
  rank: number;
  skillPoints: number;
  status: 'active' | 'withdrawn';
  teamId: string | null;
  teamName: string | null;
  teamColor: string | null;
  /** `null` when the player has no private row yet. */
  memberType: MemberType | null;
  feeAmount: number | null;
  paid: boolean;
};

const CELL = 'px-3 py-2 align-middle';

function Hidden({ seasonId, playerId }: { seasonId: string; playerId: string }) {
  return (
    <>
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="seasonPlayerId" value={playerId} />
    </>
  );
}

/**
 * Submits a row form in a transition instead of through `action`: React resets a form after its action,
 * which puts a controlled checkbox back to its initial state even after the server confirmed the change.
 */
function submitInTransition(e: FormEvent<HTMLFormElement>, run: (formData: FormData) => void) {
  e.preventDefault();
  const formData = new FormData(e.currentTarget);
  startTransition(() => run(formData));
}

function TeamChip({ name, color }: { name: string | null; color: string | null }) {
  const t = useTranslations('Admin.players');
  if (!name) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="bg-muted inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      <span aria-hidden="true" className="size-2 rounded-full" style={color ? { backgroundColor: color } : undefined} />
      <span className="sr-only">{t('columns.team')}: </span>
      {name}
    </span>
  );
}

function PlayerTableRow({
  seasonId,
  player,
  teams,
  maxRank,
  defaultFees,
}: {
  seasonId: string;
  player: PlayerRow;
  teams: Team[];
  maxRank: number;
  defaultFees: Record<MemberType, number>;
}) {
  const t = useTranslations('Admin.players');
  const locale = useLocale() as 'vi' | 'en';
  const [paidState, paidAction, paidPending] = useActionState<PlayerActionState, FormData>(setPlayerFeePaid, undefined);
  const [statusState, statusAction, statusPending] = useActionState<PlayerActionState, FormData>(
    setPlayerStatus,
    undefined,
  );
  // Shown on the current frame; falls back to the server props when the action ends (reverted on failure).
  const [optimistic, setOptimistic] = useOptimistic(
    { paid: player.paid, status: player.status },
    (current, update: Partial<Pick<PlayerRow, 'paid' | 'status'>>) => ({ ...current, ...update }),
  );
  const withdrawn = optimistic.status === 'withdrawn';
  const failed = (paidState && 'error' in paidState) || (statusState && 'error' in statusState);

  return (
    <>
      <tr className={`border-border border-t ${withdrawn ? 'text-muted-foreground' : ''}`}>
        <td className={`${CELL} font-medium`}>
          <span className="flex flex-wrap items-center gap-2">
            {player.fullName}
            {withdrawn && (
              <span className="bg-muted text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                {t('withdrawn')}
              </span>
            )}
          </span>
        </td>
        <td className={CELL}>{t(`gender.${player.gender}`)}</td>
        <td className={`${CELL} tabular-nums`}>R{player.rank}</td>
        <td className={`${CELL} tabular-nums`}>{player.skillPoints}</td>
        <td className={CELL}>
          <TeamChip name={player.teamName} color={player.teamColor} />
        </td>
        <td className={CELL}>{player.memberType ? t(`memberType.${player.memberType}`) : '—'}</td>
        <td className={`${CELL} tabular-nums`}>
          {player.feeAmount === null ? '—' : formatMoney(player.feeAmount, locale)}
        </td>
        <td className={CELL}>
          <form
            onSubmit={(e) =>
              submitInTransition(e, (formData) => {
                setOptimistic({ paid: formData.get('paid') === 'true' });
                paidAction(formData);
              })
            }
          >
            <Hidden seasonId={seasonId} playerId={player.id} />
            <input type="hidden" name="paid" value={String(!optimistic.paid)} />
            <input
              type="checkbox"
              className="size-4"
              checked={optimistic.paid}
              disabled={paidPending}
              aria-label={t('paidLabel', { name: player.fullName })}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </form>
        </td>
        <td className={CELL}>
          <div className="flex items-center gap-2">
            <EditPlayerDialog
              seasonId={seasonId}
              player={player}
              teams={teams}
              maxRank={maxRank}
              defaultFees={defaultFees}
            />
            <form
              onSubmit={(e) =>
                submitInTransition(e, (formData) => {
                  setOptimistic({ status: formData.get('status') === 'active' ? 'active' : 'withdrawn' });
                  statusAction(formData);
                })
              }
            >
              <Hidden seasonId={seasonId} playerId={player.id} />
              <input type="hidden" name="status" value={withdrawn ? 'active' : 'withdrawn'} />
              <Button type="submit" size="sm" variant={withdrawn ? 'outline' : 'destructive'} pending={statusPending}>
                {withdrawn ? t('reinstate') : t('withdraw')}
                <span className="sr-only"> {player.fullName}</span>
              </Button>
            </form>
          </div>
        </td>
      </tr>
      {failed && (
        <tr>
          <td colSpan={9} className="px-3 pb-2">
            <p role="alert" className="text-destructive text-sm">
              {t('errors.failed')}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

export function PlayersTable({
  seasonId,
  players,
  teams,
  maxRank,
  defaultFees,
}: {
  seasonId: string;
  players: PlayerRow[];
  teams: Team[];
  maxRank: number;
  defaultFees: Record<MemberType, number>;
}) {
  const t = useTranslations('Admin.players');

  if (players.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('empty')}</p>;
  }

  const columns = ['player', 'gender', 'rank', 'skill', 'team', 'memberType', 'fee', 'paid', 'actions'] as const;

  return (
    <div className="border-border bg-surface relative overflow-x-auto rounded-[10px] border">
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm" aria-label={t('tableLabel')}>
        <thead>
          <tr className="text-muted-foreground text-xs uppercase">
            {columns.map((column) => (
              <th key={column} scope="col" className="px-3 py-2 font-medium">
                {t(`columns.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <PlayerTableRow
              key={player.id}
              seasonId={seasonId}
              player={player}
              teams={teams}
              maxRank={maxRank}
              defaultFees={defaultFees}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

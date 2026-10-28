'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useState } from 'react';
import { TeamChip } from '@/components/team-chip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { saveAttendance, type AttendanceState } from './actions';

export type AttendancePlayer = { id: string; name: string; rank: number; skillPoints: number };

type Props = {
  matchId: string;
  team: { id: string; name: string; color: string };
  players: AttendancePlayer[];
  present: string[];
  minPresent: number;
  editable: boolean;
  isBtc: boolean;
};

/** One team's attendance: tick the present players, with a live count (A5 step 1). */
export function AttendanceForm({ matchId, team, players, present, minPresent, editable, isBtc }: Props) {
  const t = useTranslations('Admin.match.attendance');
  const [ticked, setTicked] = useState(() => new Set(present));
  const [state, action, pending] = useActionState<AttendanceState, FormData>(saveAttendance, undefined);
  const [dirty, setDirty] = useState(false);
  const count = ticked.size;
  const below = count < minPresent;
  const headingId = `attendance-${team.id}`;

  const toggle = (id: string, on: boolean) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    setDirty(true);
  };

  return (
    <form
      // Not `action`: React resets a form after an action, which would undo the controlled ticks.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setDirty(false);
        startTransition(() => action(formData));
      }}
      aria-labelledby={headingId}
      className="border-border bg-surface flex min-w-0 flex-col rounded-[10px] border"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="teamId" value={team.id} />
      <div className="border-border flex items-center gap-2 border-b p-4">
        <h2 id={headingId} className="min-w-0">
          <TeamChip name={team.name} color={team.color} />
        </h2>
        <span
          role="status"
          className={cn(
            'ml-auto rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
            below ? 'text-loss border-loss/35 bg-loss/10' : 'border-border bg-surface-2',
          )}
        >
          {t('count', { count, total: players.length })}
        </span>
      </div>

      {players.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">{t('noPlayers')}</p>
      ) : (
        <ul className="p-2">
          {players.map((player) => (
            <li key={player.id}>
              <label className="hover:bg-surface-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-2 has-disabled:cursor-default">
                <input
                  type="checkbox"
                  name="present"
                  value={player.id}
                  checked={ticked.has(player.id)}
                  disabled={!editable}
                  onChange={(e) => toggle(player.id, e.target.checked)}
                  className="accent-primary size-4 shrink-0"
                />
                <b className="font-display w-7 shrink-0">R{player.rank}</b>
                <span className="min-w-0 truncate">{player.name}</span>
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">{player.skillPoints}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {below && (
        <div className="border-loss/40 bg-loss/10 mx-4 mb-4 flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <p role="alert">{t('belowMinimum', { count, minimum: minPresent })}</p>
          {isBtc && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Wired up with the disqualification flow (spec §4.5). */}
              <Button type="button" variant="destructive" size="sm" disabled>
                {t('disqualify')}
              </Button>
              <span className="text-muted-foreground text-xs">{t('disqualifySoon')}</span>
            </div>
          )}
        </div>
      )}

      {editable ? (
        <div className="border-border mt-auto flex flex-wrap items-center justify-end gap-3 border-t p-4">
          {state && 'error' in state && (
            <p role="alert" className="text-destructive text-sm">
              {t(`errors.${state.error}`)}
            </p>
          )}
          {state && 'ok' in state && !dirty && (
            <p role="status" className="text-sm">
              <span className="text-win font-semibold">✓</span> {t('saved')}
            </p>
          )}
          <Button type="submit" disabled={pending || players.length === 0}>
            {pending ? t('saving') : t('save')}
          </Button>
        </div>
      ) : (
        <p className="border-border text-muted-foreground mt-auto border-t p-4 text-sm">{t('locked')}</p>
      )}
    </form>
  );
}

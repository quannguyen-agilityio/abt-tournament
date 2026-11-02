'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { TeamChip } from '@/components/team-chip';
import { Button } from '@/components/ui/button';
import type { Score } from '@/domain/score';
import { completeMatch, reopenMatch, type CompleteState, type ReopenState } from './actions';

type Team = { name: string; color: string };

type Props = {
  matchId: string;
  code: string;
  /** The winner derived from the saved scores, or null while a row is missing or invalid. */
  winner: Team | null;
  /** Sets won (group) or the final relay score, home first. */
  score: Score;
};

/** A5 step 5: completes the match once the saved scores decide it (spec §4.4). */
export function CompleteForm({ matchId, code, winner, score }: Props) {
  const t = useTranslations('Admin.match.complete');
  const [state, action, pending] = useActionState<CompleteState, FormData>(completeMatch, undefined);
  const result = `${score.home}–${score.away}`;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!winner || !window.confirm(t('confirm', { code, team: winner.name, score: result }))) e.preventDefault();
      }}
      className="border-border bg-surface flex flex-wrap items-center justify-end gap-3 rounded-[10px] border p-4"
    >
      <input type="hidden" name="matchId" value={matchId} />
      {winner ? (
        <p className="mr-auto flex flex-wrap items-center gap-2 text-sm">
          {t('winner')} <TeamChip name={winner.name} color={winner.color} />
          <b className="font-display text-lg tabular-nums">{result}</b>
        </p>
      ) : (
        <p className="text-muted-foreground mr-auto max-w-prose text-sm">{t('notReady')}</p>
      )}
      {state?.error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <Button type="submit" disabled={pending || !winner}>
        {pending ? t('completing') : t('complete')}
      </Button>
    </form>
  );
}

/** The completed result, with Reopen for the BTC (audited). */
export function CompletedResult({ matchId, code, winner, score, canReopen }: Props & { canReopen: boolean }) {
  const t = useTranslations('Admin.match.complete');
  const [state, action, pending] = useActionState<ReopenState, FormData>(reopenMatch, undefined);
  return (
    <div className="flex flex-col gap-4">
      <p
        role="status"
        className="border-win/35 bg-win/10 flex flex-wrap items-center gap-2 rounded-[10px] border p-3 text-sm"
      >
        {t('completed')}{' '}
        {winner && (
          <>
            {t('winner')} <TeamChip name={winner.name} color={winner.color} />
          </>
        )}
        <b className="font-display text-lg tabular-nums">
          {score.home}–{score.away}
        </b>
      </p>
      {canReopen && (
        <form
          action={action}
          onSubmit={(e) => {
            if (!window.confirm(t('reopenConfirm', { code }))) e.preventDefault();
          }}
          className="border-border bg-surface flex flex-wrap items-center justify-end gap-3 rounded-[10px] border p-4"
        >
          <input type="hidden" name="matchId" value={matchId} />
          <p className="text-muted-foreground mr-auto max-w-prose text-sm">{t('reopenHint')}</p>
          {state?.error && (
            <p role="alert" className="text-destructive text-sm">
              {t(`reopenErrors.${state.error}`)}
            </p>
          )}
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? t('reopening') : t('reopen')}
          </Button>
        </form>
      )}
    </div>
  );
}

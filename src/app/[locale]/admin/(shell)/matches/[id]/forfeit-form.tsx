'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useState } from 'react';
import { TeamChip } from '@/components/team-chip';
import { Button } from '@/components/ui/button';
import type { Side } from '@/domain/lineup';
import type { SeasonSettings } from '@/domain/settings';
import { forfeitResult } from '@/lib/match-forfeit';
import { forfeitMatch, type ForfeitState } from './actions';

export type ForfeitTeam = { id: string; name: string; color: string };

type Props = {
  matchId: string;
  code: string;
  stage: string;
  /** Home first. */
  teams: [ForfeitTeam, ForfeitTeam];
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match' | 'relay_milestones'>;
};

const INPUT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 min-h-9 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm font-normal outline-none focus-visible:ring-3';

/** The result line of a forfeit by `side`: the winner and the recorded score (spec §4.5, D17, A5). */
export function useForfeitSummary(
  stage: string,
  teams: readonly [ForfeitTeam, ForfeitTeam],
  settings: Props['settings'],
) {
  const t = useTranslations('Admin.match.forfeit');
  return (side: Side) => {
    const { winner, score, perSlot } = forfeitResult(stage, side, settings);
    const team = teams[winner === 'home' ? 0 : 1].name;
    const points = (s: { home: number; away: number }) => `${s[winner]}–${s[winner === 'home' ? 'away' : 'home']}`;
    return perSlot
      ? t('previewGroup', { team, sets: points(score), target: points(perSlot) })
      : t('previewKo', { team, score: points(score) });
  };
}

/** Records a forfeit (spec §4.5, A5): the other team wins, and the reason is shown publicly. */
export function ForfeitForm({ matchId, code, stage, teams, settings }: Props) {
  const t = useTranslations('Admin.match.forfeit');
  const [state, action, pending] = useActionState<ForfeitState, FormData>(forfeitMatch, undefined);
  const [teamId, setTeamId] = useState('');
  const [reason, setReason] = useState('');
  const summary = useForfeitSummary(stage, teams, settings);

  const index = teams.findIndex((team) => team.id === teamId);
  const loser = index >= 0 ? teams[index] : null;
  const preview = loser ? summary(index === 0 ? 'home' : 'away') : null;
  const ready = loser !== null && reason.trim() !== '';

  return (
    <form
      // Not `action`: React resets a form after an action, which would undo the controlled picks.
      onSubmit={(e) => {
        e.preventDefault();
        if (!loser || !preview || !window.confirm(t('confirm', { code, team: loser.name, result: preview }))) return;
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      aria-labelledby="forfeit-title"
      className="border-border bg-surface flex flex-col gap-3 rounded-[10px] border p-4"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <div>
        <h2 id="forfeit-title" className="font-display text-lg font-bold uppercase">
          {t('title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('hint')}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('team')}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {teams.map((team) => (
            <label key={team.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="teamId"
                value={team.id}
                checked={teamId === team.id}
                onChange={() => setTeamId(team.id)}
                required
              />
              <TeamChip name={team.name} color={team.color} />
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('reason')}
        <textarea
          name="reason"
          value={reason}
          rows={2}
          maxLength={500}
          required
          onChange={(e) => setReason(e.target.value)}
          className={INPUT}
        />
        <span className="text-muted-foreground text-xs font-normal">{t('reasonHint')}</span>
      </label>

      {preview && <p className="border-warn/40 bg-warn/10 rounded-lg border p-3 text-sm font-medium">{preview}</p>}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {state && 'error' in state && (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${state.error}`)}
          </p>
        )}
        <Button type="submit" variant="destructive" disabled={pending || !ready}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  );
}

/** What a forfeited match recorded: who forfeited and why, and the result (spec §4.5). */
export function ForfeitResult({
  stage,
  side,
  teams,
  reason,
  settings,
}: {
  stage: string;
  /** The side that forfeited. */
  side: Side;
  teams: [ForfeitTeam, ForfeitTeam];
  reason: string;
  settings: Props['settings'];
}) {
  const t = useTranslations('Admin.match.forfeit');
  const summary = useForfeitSummary(stage, teams, settings);
  const loser = teams[side === 'home' ? 0 : 1];
  return (
    <div role="status" className="border-warn/40 bg-warn/10 flex flex-col gap-2 rounded-[10px] border p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        <TeamChip name={loser.name} color={loser.color} />
        {t('result.team')}
      </p>
      <p>{t('result.reason', { reason })}</p>
      <p className="font-medium">{summary(side)}</p>
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useState } from 'react';
import { TeamChip } from '@/components/team-chip';
import { Button } from '@/components/ui/button';
import type { DisqualificationPlan, DisqualificationRow } from '@/lib/match-disqualification';
import { disqualifyTeam, type DisqualifyState } from './actions';

export type DisqualifyTeam = { id: string; name: string; color: string; plan: DisqualificationPlan };

const INPUT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 min-h-9 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm font-normal outline-none focus-visible:ring-3';

/** "V01: Completed → Annulled", one line per match a disqualification or reinstatement changes. */
export function useChangeLine() {
  const status = useTranslations('MatchStatus');
  return (row: DisqualificationRow) => `${row.code}: ${status(row.from)} → ${status(row.to)}`;
}

/** The matches a disqualification or reinstatement changes, as the confirmation lists them. */
export function ChangeList({ rows, label }: { rows: DisqualificationRow[]; label: string }) {
  const line = useChangeLine();
  return (
    <div className="border-loss/40 bg-loss/10 rounded-lg border p-3 text-sm">
      <p className="font-medium">{label}</p>
      <ul className="mt-1 list-disc pl-5">
        {rows.map((row) => (
          <li key={row.id} className="tabular-nums">
            {line(row)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * BTC only: disqualifies a team with a reason (spec §4.5, A4). The panel and the confirmation list
 * every match that changes: all group matches of the team are annulled, or, in the knock-out, its next
 * match becomes a forfeit.
 */
export function DisqualifyForm({ teams, defaultTeamId }: { teams: DisqualifyTeam[]; defaultTeamId?: string }) {
  const t = useTranslations('Admin.match.disqualify');
  const tRoot = useTranslations();
  const line = useChangeLine();
  const [state, action, pending] = useActionState<DisqualifyState, FormData>(disqualifyTeam, undefined);
  const [teamId, setTeamId] = useState(() => teams.find((team) => team.id === defaultTeamId)?.id ?? '');
  const [reason, setReason] = useState('');

  const team = teams.find((x) => x.id === teamId) ?? null;
  const plan = team?.plan ?? null;
  const ready = plan?.ok === true && reason.trim() !== '';

  return (
    <form
      // Not `action`: React resets a form after an action, which would undo the controlled picks.
      onSubmit={(e) => {
        e.preventDefault();
        if (!team || !plan?.ok) return;
        const lines = plan.rows.map(line).join('\n');
        if (!window.confirm(t('confirm', { team: team.name, count: plan.rows.length, matches: lines }))) return;
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      aria-labelledby="disqualify-title"
      className="border-border bg-surface flex flex-col gap-3 rounded-[10px] border p-4"
    >
      <div>
        <h2 id="disqualify-title" className="font-display text-lg font-bold uppercase">
          {t('title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('hint')}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('team')}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {teams.map((x) => (
            <label key={x.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="teamId"
                value={x.id}
                checked={teamId === x.id}
                onChange={() => setTeamId(x.id)}
                required
              />
              <TeamChip name={x.name} color={x.color} />
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

      {plan &&
        (plan.ok ? (
          <>
            {plan.rows.map((row) => (
              <input key={row.id} type="hidden" name="matchIds" value={row.id} />
            ))}
            {plan.rows.length > 0 ? (
              <ChangeList rows={plan.rows} label={t(plan.forfeit ? 'affectedKo' : 'affectedGroup')} />
            ) : (
              <p className="text-muted-foreground text-sm">{t('noMatches')}</p>
            )}
          </>
        ) : (
          <p role="alert" className="text-destructive text-sm">
            {tRoot(plan.messageKey as Parameters<typeof tRoot>[0])}
          </p>
        ))}

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

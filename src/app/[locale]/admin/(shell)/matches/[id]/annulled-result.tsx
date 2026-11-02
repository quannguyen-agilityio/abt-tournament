'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState } from 'react';
import { TeamChip } from '@/components/team-chip';
import { Button } from '@/components/ui/button';
import type { DisqualificationPlan } from '@/lib/match-disqualification';
import { reinstateTeam, type ReinstateState } from './actions';
import { ChangeList, useChangeLine } from './disqualify-form';

export type AnnulledTeam = {
  id: string;
  name: string;
  color: string;
  reason: string;
  /** What reinstating the team restores; null when the viewer cannot reinstate. */
  plan: DisqualificationPlan | null;
};

/** BTC only: reinstates a team while the group is open, after a confirmation listing the restored matches. */
function ReinstateForm({ team }: { team: AnnulledTeam & { plan: DisqualificationPlan } }) {
  const t = useTranslations('Admin.match.annulled');
  const tRoot = useTranslations();
  const line = useChangeLine();
  const [state, action, pending] = useActionState<ReinstateState, FormData>(reinstateTeam, undefined);
  const { plan } = team;

  if (!plan.ok) {
    return <p className="text-muted-foreground text-sm">{tRoot(plan.messageKey as Parameters<typeof tRoot>[0])}</p>;
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const lines = plan.rows.map(line).join('\n');
        if (!window.confirm(t('confirm', { team: team.name, count: plan.rows.length, matches: lines }))) return;
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="teamId" value={team.id} />
      {plan.rows.map((row) => (
        <input key={row.id} type="hidden" name="matchIds" value={row.id} />
      ))}
      {plan.rows.length > 0 && <ChangeList rows={plan.rows} label={t('restores')} />}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {state && 'error' in state && (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${state.error}`)}
          </p>
        )}
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? t('submitting') : t('reinstate', { team: team.name })}
        </Button>
      </div>
    </form>
  );
}

/** An annulled match (spec §4.5, A4): which team was disqualified and why, and Reinstate for the BTC. */
export function AnnulledResult({ teams }: { teams: AnnulledTeam[] }) {
  const t = useTranslations('Admin.match.annulled');
  return (
    <div role="status" className="border-loss/40 bg-loss/10 flex flex-col gap-3 rounded-[10px] border p-3 text-sm">
      <p>{t('hint')}</p>
      {teams.map((team) => (
        <div key={team.id} className="border-loss/30 flex flex-col gap-2 border-t pt-3">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <TeamChip name={team.name} color={team.color} />
            {t('disqualified')}
          </p>
          <p>{t('reason', { reason: team.reason })}</p>
          {team.plan && <ReinstateForm team={{ ...team, plan: team.plan }} />}
        </div>
      ))}
    </div>
  );
}

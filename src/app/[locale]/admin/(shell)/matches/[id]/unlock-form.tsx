'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { unlockLineups, type UnlockState } from './actions';

/** BTC only: moves a locked match back to the lineup step (spec §4.1). */
export function UnlockForm({ matchId, code }: { matchId: string; code: string }) {
  const t = useTranslations('Admin.match.lock');
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlockLineups, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t('unlockConfirm', { code }))) e.preventDefault();
      }}
      className="border-border bg-surface flex flex-wrap items-center justify-end gap-3 rounded-[10px] border p-4"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <p className="text-muted-foreground mr-auto max-w-prose text-sm">{t('unlockHint')}</p>
      {state?.error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`unlockErrors.${state.error}`)}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? t('unlocking') : t('unlock')}
      </Button>
    </form>
  );
}

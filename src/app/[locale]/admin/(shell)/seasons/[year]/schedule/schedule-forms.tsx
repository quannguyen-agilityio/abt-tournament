'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { generateSchedule, type GenerateScheduleState } from './actions';

/**
 * "Generate round-robin". With matches already in place it asks first, since regenerating drops
 * their date, time, court and referee. `locked`: a group match has a lineup or a score.
 */
export function GenerateSchedule({
  seasonId,
  hasMatches,
  locked,
  teamCount,
}: {
  seasonId: string;
  hasMatches: boolean;
  locked: boolean;
  teamCount: number;
}) {
  const t = useTranslations('Admin.schedule');
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(async (prev: GenerateScheduleState, formData: FormData) => {
    const next = await generateSchedule(prev, formData);
    setConfirming(false);
    return next;
  }, undefined);
  const disabled = pending || locked || teamCount < 2;

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="seasonId" value={seasonId} />
      {hasMatches && !confirming ? (
        <Button type="button" disabled={disabled} onClick={() => setConfirming(true)}>
          {t('regenerate')}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {confirming && <span className="text-sm">{t('regenerateConfirm')}</span>}
          {confirming && (
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
          )}
          <Button
            type="submit"
            variant={confirming ? 'destructive' : 'default'}
            pending={pending}
            disabled={locked || teamCount < 2}
          >
            {pending ? t('generating') : confirming ? t('regenerate') : t('generate')}
          </Button>
        </div>
      )}
      {state && 'error' in state && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state && 'ok' in state && (
        <p role="status" className="text-sm">
          {t('generated', { count: state.count })}
        </p>
      )}
    </form>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import {
  canSetCurrent,
  SEASON_STATUSES,
  seasonStatusActions,
  type SeasonMove,
  type SeasonStatus,
} from '@/domain/season-status';
import { setCurrentSeason, setSeasonStatus } from './actions';

export function SeasonStatusPanel({
  seasonId,
  status,
  isCurrent,
}: {
  seasonId: string;
  status: SeasonStatus;
  isCurrent: boolean;
}) {
  const t = useTranslations('Admin.seasons');
  const [statusState, statusAction, moving] = useActionState(setSeasonStatus, undefined);
  const [currentState, currentAction, settingCurrent] = useActionState(setCurrentSeason, undefined);
  const statusError = statusState && 'error' in statusState ? statusState.error : undefined;
  const currentError = currentState && 'error' in currentState ? currentState.error : undefined;
  const nowIndex = SEASON_STATUSES.indexOf(status);
  const moves = seasonStatusActions(status, { isCurrent });
  const allowed = moves.filter((m) => !m.blocked);
  const blocked = moves.filter((m): m is SeasonMove & { blocked: NonNullable<SeasonMove['blocked']> } => !!m.blocked);

  return (
    <section className="border-border bg-surface flex flex-col gap-4 rounded-[10px] border p-5">
      <ol className="flex w-max max-w-full gap-6 overflow-x-auto" aria-label={t('detail.stepperLabel')}>
        {SEASON_STATUSES.map((s, i) => (
          <li
            key={s}
            aria-current={i === nowIndex ? 'step' : undefined}
            className={`flex items-center gap-2 text-sm whitespace-nowrap ${
              i === nowIndex ? 'text-foreground font-semibold' : i < nowIndex ? 'text-win' : 'text-muted-foreground'
            }`}
          >
            <b
              aria-hidden="true"
              className={`inline-flex size-6 items-center justify-center rounded-full border text-xs ${
                i === nowIndex ? 'bg-primary text-primary-foreground border-primary' : 'border-current'
              }`}
            >
              {i < nowIndex ? '✓' : i + 1}
            </b>
            {t(`status.${s}`)}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {allowed.map((m) => (
          <form key={m.to} action={statusAction}>
            <input type="hidden" name="seasonId" value={seasonId} />
            <input type="hidden" name="to" value={m.to} />
            <Button type="submit" size="sm" variant={m.to === 'draft' ? 'outline' : 'default'} disabled={moving}>
              {t(`detail.move.${m.to === 'draft' ? 'unpublish' : m.to}`)}
            </Button>
          </form>
        ))}
        {status === 'finished' && <span className="text-muted-foreground text-sm">{t('detail.finishedHint')}</span>}
      </div>
      {blocked.map((m) => (
        <p key={m.to} className="text-muted-foreground text-sm">
          {t(`detail.blocked.${m.blocked}`)}
        </p>
      ))}
      {statusError && (
        <p role="alert" className="text-destructive text-sm">
          {t(`detail.statusErrors.${statusError === 'transition' ? 'transition' : 'failed'}`)}
        </p>
      )}

      <div className="border-border flex flex-col items-start gap-2 border-t pt-4">
        {isCurrent ? (
          <p className="text-primary text-sm font-medium">{t('detail.isCurrent')}</p>
        ) : canSetCurrent(status) ? (
          <form action={currentAction}>
            <input type="hidden" name="seasonId" value={seasonId} />
            <Button type="submit" size="sm" variant="outline" disabled={settingCurrent}>
              {t('detail.setCurrent')}
            </Button>
          </form>
        ) : (
          <p className="text-muted-foreground text-sm">{t('detail.setCurrentDraft')}</p>
        )}
        {!isCurrent && <p className="text-muted-foreground text-xs">{t('detail.setCurrentHint')}</p>}
        {currentError && (
          <p role="alert" className="text-destructive text-sm">
            {t(`detail.currentErrors.${currentError === 'draft' ? 'draft' : 'failed'}`)}
          </p>
        )}
      </div>
    </section>
  );
}

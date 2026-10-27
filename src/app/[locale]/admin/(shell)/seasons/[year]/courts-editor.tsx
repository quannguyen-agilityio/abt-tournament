'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_COURT_NAME_LENGTH } from '@/lib/season-admin';
import { addCourt, deleteCourt, moveCourt, renameCourt, type CourtActionState } from './actions';

type Court = { id: string; name: string };

function errorOf(state: CourtActionState) {
  return state && 'error' in state ? state.error : undefined;
}

export function CourtsEditor({ seasonId, courts }: { seasonId: string; courts: Court[] }) {
  const t = useTranslations('Admin.seasons.courts');
  const [addState, addAction, adding] = useActionState(addCourt, undefined);
  const [renameState, renameAction, renaming] = useActionState(renameCourt, undefined);
  const [moveState, moveAction, moving] = useActionState(moveCourt, undefined);
  const [deleteState, deleteAction, deleting] = useActionState(deleteCourt, undefined);
  const busy = renaming || moving || deleting;
  const error = errorOf(renameState) ?? errorOf(moveState) ?? errorOf(deleteState);

  return (
    <div className="flex flex-col gap-3">
      {courts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label={t('listLabel')}>
          {courts.map((court, i) => (
            <li key={court.id} className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-2">
              <span className="text-muted-foreground w-5 text-sm tabular-nums" aria-hidden="true">
                {i + 1}
              </span>
              <form action={renameAction} className="flex min-w-0 flex-1 items-center gap-2">
                <input type="hidden" name="seasonId" value={seasonId} />
                <input type="hidden" name="courtId" value={court.id} />
                <Input
                  // Remounts with the saved name after a refresh.
                  key={court.name}
                  name="name"
                  defaultValue={court.name}
                  required
                  maxLength={MAX_COURT_NAME_LENGTH}
                  autoComplete="off"
                  aria-label={t('nameOf', { number: i + 1 })}
                  className="h-8 min-w-0 flex-1"
                />
                <Button type="submit" size="sm" variant="outline" disabled={busy}>
                  {t('rename')}
                </Button>
              </form>
              <div className="flex items-center gap-2">
                {(['up', 'down'] as const).map((direction) => (
                  <form key={direction} action={moveAction}>
                    <input type="hidden" name="seasonId" value={seasonId} />
                    <input type="hidden" name="courtId" value={court.id} />
                    <input type="hidden" name="direction" value={direction} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={busy || (direction === 'up' ? i === 0 : i === courts.length - 1)}
                      aria-label={t(direction === 'up' ? 'moveUp' : 'moveDown', { name: court.name })}
                    >
                      <span aria-hidden="true">{direction === 'up' ? '↑' : '↓'}</span>
                    </Button>
                  </form>
                ))}
                <form action={deleteAction}>
                  <input type="hidden" name="seasonId" value={seasonId} />
                  <input type="hidden" name="courtId" value={court.id} />
                  <Button type="submit" size="sm" variant="destructive" disabled={busy}>
                    {t('delete')}
                    <span className="sr-only"> {court.name}</span>
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${error}`, { max: MAX_COURT_NAME_LENGTH })}
        </p>
      )}
      <form action={addAction} className="flex items-center gap-2">
        <input type="hidden" name="seasonId" value={seasonId} />
        <Input
          name="name"
          required
          maxLength={MAX_COURT_NAME_LENGTH}
          autoComplete="off"
          placeholder={t('newPlaceholder')}
          aria-label={t('new')}
          aria-invalid={errorOf(addState) === 'name' || undefined}
          className="h-8 min-w-0 flex-1"
        />
        <Button type="submit" size="sm" disabled={adding}>
          {t('add')}
        </Button>
      </form>
      {errorOf(addState) && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${errorOf(addState) === 'name' ? 'name' : 'failed'}`, { max: MAX_COURT_NAME_LENGTH })}
        </p>
      )}
    </div>
  );
}

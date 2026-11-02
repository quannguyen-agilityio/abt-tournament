'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { resetUserPassword, setUserActive } from './actions';

export function UserRowActions({
  userId,
  name,
  isActive,
  isSelf,
}: {
  userId: string;
  name: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  const t = useTranslations('Admin.users');
  const [toggleState, toggleAction, toggling] = useActionState(setUserActive, undefined);
  const [resetState, resetAction, resetting] = useActionState(resetUserPassword, undefined);
  const toggleError = toggleState && 'error' in toggleState ? toggleState.error : undefined;
  const resetError = resetState && 'error' in resetState ? resetState.error : undefined;

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {!isSelf && (
          <form action={toggleAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="active" value={String(!isActive)} />
            <Button type="submit" size="sm" variant={isActive ? 'destructive' : 'outline'} disabled={toggling}>
              {isActive ? t('deactivate') : t('reactivate')}
            </Button>
          </form>
        )}
        <details className="group">
          <summary className="border-border hover:bg-muted inline-flex h-7 cursor-pointer list-none items-center rounded-lg border px-2.5 text-[0.8rem] font-medium whitespace-nowrap select-none [&::-webkit-details-marker]:hidden">
            {t('resetPassword')}
          </summary>
          <form action={resetAction} className="mt-2 flex items-center gap-2">
            <input type="hidden" name="userId" value={userId} />
            <Input
              name="password"
              type="text"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="off"
              spellCheck={false}
              aria-label={`${t('reset.newPassword')}: ${name}`}
              placeholder={t('reset.newPassword')}
              aria-invalid={resetError === 'tooShort' || resetError === 'weak' || undefined}
              className="h-7 w-44 font-mono"
            />
            <Button type="submit" size="sm" disabled={resetting}>
              {resetting ? t('reset.saving') : t('reset.submit')}
            </Button>
          </form>
        </details>
      </div>
      {toggleError && (
        <p role="alert" className="text-destructive text-xs">
          {t(`toggleErrors.${toggleError === 'self' ? 'self' : 'failed'}`)}
        </p>
      )}
      {resetError && (
        <p role="alert" className="text-destructive text-xs">
          {t(`reset.errors.${resetError}`, { min: MIN_PASSWORD_LENGTH })}
        </p>
      )}
      {resetState && 'ok' in resetState && (
        <p role="status" className="text-win text-xs">
          {t('reset.success')}
        </p>
      )}
    </div>
  );
}

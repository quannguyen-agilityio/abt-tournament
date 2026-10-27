'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { changePassword } from './actions';

export function ChangePasswordForm({ email, mustChange }: { email: string; mustChange: boolean }) {
  const t = useTranslations('Auth.changePassword');
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className="border-border bg-surface flex flex-col gap-4 rounded-[10px] border p-6">
      <h1 className="font-display text-3xl font-bold uppercase">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">{mustChange ? t('mustChangeHint') : t('hint')}</p>
      {/* Lets password managers file the new password under the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">{t('newPassword')}</Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          aria-describedby="new-password-hint"
          aria-invalid={state?.error === 'tooShort' || state?.error === 'weak' || undefined}
          className="h-9"
        />
        <span id="new-password-hint" className="text-muted-foreground text-xs">
          {t('minLength', { min: MIN_PASSWORD_LENGTH })}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-password">{t('confirm')}</Label>
        <Input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={state?.error === 'mismatch' || undefined}
          className="h-9"
        />
      </div>
      {state && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${state.error}`, { min: MIN_PASSWORD_LENGTH })}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t('saving') : t('submit')}
      </Button>
    </form>
  );
}

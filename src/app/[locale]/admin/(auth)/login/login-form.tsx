'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn } from './actions';

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations('Auth');
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="border-border bg-surface flex flex-col gap-4 rounded-[10px] border p-6">
      <h1 className="font-display text-3xl font-bold uppercase">{t('signIn')}</h1>
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">{t('email')}</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state?.email}
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">{t('password')}</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state?.error === 'invalid' || undefined}
          aria-describedby={state ? 'login-error' : undefined}
          className="h-9"
        />
      </div>
      {state && (
        <p id="login-error" role="alert" className="text-destructive text-sm">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t('signingIn') : t('signIn')}
      </Button>
      <p className="text-muted-foreground text-xs">{t('signInHint')}</p>
    </form>
  );
}

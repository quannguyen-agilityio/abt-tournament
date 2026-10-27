'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { MAX_DISPLAY_NAME_LENGTH } from '@/lib/auth/users';
import { createUser } from './actions';

// No look-alike characters (0/O, 1/l/I): the BTC reads this out or types it into a chat.
const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomPassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
}

export function CreateUserForm() {
  const t = useTranslations('Admin.users.create');
  const tRole = useTranslations('Admin');
  const [state, action, pending] = useActionState(createUser, undefined);
  const passwordRef = useRef<HTMLInputElement>(null);
  const error = state && 'error' in state ? state.error : undefined;
  // React resets the form after the action, so a failed submit refills it from the returned fields.
  const fields = state && 'error' in state ? state.fields : undefined;

  return (
    <form
      // key remounts the (uncontrolled) fields after a success, which clears them.
      key={state && 'ok' in state ? state.email : 'form'}
      action={action}
      className="border-border bg-surface flex w-full max-w-md flex-col gap-4 rounded-[10px] border p-5"
    >
      <h2 className="font-display text-xl font-bold uppercase">{t('title')}</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="user-display-name">{t('displayName')}</Label>
        <Input
          id="user-display-name"
          name="displayName"
          defaultValue={fields?.displayName}
          required
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          autoComplete="off"
          aria-invalid={error === 'displayName' || undefined}
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="user-email">{t('email')}</Label>
        <Input
          id="user-email"
          name="email"
          type="email"
          defaultValue={fields?.email}
          required
          autoComplete="off"
          aria-invalid={error === 'email' || error === 'emailTaken' || undefined}
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="user-role">{t('role')}</Label>
        <select
          id="user-role"
          name="role"
          defaultValue={fields?.role === 'btc' ? 'btc' : 'referee'}
          aria-invalid={error === 'role' || undefined}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 w-full rounded-lg border bg-transparent px-2.5 text-base outline-none focus-visible:ring-3 md:text-sm"
        >
          <option value="referee">{tRole('roleReferee')}</option>
          <option value="btc">{tRole('roleBtc')}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="user-password">{t('password')}</Label>
        <div className="flex gap-2">
          {/* Plain text on purpose: the BTC chooses this password and hands it to the user. */}
          <Input
            ref={passwordRef}
            id="user-password"
            name="password"
            type="text"
            defaultValue={fields?.password}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="user-password-hint"
            aria-invalid={error === 'tooShort' || error === 'weak' || undefined}
            className="h-9 font-mono"
          />
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => {
              if (passwordRef.current) passwordRef.current.value = randomPassword();
            }}
          >
            {t('generate')}
          </Button>
        </div>
        <span id="user-password-hint" className="text-muted-foreground text-xs">
          {t('passwordHint', { min: MIN_PASSWORD_LENGTH })}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${error}`, { min: MIN_PASSWORD_LENGTH, max: MAX_DISPLAY_NAME_LENGTH })}
        </p>
      )}
      {state && 'ok' in state && (
        <p role="status" className="text-win text-sm">
          {t('success', { email: state.email })}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t('saving') : t('submit')}
      </Button>
    </form>
  );
}

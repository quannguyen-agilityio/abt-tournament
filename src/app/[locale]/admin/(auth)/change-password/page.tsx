import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { routing } from '@/i18n/routing';
import { signOut } from '@/lib/auth/actions';
import { requireSignedIn } from '@/lib/auth/session';
import { ChangePasswordForm } from './change-password-form';

async function ChangePassword({ params }: Pick<PageProps<'/[locale]/admin/change-password'>, 'params'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Not requireStaff(): that would send a user with a temporary password straight back here.
  const staff = await requireSignedIn();
  const t = await getTranslations('Auth');

  return (
    <div className="flex flex-col gap-4">
      <ChangePasswordForm email={staff.email} mustChange={staff.mustChangePassword} />
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 break-all">{t('signedInAs', { email: staff.email })}</span>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            {t('signOut')}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function ChangePasswordPage({ params }: PageProps<'/[locale]/admin/change-password'>) {
  return (
    <Suspense>
      <ChangePassword params={params} />
    </Suspense>
  );
}

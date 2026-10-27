import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { CHANGE_PASSWORD_PATH, safeNextPath } from '@/lib/auth/paths';
import { getStaff } from '@/lib/auth/session';
import { LoginForm } from './login-form';

async function Login({ params, searchParams }: PageProps<'/[locale]/admin/login'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const { next } = await searchParams;
  const nextPath = typeof next === 'string' ? safeNextPath(next) : undefined;

  // Already signed in: skip the form. Deactivated users get `null` here, so they stay on the form.
  const staff = await getStaff();
  if (staff) redirect({ href: staff.mustChangePassword ? CHANGE_PASSWORD_PATH : (nextPath ?? '/admin'), locale });

  return <LoginForm next={nextPath} />;
}

export default function LoginPage(props: PageProps<'/[locale]/admin/login'>) {
  return (
    <Suspense>
      <Login {...props} />
    </Suspense>
  );
}

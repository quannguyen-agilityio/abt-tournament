import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { routing } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';

async function AdminHome({ params }: Pick<PageProps<'/[locale]/admin'>, 'params'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireStaff();
  const t = await getTranslations('Admin');

  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('comingSoon')}</p>
    </div>
  );
}

export default function AdminHomePage({ params }: PageProps<'/[locale]/admin'>) {
  return (
    <Suspense>
      <AdminHome params={params} />
    </Suspense>
  );
}

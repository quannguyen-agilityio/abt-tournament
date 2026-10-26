'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export function LocaleSwitcher() {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;
  const query = Object.fromEntries(searchParams.entries());

  return (
    <Link
      href={{ pathname, query } as React.ComponentProps<typeof Link>['href']}
      locale={other}
      hrefLang={other}
      aria-label={t('switchTo', { language: t(other) })}
      className={buttonVariants({ variant: 'outline' })}
    >
      {other.toUpperCase()}
    </Link>
  );
}

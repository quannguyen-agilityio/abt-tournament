'use client';

import { Loader2Icon } from 'lucide-react';
import { useLinkStatus } from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

// next-intl never prefetches a link that changes the locale, so the click waits on the server.
// A spinner in place of the label (same size, no layout shift) shows the click was taken.
function SwitchLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-busy={pending || undefined} className="relative inline-grid place-items-center">
      <span className={pending ? 'invisible' : undefined}>{label}</span>
      {pending && <Loader2Icon aria-hidden className="absolute animate-spin" />}
    </span>
  );
}

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
      <SwitchLabel label={other.toUpperCase()} />
    </Link>
  );
}

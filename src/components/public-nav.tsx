'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  ['home', ''],
  ['standings', '/standings'],
  ['matches', '/matches'],
  ['bracket', '/bracket'],
  ['teams', '/teams'],
  ['players', '/players'],
  ['awards', '/awards'],
  ['rules', '/rules'],
] as const;

export function PublicNav({ year, className }: { year: number | string; className?: string }) {
  const t = useTranslations('Nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('primary')} className={className}>
      <ul className="flex w-max gap-1">
        {ITEMS.map(([key, suffix]) => {
          const href = `/${year}${suffix}`;
          const active = suffix === '' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'text-muted-foreground hover:bg-surface-2 hover:text-foreground block rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap',
                  active && 'bg-brand-soft text-primary hover:bg-brand-soft hover:text-primary',
                )}
              >
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

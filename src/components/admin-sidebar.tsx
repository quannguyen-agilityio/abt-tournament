'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link, usePathname } from '@/i18n/navigation';
import type { AdminNavKey, AdminRole } from '@/lib/admin-nav';
import { signOut } from '@/lib/auth/actions';
import { cn } from '@/lib/utils';

type Props = {
  entries: { key: AdminNavKey; href: string }[];
  viewer: { displayName: string; email: string; role: AdminRole };
};

export function AdminSidebar({ entries, viewer }: Props) {
  const t = useTranslations('Admin');
  const tAuth = useTranslations('Auth');
  const pathname = usePathname();
  // The season entry is a prefix of the season-scoped ones, so the longest match wins.
  const active = entries
    .filter((e) => pathname === e.href || pathname.startsWith(`${e.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.key;

  return (
    <aside className="flex min-w-0 flex-col gap-3">
      <div className="border-border bg-surface rounded-[10px] border p-3">
        <div className="text-sm font-semibold">{viewer.displayName}</div>
        <div className="text-muted-foreground mb-2 text-xs break-all">{viewer.email}</div>
        <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">{t('role')}</div>
        <span className="bg-brand-soft text-primary mt-1 inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium">
          {t(viewer.role === 'btc' ? 'roleBtc' : 'roleReferee')}
        </span>
        <form action={signOut} className="mt-3">
          <Button type="submit" variant="outline" size="sm" className="w-full">
            {tAuth('signOut')}
          </Button>
        </form>
      </div>
      <nav aria-label={t('navLabel')} className="overflow-x-auto">
        <ul className="flex w-max gap-1 lg:w-auto lg:flex-col">
          {entries.map(({ key, href }) => (
            <li key={key}>
              <Link
                href={href}
                aria-current={active === key ? 'page' : undefined}
                className={cn(
                  'text-muted-foreground hover:bg-surface-2 hover:text-foreground flex items-center rounded-lg px-2.5 py-2 text-sm whitespace-nowrap',
                  active === key && 'bg-brand-soft text-primary hover:bg-brand-soft hover:text-primary font-semibold',
                )}
              >
                {t(`nav.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

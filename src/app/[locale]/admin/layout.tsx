import { connection } from 'next/server';
import { Suspense } from 'react';
import { AdminBadge } from '@/components/admin-badge';
import { AdminSidebar } from '@/components/admin-sidebar';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/wordmark';
import { adminNavFor } from '@/lib/admin-nav';
import { getViewer } from '@/lib/auth/viewer';
import { currentSeasonYear } from '@/lib/season';

async function AdminBody({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  // currentSeasonYear() reads the clock, which is request-time data under cacheComponents.
  await connection();
  const year = currentSeasonYear();
  const entries = adminNavFor(viewer.role).map((e) => ({ key: e.key, href: e.href(year) }));

  return (
    <div className="mx-auto grid w-full max-w-7xl flex-1 content-start gap-6 px-4 py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <AdminSidebar entries={entries} viewer={viewer} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<'/[locale]/admin'>) {
  return (
    <>
      <header className="border-border bg-surface/90 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Wordmark href="/" />
          <AdminBadge />
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<span className="inline-block h-8 w-[2.8rem]" />}>
              <LocaleSwitcher />
            </Suspense>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <Suspense>
        <AdminBody>{children}</AdminBody>
      </Suspense>
    </>
  );
}

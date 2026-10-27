import { Suspense } from 'react';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/wordmark';

// Bare layout for the pages a user sees before the admin shell: login and the forced password change.
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid flex-1 place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Wordmark href="/" className="text-4xl" />
        <div className="border-border mt-1 mb-6 h-1.5 border-y" aria-hidden />
        {children}
        <div className="mt-6 flex gap-2">
          <Suspense fallback={<span className="inline-block h-8 w-[2.8rem]" />}>
            <LocaleSwitcher />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}

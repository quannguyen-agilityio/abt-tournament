'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export function SiteFooter() {
  const t = useTranslations('Nav');

  return (
    <footer className="mx-auto w-full max-w-6xl px-4 pt-4 pb-10">
      <div className="border-border mb-4 h-1.5 border-y" aria-hidden />
      <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span>ABT</span>
        <Link href="/admin" className="hover:text-foreground hover:underline">
          {t('admin')} →
        </Link>
      </div>
    </footer>
  );
}

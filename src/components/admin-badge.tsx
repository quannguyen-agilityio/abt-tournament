'use client';

import { useTranslations } from 'next-intl';

export function AdminBadge() {
  const t = useTranslations('Admin');

  return (
    <span className="border-border bg-surface-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
      {t('badge')}
    </span>
  );
}

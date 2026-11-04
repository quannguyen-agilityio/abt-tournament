'use client';

import { useTranslations } from 'next-intl';

export function LoadingLabel() {
  const t = useTranslations('Common');
  return <span className="sr-only">{t('loading')}</span>;
}

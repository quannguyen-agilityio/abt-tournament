'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';

export function SeasonSwitcher({ seasons }: { seasons: number[] }) {
  const t = useTranslations('Nav');
  const router = useRouter();
  const pathname = usePathname();
  const [, year, ...rest] = pathname.split('/');
  const options = seasons.includes(Number(year)) ? seasons : [Number(year), ...seasons].sort((a, b) => b - a);

  return (
    <>
      <label htmlFor="season-select" className="sr-only">
        {t('season')}
      </label>
      <select
        id="season-select"
        value={year}
        onChange={(e) => router.push(`/${[e.target.value, ...rest].join('/')}`)}
        className="num border-border bg-background h-8 rounded-lg border px-2 text-sm font-semibold"
      >
        {options.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </>
  );
}

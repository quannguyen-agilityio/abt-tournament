'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { NativeSelect } from '@/components/ui/native-select';

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
      <NativeSelect
        id="season-select"
        value={year}
        onChange={(e) => router.push(`/${[e.target.value, ...rest].join('/')}`)}
        className="num border-border bg-background w-auto font-semibold"
      >
        {options.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </NativeSelect>
    </>
  );
}

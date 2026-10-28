'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { filtersToQuery, type MatchFilters } from '@/lib/public-matches';

const SELECT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 bg-surface h-9 w-full min-w-0 rounded-lg border px-2 text-sm outline-none focus-visible:ring-3';

type Option = { value: string; label: string };

/** P3 filters. Each change replaces the query string, so a filtered view can be shared. */
export function MatchFiltersForm({
  filters,
  days,
  teams,
  courts,
}: {
  filters: MatchFilters;
  days: Option[];
  teams: Option[];
  courts: Option[];
}) {
  const t = useTranslations('Public.matches');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const set = (key: keyof MatchFilters, value: string) => {
    const query = filtersToQuery({ ...filters, [key]: value || null });
    startTransition(() => router.replace({ pathname, query }, { scroll: false }));
  };
  const active = Object.keys(filtersToQuery(filters)).length > 0;

  const field = (key: keyof MatchFilters, label: string, options: Option[]) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{label}</span>
      <select className={SELECT} value={filters[key] ?? ''} onChange={(e) => set(key, e.target.value)}>
        <option value="">{t('all')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form
      aria-label={t('filters')}
      aria-busy={pending}
      className="mb-6 grid grid-cols-2 items-end gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
      onSubmit={(e) => e.preventDefault()}
    >
      {field('day', t('day'), days)}
      {field('team', t('team'), teams)}
      {field('court', t('court'), courts)}
      {field('stage', t('stage'), [
        { value: 'group', label: t('stageGroup') },
        { value: 'ko', label: t('stageKo') },
      ])}
      {active && (
        <button
          type="button"
          className="text-primary col-span-2 h-9 justify-self-start text-sm font-medium hover:underline sm:col-span-1"
          onClick={() => startTransition(() => router.replace({ pathname, query: {} }, { scroll: false }))}
        >
          {t('clear')}
        </button>
      )}
    </form>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { playerFiltersToQuery, type PlayerFilters } from '@/lib/public-players';

const SELECT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 bg-surface h-9 w-full min-w-0 rounded-lg border px-2 text-sm outline-none focus-visible:ring-3';

type Option = { value: string; label: string };

/** P7 filters. Each change replaces the query string, so a filtered list can be shared. */
export function PlayerFiltersForm({
  filters,
  teams,
  maxRank,
}: {
  filters: PlayerFilters;
  teams: Option[];
  maxRank: number;
}) {
  const t = useTranslations('Public.players');
  const tp = useTranslations('Public');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const set = (key: keyof PlayerFilters, value: string) => {
    const next = { ...filters, [key]: value === '' ? null : key === 'rank' ? Number(value) : value };
    startTransition(() => router.replace({ pathname, query: playerFiltersToQuery(next) }, { scroll: false }));
  };
  const active = Object.keys(playerFiltersToQuery(filters)).length > 0;

  const field = (key: keyof PlayerFilters, label: string, options: Option[]) => (
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
      className="mb-6 grid grid-cols-2 items-end gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="col-span-2 sm:col-span-1">{field('team', t('team'), teams)}</div>
      {field(
        'rank',
        t('rank'),
        Array.from({ length: maxRank }, (_, i) => ({ value: String(i + 1), label: t('rankOption', { rank: i + 1 }) })),
      )}
      {field('gender', t('gender'), [
        { value: 'male', label: tp('gender.male') },
        { value: 'female', label: tp('gender.female') },
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

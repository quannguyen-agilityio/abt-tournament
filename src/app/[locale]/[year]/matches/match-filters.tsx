'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { filtersToQuery, type MatchFilters } from '@/lib/public-matches';
import { NativeSelect } from '@/components/ui/native-select';

const SELECT = 'bg-surface h-9';

type Option = { value: string; label: string };

/** P3 filters. Each change replaces the query string, so a filtered view can be shared. */
export function MatchFiltersForm({
  filters,
  days,
  teams,
  courts,
  liveCount,
}: {
  filters: MatchFilters;
  days: Option[];
  teams: Option[];
  courts: Option[];
  /** Matches scored live right now; the quick filter shows while there is one (spec-phase-2 §8.2). */
  liveCount: number;
}) {
  const t = useTranslations('Public.matches');
  const tl = useTranslations('Public.live');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const set = (key: keyof MatchFilters, value: string | null) => {
    const query = filtersToQuery({ ...filters, [key]: value || null });
    startTransition(() => router.replace({ pathname, query }, { scroll: false }));
  };
  const active = Object.keys(filtersToQuery(filters)).length > 0;

  const field = (key: keyof MatchFilters, label: string, options: Option[]) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{label}</span>
      <NativeSelect className={SELECT} value={filters[key] ?? ''} onChange={(e) => set(key, e.target.value)}>
        <option value="">{t('all')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );

  const quick = (on: boolean, label: React.ReactNode) => (
    <button
      type="button"
      aria-pressed={Boolean(filters.live) === on}
      onClick={() => set('live', on ? '1' : null)}
      className="border-border bg-surface hover:bg-surface-2 aria-pressed:bg-foreground aria-pressed:text-surface inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold aria-pressed:border-transparent"
    >
      {label}
    </button>
  );

  return (
    <>
      {(liveCount > 0 || filters.live) && (
        <div role="group" aria-label={tl('quickFilter')} className="mb-4 flex flex-wrap items-center gap-2">
          {quick(false, t('all'))}
          {quick(
            true,
            <>
              <span aria-hidden className="bg-loss size-1.5 rounded-full motion-safe:animate-pulse" />
              {tl('filter')}
              <span className="tabular-nums opacity-70">{liveCount}</span>
            </>,
          )}
        </div>
      )}
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
    </>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_SEASON_NAME_LENGTH, MAX_SEASON_VENUE_LENGTH, MAX_SEASON_YEAR, MIN_SEASON_YEAR } from '@/lib/season-admin';
import { createSeason } from './actions';

export function CreateSeasonForm({ sources }: { sources: { id: string; name: string }[] }) {
  const t = useTranslations('Admin.seasons.create');
  const [state, action, pending] = useActionState(createSeason, undefined);
  const error = state?.error;
  // React resets the form after the action, so a failed submit refills it from the returned fields.
  const fields = state?.fields;
  const [year, setYear] = useState('');

  return (
    <form
      action={action}
      className="border-border bg-surface flex w-full max-w-md flex-col gap-4 rounded-[10px] border p-5"
    >
      <h2 className="font-display text-xl font-bold uppercase">{t('title')}</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-season-year">{t('year')}</Label>
        <Input
          id="new-season-year"
          name="year"
          type="number"
          inputMode="numeric"
          defaultValue={fields?.year}
          onChange={(e) => setYear(e.target.value)}
          required
          min={MIN_SEASON_YEAR}
          max={MAX_SEASON_YEAR}
          autoComplete="off"
          aria-invalid={error === 'year' || error === 'yearTaken' || undefined}
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-season-name">{t('name')}</Label>
        <Input
          id="new-season-name"
          name="name"
          defaultValue={fields?.name}
          placeholder={t('namePlaceholder', { year: year || fields?.year || 'YYYY' })}
          maxLength={MAX_SEASON_NAME_LENGTH}
          autoComplete="off"
          aria-describedby="new-season-name-hint"
          aria-invalid={error === 'name' || undefined}
          className="h-9"
        />
        <span id="new-season-name-hint" className="text-muted-foreground text-xs">
          {t('nameHint')}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-season-venue">{t('venue')}</Label>
        <Input
          id="new-season-venue"
          name="venue"
          defaultValue={fields?.venue}
          maxLength={MAX_SEASON_VENUE_LENGTH}
          autoComplete="off"
          aria-invalid={error === 'venue' || undefined}
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-season-source">{t('source')}</Label>
        <select
          id="new-season-source"
          name="source"
          defaultValue={fields?.source ?? sources[0]?.id ?? ''}
          aria-describedby="new-season-source-hint"
          aria-invalid={error === 'source' || undefined}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 w-full rounded-lg border bg-transparent px-2.5 text-base outline-none focus-visible:ring-3 md:text-sm"
        >
          <option value="">{t('sourceNone')}</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {t('sourceClone', { name: s.name })}
            </option>
          ))}
        </select>
        <span id="new-season-source-hint" className="text-muted-foreground text-xs">
          {t('sourceHint')}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${error}`, {
            min: MIN_SEASON_YEAR,
            max: MAX_SEASON_YEAR,
            nameMax: MAX_SEASON_NAME_LENGTH,
            venueMax: MAX_SEASON_VENUE_LENGTH,
          })}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t('saving') : t('submit')}
      </Button>
    </form>
  );
}

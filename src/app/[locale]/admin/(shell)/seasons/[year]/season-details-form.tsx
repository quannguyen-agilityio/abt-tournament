'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_SEASON_NAME_LENGTH, MAX_SEASON_VENUE_LENGTH } from '@/lib/season-admin';
import { updateSeasonDetails } from './actions';

export function SeasonDetailsForm({
  seasonId,
  year,
  name,
  venue,
  matchDays,
}: {
  seasonId: string;
  year: number;
  name: string;
  venue: string;
  matchDays: string[];
}) {
  const t = useTranslations('Admin.seasons.detail');
  const [state, action, pending] = useActionState(updateSeasonDetails, undefined);
  const error = state && 'error' in state ? state.error : undefined;
  // React resets the form after the action, so a failed submit refills it from the returned fields.
  const fields = state && 'fields' in state ? state.fields : undefined;
  // Each row has a stable key so removing one does not shift the values typed into the others.
  const nextKey = useRef(matchDays.length);
  const [days, setDays] = useState(() => matchDays.map((value, key) => ({ key, value })));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="seasonId" value={seasonId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="season-year">{t('year')}</Label>
        <Input id="season-year" value={year} readOnly className="h-9" />
        <span className="text-muted-foreground text-xs">{t('yearHint')}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="season-name">{t('name')}</Label>
        <Input
          id="season-name"
          name="name"
          defaultValue={fields?.name ?? name}
          required
          maxLength={MAX_SEASON_NAME_LENGTH}
          autoComplete="off"
          aria-invalid={error === 'name' || undefined}
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="season-venue">{t('venue')}</Label>
        <Input
          id="season-venue"
          name="venue"
          defaultValue={fields?.venue ?? venue}
          maxLength={MAX_SEASON_VENUE_LENGTH}
          autoComplete="off"
          aria-invalid={error === 'venue' || undefined}
          className="h-9"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('matchDays')}</legend>
        {days.length === 0 && <p className="text-muted-foreground text-sm">{t('matchDaysEmpty')}</p>}
        {days.map((d, i) => (
          <div key={d.key} className="flex items-center gap-2">
            <Input
              type="date"
              name="matchDays"
              value={d.value}
              onChange={(e) =>
                setDays((all) => all.map((x) => (x.key === d.key ? { ...x, value: e.target.value } : x)))
              }
              aria-label={t('matchDay', { number: i + 1 })}
              className="h-9 max-w-44"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDays((all) => all.filter((x) => x.key !== d.key))}
            >
              {t('removeDay')}
              <span className="sr-only"> {t('matchDay', { number: i + 1 })}</span>
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDays((all) => [...all, { key: nextKey.current++, value: '' }])}
          >
            {t('addDay')}
          </Button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${error}`, { nameMax: MAX_SEASON_NAME_LENGTH, venueMax: MAX_SEASON_VENUE_LENGTH })}
        </p>
      )}
      {state && 'ok' in state && (
        <p role="status" className="text-win text-sm">
          {t('saved')}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}

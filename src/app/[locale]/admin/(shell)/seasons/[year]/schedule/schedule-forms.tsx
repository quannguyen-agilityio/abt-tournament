'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateSchedule, updateMatchSlot, type GenerateScheduleState, type MatchSlotState } from './actions';

const SELECT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 min-w-0 rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:ring-3';

/**
 * "Generate round-robin". With matches already in place it asks first, since regenerating drops
 * their date, time, court and referee. `locked`: a group match has a lineup or a score.
 */
export function GenerateSchedule({
  seasonId,
  hasMatches,
  locked,
  teamCount,
}: {
  seasonId: string;
  hasMatches: boolean;
  locked: boolean;
  teamCount: number;
}) {
  const t = useTranslations('Admin.schedule');
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(async (prev: GenerateScheduleState, formData: FormData) => {
    const next = await generateSchedule(prev, formData);
    setConfirming(false);
    return next;
  }, undefined);
  const disabled = pending || locked || teamCount < 2;

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="seasonId" value={seasonId} />
      {hasMatches && !confirming ? (
        <Button type="button" disabled={disabled} onClick={() => setConfirming(true)}>
          {t('regenerate')}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {confirming && <span className="text-sm">{t('regenerateConfirm')}</span>}
          {confirming && (
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
          )}
          <Button type="submit" variant={confirming ? 'destructive' : 'default'} disabled={disabled}>
            {pending ? t('generating') : confirming ? t('regenerate') : t('generate')}
          </Button>
        </div>
      )}
      {state && 'error' in state && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state && 'ok' in state && (
        <p role="status" className="text-sm">
          {t('generated', { count: state.count })}
        </p>
      )}
    </form>
  );
}

export type SlotFormMatch = {
  id: string;
  code: string;
  label: string;
  date: string;
  time: string;
  courtId: string;
  refereeId: string;
};

/** Date, time, court and referee of one match, saved together. */
export function MatchSlotForm({
  seasonId,
  match,
  days,
  courts,
  referees,
}: {
  seasonId: string;
  match: SlotFormMatch;
  days: { value: string; label: string }[];
  courts: { id: string; name: string }[];
  referees: { id: string; name: string }[];
}) {
  const t = useTranslations('Admin.schedule');
  const [state, action, saving] = useActionState<MatchSlotState, FormData>(updateMatchSlot, undefined);
  const errors = state && 'errors' in state ? state.errors : [];
  // Remounts the fields with the saved values after a refresh.
  const key = `${match.date}|${match.time}|${match.courtId}|${match.refereeId}`;

  return (
    <form action={action} aria-label={t('slotOf', { code: match.code })} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="matchId" value={match.id} />
      <span className="font-display w-12 font-bold">{match.code}</span>
      <span className="min-w-40 flex-1 truncate text-sm">{match.label}</span>
      <select
        key={`d-${key}`}
        name="date"
        defaultValue={match.date}
        aria-label={t('date')}
        aria-invalid={errors.includes('dateTime') || undefined}
        className={SELECT}
      >
        <option value="">{t('noDate')}</option>
        {days.map((day) => (
          <option key={day.value} value={day.value}>
            {day.label}
          </option>
        ))}
      </select>
      <Input
        key={`t-${key}`}
        type="time"
        name="time"
        step={300}
        defaultValue={match.time}
        aria-label={t('time')}
        aria-invalid={errors.includes('dateTime') || undefined}
        className="h-8 w-28"
      />
      <select
        key={`c-${key}`}
        name="courtId"
        defaultValue={match.courtId}
        aria-label={t('court')}
        aria-invalid={errors.includes('court') || undefined}
        className={SELECT}
      >
        <option value="">{t('noCourt')}</option>
        {courts.map((court) => (
          <option key={court.id} value={court.id}>
            {court.name}
          </option>
        ))}
      </select>
      <select
        key={`r-${key}`}
        name="refereeId"
        defaultValue={match.refereeId}
        aria-label={t('referee')}
        aria-invalid={errors.includes('referee') || undefined}
        className={SELECT}
      >
        <option value="">{t('noReferee')}</option>
        {referees.map((referee) => (
          <option key={referee.id} value={referee.id}>
            {referee.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={saving}>
        {saving ? t('saving') : t('save')}
        <span className="sr-only"> {match.code}</span>
      </Button>
      {state && 'error' in state && (
        <p role="alert" className="text-destructive basis-full text-sm">
          {t('errors.failed')}
        </p>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="text-destructive basis-full text-sm">
          {errors.map((error) => (
            <li key={error}>{t(`errors.${error}`)}</li>
          ))}
        </ul>
      )}
    </form>
  );
}

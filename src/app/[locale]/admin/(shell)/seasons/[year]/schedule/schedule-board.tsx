'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { MatchStatusBadge, type MatchStatus } from '@/components/match-status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useLeaveWarning } from '@/components/use-leave-warning';
import { findScheduleConflicts } from '@/domain/schedule';
import { formatDay } from '@/lib/format';
import { scheduleGrid, utcToZoned, type MatchSlotError, type SlotFields } from '@/lib/schedule';
import {
  EMPTY_SLOT_DRAFT,
  draftChanges,
  draftErrors,
  draftSlot,
  editSlot,
  normalizeSlotDraft,
  slotStart,
  type DraftMatch,
  type SlotDraft,
} from '@/lib/schedule-draft';
import { saveMatchSlots } from './actions';

const CELL = 'px-3 py-2 align-top';
const SELECT = 'w-auto';

export type BoardMatch = DraftMatch & {
  code: string;
  status: MatchStatus;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

type Named = { id: string; name: string };

type SaveError = 'invalid' | 'slotsLocked' | 'saveFailed';

/**
 * Conflicts, the days × courts grid and the slot of every match. Editing a slot only changes a draft
 * on the page, which the grid and the conflicts already follow, until Save sends every changed slot
 * in one request; Discard goes back to the saved schedule.
 */
export function ScheduleBoard({
  seasonId,
  timezone,
  matchDays,
  matches,
  teams,
  courts,
  referees,
}: {
  seasonId: string;
  timezone: string;
  matchDays: string[];
  matches: BoardMatch[];
  teams: (Named & { color: string })[];
  courts: Named[];
  /** Selectable referees: active accounts, and inactive ones still on a match. */
  referees: Named[];
}) {
  const t = useTranslations('Admin.schedule');
  const locale = useLocale() as 'vi' | 'en';
  const [pending, startTransition] = useTransition();
  const [rawDraft, setDraft] = useState<SlotDraft>(EMPTY_SLOT_DRAFT);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, MatchSlotError[]>>({});
  // Normalized against the saved schedule on every render, so a refresh rebases the draft.
  const draft = normalizeSlotDraft(matches, rawDraft);
  const changes = Object.keys(draft).length;
  useLeaveWarning(changes > 0 ? t('leaveConfirm') : null);

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const courtName = new Map(courts.map((court) => [court.id, court.name]));
  const refereeName = new Map(referees.map((referee) => [referee.id, referee.name]));
  const codeOf = new Map(matches.map((m) => [m.id, m.code]));

  // The schedule as it will be once the draft is saved.
  const shown = matches.map((m) => {
    const slot = draftSlot(m, draft);
    return {
      ...m,
      slot,
      scheduled_at: slotStart(slot, timezone),
      courtId: slot.courtId || null,
      refereeId: slot.refereeId || null,
    };
  });

  const conflicts = findScheduleConflicts(
    shown.map((m) => ({
      id: m.id,
      startsAt: m.scheduled_at,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      courtId: m.courtId,
      refereeId: m.refereeId,
    })),
  );
  const conflicted = new Set(conflicts.flatMap((c) => c.matchIds));
  const conflictMessages = conflicts.map((c) => {
    const { date, time } = utcToZoned(new Date(c.startsAt), timezone);
    const subject =
      c.kind === 'team'
        ? (teamById.get(c.subjectId)?.name ?? '')
        : c.kind === 'referee'
          ? (refereeName.get(c.subjectId) ?? '')
          : (courtName.get(c.subjectId) ?? '');
    return t(`conflicts.${c.kind}`, {
      when: `${formatDay(date, locale)} ${time}`,
      subject,
      matches: c.matchIds.map((id) => codeOf.get(id)).join(', '),
    });
  });

  const grid = scheduleGrid(shown, matchDays, timezone);
  // A column for matches that have a time but no court yet, only when there are some.
  const columns = [
    ...courts.map((court) => ({ id: court.id as string | null, name: court.name })),
    ...(shown.some((m) => m.scheduled_at && !m.courtId) ? [{ id: null, name: t('noCourt') }] : []),
  ];
  // Days of the season, plus any other day a match is on.
  const dayOptions = grid.days.map((day) => ({ value: day.date, label: formatDay(day.date, locale) }));
  const teamsLabel = (m: BoardMatch) =>
    m.homeTeamId && m.awayTeamId
      ? `${teamById.get(m.homeTeamId)?.name ?? ''} – ${teamById.get(m.awayTeamId)?.name ?? ''}`
      : t('tbd');

  function edit(match: BoardMatch, patch: Partial<SlotFields>) {
    setDraft(editSlot(draft, match, patch));
    if (match.id in rowErrors) {
      setRowErrors(Object.fromEntries(Object.entries(rowErrors).filter(([id]) => id !== match.id)));
    }
  }

  function save() {
    const errors = draftErrors(draft, timezone);
    if (Object.keys(errors).length > 0) {
      setRowErrors(errors);
      setSaveError('invalid');
      return;
    }
    startTransition(async () => {
      const result = await saveMatchSlots(seasonId, draftChanges(draft));
      if ('ok' in result && result.ok) {
        setDraft(EMPTY_SLOT_DRAFT);
        setRowErrors({});
        setSaveError(null);
      } else if ('errors' in result) {
        setRowErrors(result.errors);
        setSaveError('invalid');
      } else {
        setRowErrors({});
        setSaveError(result.error === 'locked' ? 'slotsLocked' : 'saveFailed');
      }
    });
  }

  function discard() {
    setDraft(EMPTY_SLOT_DRAFT);
    setRowErrors({});
    setSaveError(null);
  }

  const card = (m: (typeof shown)[number]) => (
    <div
      key={m.id}
      className={`flex min-w-44 flex-col gap-1 rounded-lg border p-2 ${conflicted.has(m.id) ? 'border-loss bg-loss/10' : m.id in draft ? 'border-warn' : 'border-border'}`}
    >
      <div className="flex items-center gap-2">
        <b className="font-display">{m.code}</b>
        <MatchStatusBadge status={m.status} />
      </div>
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {m.homeTeamId && m.awayTeamId ? (
          [m.homeTeamId, m.awayTeamId].map((id, i) => (
            <span key={id} className="inline-flex items-center gap-1">
              {i === 1 && <span className="text-muted-foreground">–</span>}
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: teamById.get(id)?.color }}
              />
              {teamById.get(id)?.name}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">{t('tbd')}</span>
        )}
      </div>
      <div className="text-muted-foreground text-xs">
        {m.refereeId ? t('refereeIs', { name: refereeName.get(m.refereeId) ?? '' }) : t('noReferee')}
      </div>
    </div>
  );

  return (
    <>
      {(changes > 0 || saveError) && (
        <section
          aria-label={t('unsaved', { count: changes })}
          className="border-warn/40 bg-surface sticky top-16 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border p-3 shadow-sm"
        >
          <p role="status" className="text-warn text-sm font-medium">
            {t('unsaved', { count: changes })}
          </p>
          {saveError && (
            <p role="alert" className="text-destructive basis-full text-sm sm:order-last">
              {t(`errors.${saveError}`)}
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={discard}>
              {t('discard')}
            </Button>
            <Button type="button" size="sm" disabled={pending || changes === 0} onClick={save}>
              {pending ? t('saving') : t('save')}
            </Button>
          </div>
        </section>
      )}

      {conflictMessages.length > 0 ? (
        <section
          aria-label={t('conflicts.title')}
          className="border-loss/40 bg-loss/10 flex flex-col gap-1 rounded-[10px] border p-4 text-sm"
        >
          <h2 className="font-semibold">{t('conflicts.title')}</h2>
          <ul className="list-disc pl-5">
            {conflictMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p role="status" className="border-border bg-surface rounded-[10px] border p-3 text-sm">
          <span className="text-win font-semibold">✓</span> {t('conflicts.none')}
        </p>
      )}

      {grid.days.map((day) => (
        <section key={day.date} className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-bold uppercase">{formatDay(day.date, locale)}</h2>
          {day.times.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('dayEmpty')}</p>
          ) : (
            <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
              <table
                className="w-full border-collapse text-left text-sm"
                aria-label={t('gridLabel', { day: formatDay(day.date, locale) })}
              >
                <thead>
                  <tr className="text-muted-foreground text-xs uppercase">
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t('time')}
                    </th>
                    {columns.map((column) => (
                      <th key={column.id ?? 'none'} scope="col" className="px-3 py-2 font-medium">
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {day.times.map(({ time, matches: atTime }) => (
                    <tr key={time} className="border-border border-t">
                      <th scope="row" className={`${CELL} font-display text-lg font-semibold tabular-nums`}>
                        {time}
                      </th>
                      {columns.map((column) => {
                        const here = atTime.filter((m) => m.courtId === column.id);
                        return (
                          <td key={column.id ?? 'none'} className={CELL}>
                            {here.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <div className="flex flex-col gap-2">{here.map(card)}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {grid.unscheduled.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-bold uppercase">
            {t('unscheduled', { count: grid.unscheduled.length })}
          </h2>
          <div className="flex flex-wrap gap-2">{grid.unscheduled.map(card)}</div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase">{t('assign')}</h2>
        <p className="text-muted-foreground text-sm">{t('assignHint', { timezone })}</p>
        <ul className="border-border bg-surface divide-border divide-y rounded-[10px] border">
          {shown.map((m) => {
            const errors = rowErrors[m.id] ?? [];
            const changed = m.id in draft;
            const disabled = pending || m.locked;
            return (
              <li
                key={m.id}
                className={`p-3 ${conflicted.has(m.id) ? 'bg-loss/10' : changed ? 'bg-warn/10' : ''} ${changed ? 'border-l-warn border-l-4' : ''}`}
              >
                <div
                  role="group"
                  aria-label={t('slotOf', { code: m.code })}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="font-display w-12 font-bold">{m.code}</span>
                  <span className="min-w-40 flex-1 truncate text-sm">{teamsLabel(m)}</span>
                  {changed && (
                    <span className="bg-warn/15 text-warn rounded-full px-2 py-0.5 text-xs font-medium">
                      {t('changed')}
                    </span>
                  )}
                  <NativeSelect
                    value={m.slot.date}
                    disabled={disabled}
                    aria-label={t('date')}
                    aria-invalid={errors.includes('dateTime') || undefined}
                    className={SELECT}
                    onChange={(e) => edit(m, { date: e.target.value })}
                  >
                    <option value="">{t('noDate')}</option>
                    {dayOptions.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input
                    type="time"
                    step={300}
                    value={m.slot.time}
                    disabled={disabled}
                    aria-label={t('time')}
                    aria-invalid={errors.includes('dateTime') || undefined}
                    className="h-8 w-28"
                    onChange={(e) => edit(m, { time: e.target.value })}
                  />
                  <NativeSelect
                    value={m.slot.courtId}
                    disabled={disabled}
                    aria-label={t('court')}
                    aria-invalid={errors.includes('court') || undefined}
                    className={SELECT}
                    onChange={(e) => edit(m, { courtId: e.target.value })}
                  >
                    <option value="">{t('noCourt')}</option>
                    {courts.map((court) => (
                      <option key={court.id} value={court.id}>
                        {court.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    value={m.slot.refereeId}
                    disabled={disabled}
                    aria-label={t('referee')}
                    aria-invalid={errors.includes('referee') || undefined}
                    className={SELECT}
                    onChange={(e) => edit(m, { refereeId: e.target.value })}
                  >
                    <option value="">{t('noReferee')}</option>
                    {referees.map((referee) => (
                      <option key={referee.id} value={referee.id}>
                        {referee.name}
                      </option>
                    ))}
                  </NativeSelect>
                  {m.locked && <p className="text-muted-foreground basis-full text-xs">{t('rowLocked')}</p>}
                  {errors.length > 0 && (
                    <ul role="alert" className="text-destructive basis-full text-sm">
                      {errors.map((error) => (
                        <li key={error}>{t(`errors.${error}`)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

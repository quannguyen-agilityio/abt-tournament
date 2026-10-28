import { isUuid } from './auth/users';
import { isIsoDate } from './season-admin';

export type MatchSlotInput = {
  /** UTC start, or `null` to unschedule. */
  scheduledAt: Date | null;
  courtId: string | null;
  refereeId: string | null;
};

export type MatchSlotError = 'dateTime' | 'court' | 'referee';

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** `HH:mm`, 24h. */
function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return local - Math.floor(instant / 1000) * 1000;
}

/** The instant a wall-clock `YYYY-MM-DD` + `HH:mm` names in `timeZone`. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const wall = Date.parse(`${date}T${time}:00Z`);
  // A second pass settles the offset when the first guess lands across a DST change.
  const first = wall - zoneOffset(wall, timeZone);
  return new Date(wall - zoneOffset(first, timeZone));
}

/** Wall-clock date (`YYYY-MM-DD`) and time (`HH:mm`) of `instant` in `timeZone`. */
export function utcToZoned(instant: Date, timeZone: string): { date: string; time: string } {
  const local = new Date(instant.getTime() + zoneOffset(instant.getTime(), timeZone)).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

/**
 * Validates the slot form of one match. Date and time are wall-clock values in the season
 * timezone and come together: both blank unschedules the match. Blank court or referee clears it.
 */
export function parseMatchSlot(
  formData: FormData,
  timeZone: string,
): { ok: true; value: MatchSlotInput } | { ok: false; errors: MatchSlotError[] } {
  const errors: MatchSlotError[] = [];
  const date = text(formData, 'date');
  const time = text(formData, 'time');
  let scheduledAt: Date | null = null;
  if (date || time) {
    if (isIsoDate(date) && isTime(time)) scheduledAt = zonedToUtc(date, time, timeZone);
    else errors.push('dateTime');
  }
  const courtId = text(formData, 'courtId');
  if (courtId && !isUuid(courtId)) errors.push('court');
  const refereeId = text(formData, 'refereeId');
  if (refereeId && !isUuid(refereeId)) errors.push('referee');

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { scheduledAt, courtId: courtId || null, refereeId: refereeId || null } };
}

export type GridMatch = { id: string; scheduled_at: string | null };

export type ScheduleDay<M extends GridMatch> = {
  date: string;
  /** Start times of the day in order, each with its matches. */
  times: { time: string; matches: M[] }[];
};

/**
 * Lays scheduled matches out by local day, then time (the A4 grid). Every match day gets a
 * section, even an empty one; matches on other days get one too. Unscheduled matches are returned
 * apart, in input order.
 */
export function scheduleGrid<M extends GridMatch>(
  matches: readonly M[],
  matchDays: readonly string[],
  timeZone: string,
): { days: ScheduleDay<M>[]; unscheduled: M[] } {
  const byDay = new Map<string, Map<string, M[]>>(matchDays.map((d) => [d, new Map()]));
  const unscheduled: M[] = [];
  for (const m of matches) {
    if (!m.scheduled_at) {
      unscheduled.push(m);
      continue;
    }
    const { date, time } = utcToZoned(new Date(m.scheduled_at), timeZone);
    if (!byDay.has(date)) byDay.set(date, new Map());
    const times = byDay.get(date)!;
    times.set(time, [...(times.get(time) ?? []), m]);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, times]) => ({
      date,
      times: [...times.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, ms]) => ({ time, matches: ms })),
    }));
  return { days, unscheduled };
}

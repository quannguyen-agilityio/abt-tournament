import { utcToZoned } from './schedule';

export type StaffListMatch = {
  code: string;
  scheduled_at: string | null;
  referee_id: string | null;
};

export type StaffMatchGroups<M extends StaffListMatch> = {
  /** Matches the viewer referees, whatever the day. */
  mine: M[];
  /** Other matches on today's date in the season timezone. */
  today: M[];
  rest: M[];
};

function byTimeThenCode(a: StaffListMatch, b: StaffListMatch): number {
  if (a.scheduled_at !== b.scheduled_at) {
    if (!a.scheduled_at) return 1;
    if (!b.scheduled_at) return -1;
    return Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at);
  }
  return a.code.localeCompare(b.code, 'en', { numeric: true });
}

/**
 * Splits the staff match list (A5): the viewer's own matches first, then today's, then the rest.
 * Each group runs by start time, unscheduled matches last, then by code.
 */
export function groupStaffMatches<M extends StaffListMatch>(
  matches: readonly M[],
  viewerId: string,
  now: Date,
  timeZone: string,
): StaffMatchGroups<M> {
  const today = utcToZoned(now, timeZone).date;
  const groups: StaffMatchGroups<M> = { mine: [], today: [], rest: [] };
  for (const m of [...matches].sort(byTimeThenCode)) {
    if (m.referee_id === viewerId) groups.mine.push(m);
    else if (m.scheduled_at && utcToZoned(new Date(m.scheduled_at), timeZone).date === today) groups.today.push(m);
    else groups.rest.push(m);
  }
  return groups;
}

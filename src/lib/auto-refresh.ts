import { utcToZoned } from './schedule';

/** How often P1–P5 refresh on match days (spec §5). */
export const REFRESH_INTERVAL_MS = 30_000;

/** Whether `now` falls on one of the season's match days, in the season timezone. */
export function isMatchDay(matchDays: readonly string[], now: Date, timeZone: string): boolean {
  return matchDays.includes(utcToZoned(now, timeZone).date);
}

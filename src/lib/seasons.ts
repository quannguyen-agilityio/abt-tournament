import { currentSeasonYear } from './season';

/** Season years newest first, without duplicates. */
export function sortYearsDesc(years: number[]): number[] {
  return [...new Set(years)].sort((a, b) => b - a);
}

/** The year of the season marked current, or the calendar year when no season is. */
export function resolveCurrentYear(currentRow: { year: number } | null | undefined, now?: Date): number {
  return currentRow ? currentRow.year : currentSeasonYear(now);
}

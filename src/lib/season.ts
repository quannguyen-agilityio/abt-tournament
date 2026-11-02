export const DEFAULT_SEASON_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * The season year the public site opens on: the current calendar year in the
 * season timezone. Becomes "the season marked current" once the season table
 * exists (issue #7).
 */
export function currentSeasonYear(now: Date = new Date(), timeZone = DEFAULT_SEASON_TIMEZONE): number {
  const year = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(now);
  return Number(year);
}
